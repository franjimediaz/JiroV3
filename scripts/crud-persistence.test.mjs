import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(resolve("apps/web/package.json"));
function loader(overrides = {}) {
  const cache = new Map();
  return function load(file) {
    const path = resolve(file);
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function("require", "module", "exports", code)(id => {
      if (id in overrides) return overrides[id];
      if (id === "@repo/types") return load("packages/types/index.ts");
      if (id.startsWith(".") || id.startsWith("@/")) {
        const base = id.startsWith("@/") ? resolve("apps/web", id.slice(2)) : resolve(dirname(path), id);
        if (existsSync(base + ".ts")) return load(base + ".ts");
      }
      return require(id);
    }, module, module.exports);
    return module.exports;
  };
}

async function request(operation, fields, incoming, { primaryKey = "id", allowed = true } = {}) {
  const calls = { audit: [], writes: [] };
  const query = {
    insert(value) { calls.writes.push(value); return query; },
    update(value) { calls.writes.push(value); return query; },
    select(value) { assert.equal(value, "*"); return query; },
    async single() { return { data: { [primaryKey]: "generated", ...calls.writes[0] }, error: null }; },
    async eq(key, id) { calls.filter = [key, id]; return { error: null }; },
  };
  const schema = { db: { table: "records", primaryKey }, fields, capabilities: { allowCreate: allowed, allowEdit: allowed } };
  const route = loader({
    "@/lib/modules/resolveModuleConfig": { resolveModuleConfig: async () => ({ schema, table: "records", slug: "records", primaryKey, permissionsKey: "records" }) },
    "@/lib/auth/requireModulePermission": { requireModulePermission: async (_module, action) => { calls.permission = action; return { user: { id: "actor" }, supabase: { from: () => query } }; } },
    "@/lib/audit/shouldAuditEvent": { shouldAuditEvent: () => true },
    "@/lib/audit/writeAuditEvent": { writeAuditEvent: async event => calls.audit.push(event) },
  })(`apps/web/app/api/${operation}/route.ts`);
  const response = await route.POST(new Request(`http://localhost/api/${operation}`, { method: "POST", body: JSON.stringify({ moduleSlug: "records", id: "existing", data: incoming }) }));
  return { ...calls, status: response.status, body: await response.json() };
}

const field = (name, extras = {}) => ({ name, label: name, type: "text", ...extras });
for (const operation of ["create", "update"]) {
  test(`${operation}: virtual UUID PK, other virtuals and nonpersisted computes never reach Supabase`, async () => {
    const result = await request(operation, [field("id", { virtual: true }), field("name"), field("full_name", { virtual: true }), field("calculo", { compute: { type: "formula", persist: "none" } })], { id: null, name: "ACME", full_name: "virtual", calculo: 10 });
    assert.equal(result.status, 200);
    assert.deepEqual(result.writes, [{ name: "ACME" }]);
    assert.deepEqual(result.audit[0].metadata.fieldNames, ["name"]);
    if (operation === "create") assert.equal(result.body.id, "generated");
    else assert.deepEqual(result.filter, ["id", "existing"]);
  });
  test(`${operation}: unknown fields including undeclared PKs still return 400`, async () => {
    for (const key of ["hacker_field", "id"]) {
      const result = await request(operation, [field("name")], { name: "ACME", [key]: null });
      assert.equal(result.status, 400);
      assert.match(result.body.error.message, /Campos no declarados en schema/);
      assert.deepEqual(result.writes, []);
    }
  });
  test(`${operation}: all server-controlled fields are rejected even when virtual`, async () => {
    const { SERVER_CONTROLLED_FIELDS } = loader()("packages/types/persistablePayload.ts");
    for (const name of SERVER_CONTROLLED_FIELDS) {
      const result = await request(operation, [field(name, { virtual: true })], { [name]: "tampered" });
      assert.equal(result.status, 400);
      assert.match(result.body.error.message, /controlados por servidor/);
      assert.deepEqual(result.writes, []);
    }
  });
  test(`${operation}: preserves structured values, persisted computations and scalar relation normalization`, async () => {
    const fields = [field("address", { type: "address" }), field("json", { type: "jsonb" }), field("tags", { type: "multiselect" }), field("parent", { type: "selectorTabla" }), field("many", { type: "selectorTabla", ref: { multiple: true } }), field("formula", { compute: { type: "formula", persist: "onSave" } }), field("total", { compute: { type: "aggregate", persist: "onSave" } })];
    const input = { address: { formatted: "Madrid", provider: "manual" }, json: { nested: [1, null] }, tags: ["a"], parent: "", many: [], formula: 2, total: 5 };
    const result = await request(operation, fields, input);
    assert.equal(result.status, 200);
    assert.deepEqual(result.writes, [{ ...input, parent: null }]);
    assert.equal(result.permission, operation === "create" ? "crear" : "actualizar");
  });
  test(`${operation}: module capabilities still prevent writes`, async () => {
    const result = await request(operation, [field("name")], { name: "ACME" }, { allowed: false });
    assert.equal(result.status, 403); assert.deepEqual(result.writes, []);
  });
}

test("create supports custom manual PKs but omits blank PKs", async () => {
  for (const value of [null, "", "   ", undefined, "manual-key", 0]) {
    const result = await request("create", [field("code"), field("name")], { code: value, name: "ACME" }, { primaryKey: "code" });
    assert.equal(result.status, 200);
    assert.deepEqual(result.writes[0], value === "manual-key" || value === 0 ? { code: value, name: "ACME" } : { name: "ACME" });
  }
});

test("update never writes a custom PK, regardless of virtual/readOnly flags", async () => {
  for (const extra of [{}, { readOnly: true }, { virtual: true }]) {
    const result = await request("update", [field("code", extra), field("name")], { code: "replacement", name: "changed" }, { primaryKey: "code" });
    assert.equal(result.status, 200);
    assert.deepEqual(result.writes, [{ name: "changed" }]);
    assert.deepEqual(result.filter, ["code", "existing"]);
  }
});

test("shared form selection omits undefined without changing null, arrays or objects", () => {
  const { pickPersistablePayload } = loader()("packages/types/persistablePayload.ts");
  const schema = { db: { primaryKey: "code" }, fields: [field("code"), field("name"), field("optional"), field("virtual", { virtual: true }), field("calculo", { compute: { persist: "none" } })] };
  const input = { code: "manual", name: null, optional: undefined, virtual: "x", calculo: 9 };
  assert.deepEqual(pickPersistablePayload(input, schema, { operation: "create" }), { code: "manual", name: null });
  assert.deepEqual(pickPersistablePayload(input, schema, { operation: "update" }), { name: null });
  assert.equal(input.code, "manual");
  for (const name of ["FormClient", "FormClientLegacy"]) {
    const source = readFileSync(`apps/web/lib/${name}.tsx`, "utf8");
    assert.match(source, /import \{ pickPersistablePayload, type ModuleSchema \} from "@repo\/types"/);
    assert.doesNotMatch(source, /function pickPersistablePayload/);
  }
});
