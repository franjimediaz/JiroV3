// Explicit opt-in: reads the configured Supabase project; never runs in pnpm test.
// Uses the local server key to check PostgREST semantics, NOT end-user permissions/RLS.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

if (!process.argv.includes("--readonly")) throw Error("Pass --readonly to run live SELECT checks");
process.loadEnvFile("apps/web/.env.local");
const require = createRequire(resolve("apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");
const client = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      assert.ok(["GET", "HEAD"].includes(init?.method || "GET"), "Only read requests are allowed");
      return fetch(input, { ...init, signal: AbortSignal.timeout(20000) });
    } },
  });
const { data: modules, error: moduleError } = await client.from("modulos").select("slug,props");
assert.equal(moduleError, null, "Cannot read configured schemas");
const schemas = new Map(modules.map(row => [row.slug, typeof row.props === "string" ? JSON.parse(row.props) : row.props]));
const dependencies = {
  resolveModuleConfig: async slug => {
    const schema = schemas.get(slug);
    assert.ok(schema?.db?.table, "Related schema must exist");
    return { schema, table: schema.db.table, permissionsKey: slug };
  },
  // Deliberately not an authorization test. Unit/API tests cover denied permissions.
  requireModulePermission: async () => {},
};
const cache = new Map();
function load(file) {
  const path = resolve(file);
  if (cache.has(path)) return cache.get(path).exports;
  const mod = { exports: {} }; cache.set(path, mod);
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  new Function("require", "module", "exports", code)(id => {
    if (id === "./modules/resolveModuleConfig" || id === "./auth/requireModulePermission") return dependencies;
    if (id === "@/lib/supabase/server") return { createClient: async () => client };
    if (id === "@/lib/auth/requireModulePermission") return dependencies;
    if (id === "@/lib/moduleDefaultFilters") return { ...load("apps/web/lib/moduleDefaultFilters.ts"), buildModuleDefaultFilterRuntimeContext: async () => ({}) };
    if (id === "@repo/types") return load("packages/types/index.ts");
    if (id.startsWith(".") || id.startsWith("@/")) {
      const target = id.startsWith("@/") ? resolve("apps/web", id.slice(2)) : resolve(dirname(path), id);
      if (existsSync(target + ".ts")) return load(target + ".ts");
    }
    return require(id);
  }, mod, mod.exports);
  return mod.exports;
}
const { compileAdvancedFilters } = load("apps/web/lib/advancedFilters.ts");
const { POST } = load("apps/web/app/api/list/route.ts");
const group = (items, logic = "AND") => ({ kind: "group", logic, items });
const condition = (field, op, value, relation) => ({ kind: "condition", field, op, value, ...(relation ? { relation } : {}) });
async function query(slug, filter, { offset = 0, limit = 2, descending = false } = {}) {
  const schema = schemas.get(slug);
  const compiled = await compileAdvancedFilters(filter, schema, {}, dependencies);
  let q = client.from(schema.db.table).select([schema.db.primaryKey || "id", ...compiled.embeds.map(e => e.select)].join(","), { count: "exact" });
  for (const embed of compiled.embeds) q = q.or(embed.expression, { referencedTable: embed.alias });
  if (compiled.expression) q = q.or(`and(${compiled.expression})`);
  q = q.order(schema.db.primaryKey || "id", { ascending: !descending }).range(offset, offset + limit - 1);
  const result = await q;
  return result;
}
function success(result) { assert.equal(result.error, null, result.error?.code); return result; }

for (const [slug, relation, field] of [["py", "customer", "name"], ["task", "obraId", "title"], ["materialstask", "material", "title"]]) {
  const local = condition(slug === "materialstask" ? "material" : "title", "isNotNull");
  const related = condition(field, "isNotNull", undefined, relation);
  const a = success(await query(slug, group([local])));
  const b = success(await query(slug, group([related])));
  assert.ok(b.count > 0, "The live fixture needs matching related rows");
  const intersection = success(await query(slug, group([local, related])));
  const union = success(await query(slug, group([local, related], "OR")));
  assert.equal(union.count, a.count + b.count - intersection.count, "AND/OR set identity");
  const nested = success(await query(slug, group([group([local, related], "OR"), related])));
  assert.equal(nested.count, b.count, "Nested (A OR B) AND B equals B");
  const none = condition(field, "=", `__jiro_readonly_probe_${crypto.randomUUID()}__`, relation);
  assert.equal(success(await query(slug, group([local, none]))).count, 0);
  assert.equal(success(await query(slug, group([local, none], "OR"))).count, a.count, "Related nonmatch must not erase local OR matches");
  const fullPage = success(await query(slug, group([local, related], "OR"), { limit: 2 }));
  if (fullPage.data.length >= 2) {
    const page2 = success(await query(slug, group([local, related], "OR"), { offset: 1, limit: 1 }));
    assert.equal(page2.count, fullPage.count);
    assert.deepEqual(page2.data, fullPage.data.slice(1, 2));
    const last = success(await query(slug, group([local, related], "OR"), { offset: fullPage.count - 1, limit: 1 }));
    const reverse = success(await query(slug, group([local, related], "OR"), { descending: true, limit: 1 }));
    assert.deepEqual(last.data, reverse.data);
  }
  console.log(`PASS ${slug}.${relation}: real FK hint, AND/OR/nested, mixed predicates, count, pagination/order (matched ${union.count})`);
  const beyond = await query(slug, group([local, related], "OR"), { offset: union.count + 1, limit: 1 });
  assert.equal(beyond.error?.code, "PGRST103");
  const recovered = await POST(new Request("http://localhost/api/list", { method: "POST", body: JSON.stringify({
    moduleSlug: slug, advancedFilters: group([local, related], "OR"), offset: union.count + 1, limit: 1,
  }) }));
  assert.equal(recovered.status, 200);
  assert.deepEqual(await recovered.json(), { ok: true, data: [], count: union.count });
  console.log(`PASS ${slug}: actual API recovers live PGRST103 with count and empty page`);
}

const sample = success(await client.from("py").select("customer:customers!customer(name)").not("customer", "is", null).limit(1));
assert.ok(typeof sample.data[0]?.customer?.name === "string", "Need one existing related text value");
assert.ok(success(await query("py", group([condition("name", "=", sample.data[0].customer.name, "customer")]))).count > 0);
for (const relation of [undefined, "customer"]) {
  const value = `__${crypto.randomUUID()}__\"),or(id.not.is.null,title.eq.\"\\`;
  assert.equal(success(await query("py", group([condition(relation ? "name" : "title", "=", value, relation)]))).count, 0);
}
console.log("PASS real related text equality and quoted delimiter/backslash literals (local and related)");

// The current schema points budget_task.budgetId at py, but its FK points at budget.
const mismatch = await query("budget_task", group([condition("title", "isNotNull", undefined, "budgetId")]));
assert.equal(mismatch.error?.code, "PGRST200");
console.log("PASS configured target/FK mismatch: PGRST200 (no fallback to another relation)");
// Ambiguous inverse joins must not silently choose one of the existing FKs.
const ambiguous = await client.from("budget_task").select("id,budget_material()").limit(1);
assert.equal(ambiguous.error?.code, "PGRST201");
console.log("PASS ambiguous physical relationship: PGRST201");
console.log("READ ONLY: no rows/schema changed; no credentials or business values printed. End-user RLS remains a separate manual check.");
