// Live engine checks. Uses the local server key, so user authorization is tested separately.
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {createRequire} from "node:module";
import ts from "typescript";
if (!process.argv.includes("--readonly")) throw Error("Pass --readonly for live SELECT checks");
process.loadEnvFile("apps/web/.env.local");
const require = createRequire(resolve("apps/web/package.json"));
const client = require("@supabase/supabase-js").createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: {persistSession: false, autoRefreshToken: false}, global: {fetch: (input, init) => {
    assert.ok(["GET", "HEAD"].includes(init?.method || "GET"));
    return fetch(input, {...init, signal: AbortSignal.timeout(20000)});
  }},
});
const metadata = await client.from("modulos").select("slug,props").in("slug", ["task", "py"]);
assert.equal(metadata.error, null);
const schemas = new Map(metadata.data.map(row => [row.slug, row.props]));
const ctx = {user: {id: "read-only-engine-test"}, supabase: client};
const deps = {
  requireModulePermission: async slug => {assert.ok(schemas.has(slug)); return ctx;},
  resolveModuleConfig: async slug => {const schema = schemas.get(slug); assert.ok(schema); return {schema, table: schema.db.table, primaryKey: schema.db.primaryKey || "id", permissionsKey: slug};},
};
const cache = new Map();
function load(file) {
  const path = resolve(file); if (cache.has(path)) return cache.get(path).exports;
  const module = {exports: {}}; cache.set(path, module);
  const code = ts.transpileModule(readFileSync(path, "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
  new Function("require", "module", "exports", code)(id => {
    if (["../auth/requireModulePermission", "./auth/requireModulePermission", "../modules/resolveModuleConfig", "./modules/resolveModuleConfig"].includes(id)) return deps;
    if (id === "../auth/getCurrentUser") return {requireUser: async () => ctx};
    if (id === "../auth/requirePermission") return {};
    if (id === "../moduleDefaultFilters") return {...load("apps/web/lib/moduleDefaultFilters.ts"), buildModuleDefaultFilterRuntimeContext: async () => ({})};
    if (id === "@repo/types") return load("packages/types/index.ts");
    if (id.startsWith(".")) {const target = resolve(dirname(path), id); if (existsSync(target + ".ts")) return load(target + ".ts");}
    return require(id);
  }, module, module.exports);
  return module.exports;
}
const {executeReport} = load("apps/web/lib/reports/server.ts");
const filters = {kind: "group", logic: "AND", items: []};
const column = (id, field, aggregation = "none", relation) => ({id, ref: {field, ...(relation ? {relation} : {})}, aggregation, label: id});
const report = {name: "Live readonly", description: "", sourceModule: "task", type: "list", filters, sort: [], config: {
  columns: [column("project", "title", "none", "obraId"), column("sum", "pu", "sum"), column("count", "title", "count")],
}};
const result = await executeReport(report, true);
assert.equal(result.type, "list"); assert.ok(result.scanned > 0); assert.ok(result.rows.length > 0);
const matrix = await executeReport({...report, type: "matrix", config: {
  rows: [column("project", "title", "none", "obraId")], columns: [column("completed", "completed")],
  values: [column("sum", "pu", "sum"), column("count", "title", "count")],
}}, true);
assert.equal(matrix.type, "matrix"); assert.equal(matrix.scanned, result.scanned);
assert.equal(matrix.totals[1], result.rows.reduce((total, row) => total + row.count, 0));
assert.equal(matrix.totals[0], result.rows.reduce((total, row) => total + (row.sum || 0), 0));
console.log(`PASS real LIST/MATRIX with related projection: ${result.scanned} source rows, ${result.rows.length} groups; totals agree`);
const aggregation = await client.from("task").select("pu.sum()").limit(1);
console.log(aggregation.error?.code === "PGRST123" ? "PostgREST database aggregates disabled (PGRST123); bounded aggregation stays on application server." : `Database aggregate probe status=${aggregation.status}, code=${aggregation.error?.code || "OK"}`);
console.log("READ ONLY: source data unchanged; no credentials or business values printed.");
