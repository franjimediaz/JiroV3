import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync, existsSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {createRequire} from "node:module";
import ts from "typescript";
const require = createRequire(resolve("apps/web/package.json"));
function loader(overrides = {}) {
  const cache = new Map();
  return function load(file) {
    const path = resolve(file); if (cache.has(path)) return cache.get(path).exports;
    const module = {exports: {}}; cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText;
    new Function("require", "module", "exports", code)(id => {
      if (id in overrides) return overrides[id];
      if (id === "server-only") return {};
      if (id === "@repo/types") return load("packages/types/index.ts");
      if (id.endsWith(".css")) return {};
      if (id.startsWith(".") || id.startsWith("@/")) {
        const base = id.startsWith("@/") ? resolve("apps/web", id.slice(2)) : resolve(dirname(path), id);
        for (const suffix of [".ts", ".tsx"]) if (existsSync(base + suffix)) return load(base + suffix);
      }
      return require(id);
    }, module, module.exports);
    return module.exports;
  };
}
const load = loader();
const {aggregate, transformReport} = load("apps/web/lib/reports/transform.ts");
const {parseReport} = load("apps/web/lib/reports/definition.ts");
const types = load("packages/types/index.ts");
const filters = {kind: "group", logic: "AND", items: []};
const column = (id, field = id, aggregation = "none", relation) => ({id, label: id, aggregation, ref: {field, ...(relation ? {relation} : {})}});
const list = (columns = [column("country"), column("amount", "amount", "sum")]) => ({name: "Informe", description: "", sourceModule: "orders", type: "list", config: {columns}, filters, sort: []});
const matrix = () => ({...list(), type: "matrix", config: {rows: [column("country")], columns: [column("year")], values: [column("amount", "amount", "sum"), column("average", "amount", "avg"), column("distinct", "name", "countDistinct")]}});

test("report definitions validate shape, limits, stable refs, aggregates and sort targets", () => {
  assert.deepEqual(parseReport(list()), list());
  assert.deepEqual(parseReport(matrix()), matrix());
  for (const invalid of [null, {...list(), type: "sql"}, {...list(), config: {columns: []}}, {...list(), sort: [{columnId: "private", direction: "asc"}]},
    {...list(), config: {columns: [column("same"), column("same")]}}, {...matrix(), config: {...matrix().config, values: [column("value")]}}]) assert.throws(() => parseReport(invalid));
  assert.throws(() => parseReport({...list(), description: "x".repeat(70000)}));
});
test("metadata enumerates only direct declared scalar fields; aggregate compatibility is type-specific", () => {
  const root = {slug: "orders", name: "Pedidos", schema: {db: {table: "orders"}, fields: [
    {name: "customer", label: "Cliente", type: "selectorTabla", ref: {moduleSlug: "customers"}},
    {name: "virtual", type: "text", virtual: true}, {name: "hidden", type: "text", visible: false},
  ]}};
  const target = {slug: "customers", name: "Clientes", schema: {db: {table: "customers"}, fields: [{name: "name", label: "Nombre", type: "text"}]}};
  assert.deepEqual(types.reportFieldOptions(root, [root, target]).map(option => option.ref), [{field: "customer"}, {field: "name", relation: "customer"}]);
  assert.equal(types.reportFieldOptions(root, [root]).length, 1);
  assert.ok(types.reportAggregations({type: "money"}).includes("avg"));
  assert.ok(!types.reportAggregations({type: "text"}).includes("sum"));
});
test("metadata resolver follows only configured selector paths up to two levels and feeds the pure query builder", async () => {
  const schemas = {
    orders: {db: {table: "orders", primaryKey: "id"}, fields: [{name: "customer", type: "selectorTabla", ref: {moduleSlug: "customers"}}]},
    customers: {db: {table: "customers", primaryKey: "id"}, fields: [{name: "country", type: "selectorTabla", ref: {moduleSlug: "countries"}}]},
    countries: {db: {table: "countries", primaryKey: "id"}, fields: [{name: "name", label: "País", type: "text"}]},
  };
  const permissions = [];
  const dependencies = {
    resolveModuleConfig: async slug => ({slug, schema: schemas[slug], table: schemas[slug].db.table, primaryKey: "id", permissionsKey: slug}),
    requireModulePermission: async (slug, action) => permissions.push([slug, action]),
  };
  const {resolveReportMetadata} = loader({"../auth/requireModulePermission": dependencies, "./auth/requireModulePermission": dependencies,
    "../modules/resolveModuleConfig": dependencies, "./modules/resolveModuleConfig": dependencies})("apps/web/lib/reports/metadata.ts");
  const {buildReportQuery} = load("apps/web/lib/reports/queryBuilder.ts");
  const report = list([{id: "country", label: "País", aggregation: "none", ref: {module: "orders", relations: ["customer", "country"], field: "name", alias: "country_name"}}]);
  const metadata = await resolveReportMetadata(report, dependencies);
  const query = buildReportQuery(report, metadata);
  assert.equal(query.source.table, "orders"); assert.equal(query.fields[0].table, "countries");
  assert.deepEqual(query.fields[0].relationPath.map(item => item.field), ["customer", "country"]);
  assert.deepEqual(permissions, [["orders", "ver"], ["customers", "ver"], ["countries", "ver"]]);
  await assert.rejects(resolveReportMetadata({...report, config: {columns: [{...report.config.columns[0], ref: {...report.config.columns[0].ref, relations: ["customer", "country", "continent"]}}]}}, dependencies), /máximo de 2/);
  assert.throws(() => buildReportQuery({...list(), config: {columns: [column("country"), column("amount", "amount", "sum")], groupBy: []}}, {
    source: {module: "orders", table: "orders", primaryKey: "id", schema: schemas.orders}, fields: [
      {id: "country", ref: {field: "country"}, module: "orders", table: "orders", field: {name: "country", type: "text"}, relations: [], aggregations: ["none", "count"]},
      {id: "amount", ref: {field: "amount"}, module: "orders", table: "orders", field: {name: "amount", type: "money"}, relations: [], aggregations: ["none", "sum"]},
    ],
  }), /groupBy/);
});
test("list grouping, multiple aggregates, sorting, nulls and preview truncation", () => {
  const report = {...list(), sort: [{columnId: "amount", direction: "desc"}]};
  const result = transformReport(report, [{country: "ES", amount: 10}, {country: "ES", amount: 20}, {country: "FR", amount: 5}], false);
  assert.deepEqual(result.rows, [{country: "ES", amount: 30}, {country: "FR", amount: 5}]);
  assert.equal(aggregate([null, 1, 1, 2], "count"), 3);
  assert.equal(aggregate([null, 1, 1, 2], "countDistinct"), 2);
  assert.equal(aggregate([null, 1, 1, 4], "avg"), 2);
  assert.equal(aggregate([null], "sum"), null);
  assert.equal(aggregate(["2026-01-01", "2025-01-01"], "min"), "2025-01-01");
  const preview = transformReport(list([column("country")]), Array.from({length: 150}, (_, i) => ({country: String(i)})), true);
  assert.equal(preview.rows.length, 100); assert.equal(preview.total, 150); assert.equal(preview.truncated, true);
});
test("matrix totals recompute weighted averages and distinct counts from source values", () => {
  const input = [
    {country: "A", year: 2025, amount: 10, average: 10, distinct: "x"},
    {country: "A", year: 2026, amount: 20, average: 20, distinct: "x"},
    {country: "B", year: 2026, amount: 30, average: 30, distinct: "y"},
    {country: "B", year: 2026, amount: 60, average: 60, distinct: "y"},
  ];
  const result = transformReport(matrix(), input, false);
  assert.deepEqual(result.totals, [120, 30, 2]);
  assert.deepEqual(result.rowTotals, [[30, 15, 1], [90, 45, 1]]);
  assert.deepEqual(result.columnTotals, [[10, 10, 1], [110, 110 / 3, 2]]);
  assert.deepEqual(result.cells[1][0], [null, null, 0]);
  assert.equal(transformReport(matrix(), [], false).rowLabels.length, 0);
  assert.throws(() => transformReport(matrix(), Array.from({length: 101}, (_, i) => ({country: String(i), year: 2026, amount: 1})), false), /100 filas/);
});

function fixture({denied = [], count = 4, errorCode, cap = 2} = {}) {
  const requests = [], permissions = [];
  const schemas = {
    orders: {db: {table: "orders", primaryKey: "id"}, fields: [
      {name: "country", label: "País", type: "text", filter: true}, {name: "amount", label: "Importe", type: "money", filter: true},
      {name: "customer", type: "selectorTabla", filter: true, ref: {moduleSlug: "customers"}},
      {name: "hidden", type: "text", visible: false},
    ]},
    customers: {db: {table: "customers", defaultFilters: {kind: "group", logic: "AND", items: [{kind: "condition", field: "name", op: "!=", value: "Hidden"}]}}, fields: [{name: "name", label: "Nombre", type: "text", filter: true}]},
  };
  const client = require("@supabase/supabase-js").createClient("https://example.test", "key", {auth: {persistSession: false}, global: {fetch: async (input, init) => {
    const url = new URL(String(input)); requests.push({url, init});
    if (errorCode) return Response.json({code: errorCode, message: "Relation failed"}, {status: 400});
    const offset = Number(url.searchParams.get("offset") || 0);
    const rows = Array.from({length: Math.min(cap, Math.max(0, count - offset))}, (_, i) => ({id: i + offset, country: "ES", amount: 10, jiro_report_0: {name: "ACME"}}));
    return Response.json(rows, {headers: {"Content-Range": `${offset}-${offset + rows.length - 1}/${count}`}});
  }}});
  const ctx = {user: {id: "owner"}, supabase: client};
  const deps = {
    resolveModuleConfig: async slug => {assert.ok(schemas[slug], "Unknown module"); return {schema: schemas[slug], table: schemas[slug].db.table, primaryKey: "id", permissionsKey: slug};},
    requireModulePermission: async (slug, action) => {permissions.push([slug, action]); if (denied.includes(slug)) throw Object.assign(Error("Denied"), {status: 403}); return ctx;},
  };
  const loaded = loader({
    "../auth/getCurrentUser": {requireUser: async () => ctx}, "../auth/requirePermission": {hasPermission: () => true},
    "../auth/requireModulePermission": deps, "./auth/requireModulePermission": deps,
    "../modules/resolveModuleConfig": deps, "./modules/resolveModuleConfig": deps,
    "../moduleDefaultFilters": {...load("apps/web/lib/moduleDefaultFilters.ts"), buildModuleDefaultFilterRuntimeContext: async () => ({})},
  })("apps/web/lib/reports/server.ts");
  return {...loaded, requests, permissions};
}
test("server pages through the bounded source set and returns aggregated results only", async () => {
  const f = fixture();
  const result = await f.executeReport(list(), true);
  assert.deepEqual(result.rows, [{country: "ES", amount: 40}]);
  assert.equal(result.scanned, 4); assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].url.searchParams.get("offset"), "2");
  assert.equal(f.requests[0].url.searchParams.get("select"), "id,country,amount");
  await assert.rejects(fixture({count: 5001}).executeReport(list(), true), /5.000/);
});
test("related output fields and advanced mixed filters share schema validation and defaults", async () => {
  const f = fixture();
  const report = {...list([column("client", "name", "none", "customer"), column("amount", "amount", "sum")]), filters: {
    kind: "group", logic: "OR", items: [{kind: "condition", field: "country", op: "=", value: "ES"}, {kind: "condition", relation: "customer", field: "name", op: "contains", value: "ACME"}],
  }};
  const result = await f.executeReport(report, false);
  assert.deepEqual(result.rows, [{client: "ACME", amount: 40}]);
  const url = f.requests[0].url;
  assert.match(url.searchParams.get("select"), /jiro_report_0:customers!customer\(name\)/);
  assert.match(url.searchParams.get("or"), /or\(country.eq."ES",jiro_search_0.not.is.null\)/);
  assert.match(url.searchParams.get("jiro_report_0.or"), /name.neq."Hidden"/);
  assert.ok(f.permissions.some(([slug, action]) => slug === "customers" && action === "ver"));
});
test("manual LIST definitions cover direct fields, relation, filter, sort, SUM/groupBy and COUNT", async () => {
  const direct = await fixture().executeReport(list([column("country"), column("amount")]), false);
  assert.equal(direct.rows.length, 4); assert.deepEqual(Object.keys(direct.rows[0]), ["country", "amount"]);

  const related = await fixture().executeReport(list([column("client", "name", "none", "customer")]), false);
  assert.equal(related.rows[0].client, "ACME");

  const filteredReport = {...list([column("country")]), filters: {kind: "group", logic: "AND", items: [{kind: "condition", field: "country", op: "=", value: "ES"}]}};
  const filtered = fixture(); await filtered.executeReport(filteredReport, false);
  assert.match(filtered.requests[0].url.searchParams.get("or"), /country.eq."ES"/);

  const sorted = await fixture().executeReport({...list([column("country"), column("amount")]), sort: [{columnId: "amount", direction: "desc"}]}, false);
  assert.equal(sorted.rows[0].amount, 10);

  const grouped = await fixture().executeReport({...list(), config: {columns: list().config.columns, groupBy: ["country"], limit: 50}}, false);
  assert.deepEqual(grouped.rows, [{country: "ES", amount: 40}]);

  const counted = await fixture().executeReport(list([column("count", "country", "count")]), false);
  assert.deepEqual(counted.rows, [{count: 4}]);
});
test("server rejects forbidden fields/relations/aggregates and denied modules before reading business rows", async () => {
  for (const report of [list([column("x", "hidden")]), list([column("x", "country", "sum")]), list([column("x", "country),secret")]), list([column("x", "name", "none", "arbitrary")])]) {
    const f = fixture(); await assert.rejects(f.executeReport(report, true), error => error.status === 400); assert.equal(f.requests.length, 0);
  }
  for (const denied of ["orders", "customers"]) {
    const f = fixture({denied: [denied]});
    await assert.rejects(f.executeReport(list([column("client", "name", "none", "customer")]), true), error => error.status === 403);
    assert.equal(f.requests.length, 0);
  }
  await assert.rejects(fixture({errorCode: "PGRST200"}).executeReport(list(), true), /FK reconocida/);
});

test("reports API scopes CRUD to the session owner and executes saved definitions instead of client replacements", async () => {
  const owner = "00000000-0000-4000-8000-000000000001", id = "00000000-0000-4000-8000-000000000002";
  const requests = [], executions = [];
  let missing = false;
  const stored = {id, config: list(), created_at: "2026-01-01", updated_at: "2026-01-01"};
  const client = require("@supabase/supabase-js").createClient("https://example.test", "key", {auth: {persistSession: false}, global: {fetch: async (input, init) => {
    const url = new URL(String(input)); requests.push({url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined});
    const many = url.searchParams.has("order");
    return Response.json(missing ? null : many ? [stored] : stored);
  }}});
  const route = loader({
    "@/lib/auth/getCurrentUser": {requireUser: async () => ({user: {id: owner}, supabase: client})},
    "@/lib/reports/server": {prepareReport: async input => ({report: parseReport(input)}), reportSources: async () => [], executeReport: async (report, preview) => {executions.push({report, preview}); return {ok: true};}},
    "@/lib/auth/handleApiError": {handleApiError: error => Response.json({error: error.message}, {status: error.status || 500})},
  })("apps/web/app/api/reports/route.ts");
  const post = body => route.POST(new Request("http://localhost/api/reports", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)}));
  assert.equal((await route.GET(new Request("http://localhost/api/reports"))).status, 200);
  assert.equal((await post({action: "save", report: {...list(), owner_id: "attacker"}})).status, 200);
  assert.equal(requests.at(-1).body.owner_id, owner);
  assert.equal((await post({action: "save", id, report: list()})).status, 200);
  assert.equal((await post({action: "run", id, report: {...list(), sourceModule: "private"}})).status, 200);
  assert.deepEqual(executions.at(-1), {report: list(), preview: false});
  assert.equal((await route.DELETE(new Request("http://localhost/api/reports", {method: "DELETE", headers: {"content-type": "application/json"}, body: JSON.stringify({id})}))).status, 200);
  for (const request of requests.filter(request => request.method !== "POST")) assert.equal(request.url.searchParams.get("owner_id"), `eq.${owner}`);
  missing = true;
  assert.equal((await post({action: "run", id})).status, 404);
  assert.equal((await post({action: "save", id, report: list()})).status, 404);
  assert.equal((await post({action: "run", id: "id),or(owner_id)"})).status, 400);
  assert.equal((await route.POST(new Request("http://localhost/api/reports", {method: "POST", body: JSON.stringify({action: "save", report: list()})}))).status, 400);
});

test("global Reports link precedes My account in desktop, mini and mobile sidebar", () => {
  const React = require("react"), {renderToStaticMarkup} = require("react-dom/server");
  const {Sidebar} = loader({"next/navigation": {usePathname: () => "/informes"}})("packages/ui/src/Sidebar.tsx");
  for (const props of [{variant: "fixed"}, {variant: "fixed", miniMode: true}, {variant: "drawer", isOpen: true}]) {
    const html = renderToStaticMarkup(React.createElement(Sidebar, {items: [], ...props}));
    assert.match(html, /href="\/informes"/); assert.match(html, /bi-table/);
    assert.ok(html.indexOf('href="/informes"') < html.indexOf('aria-label="Mi cuenta"'));
  }
});
