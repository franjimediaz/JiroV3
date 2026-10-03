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
    const path = resolve(file); if (cache.has(path)) return cache.get(path).exports;
    const mod = {exports: {}}; cache.set(path, mod);
    const code = ts.transpileModule(readFileSync(path, "utf8"), {compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }}).outputText;
    new Function("require", "module", "exports", code)(id => {
      if (id in overrides) return overrides[id];
      if (id.endsWith(".css")) return {};
      if (id === "@repo/types") return load("packages/types/index.ts");
      if (id.startsWith(".") || id.startsWith("@/")) {
        const target = id.startsWith("@/") ? resolve("apps/web", id.slice(2)) : resolve(dirname(path), id);
        for (const suffix of [".ts", ".tsx"]) if (existsSync(target + suffix)) return load(target + suffix);
      }
      return require(id);
    }, mod, mod.exports);
    return mod.exports;
  };
}
const root = {db: {table: "projects", primaryKey: "id"}, fields: [
  {name: "name", label: "Nombre", type: "text", filter: true},
  {name: "amount", label: "Importe", type: "money", filter: true},
  {name: "date", label: "Fecha", type: "date", filter: true},
  {name: "active", label: "Activo", type: "boolean", filter: true},
  {name: "client_id", label: "Cliente", type: "selectorTabla", filter: true, ref: {moduleSlug: "clients", displayField: "name"}},
  {name: "secret", label: "Secreto", type: "text"},
  {name: "virtual", label: "Virtual", type: "number", filter: true, virtual: true},
]};
const related = {slug: "clients", permissionsKey: "clients", table: "customers", schema: {db: {table: "customers"}, fields: [
  {name: "name", label: "Nombre cliente", type: "text", filter: true}, {name: "tax", label: "CIF", type: "text", filter: false},
]}};
const group = (items = [], logic = "AND") => ({kind: "group", logic, items});
const condition = (field = "name", op = "=", value = "ACME", relation) => ({kind: "condition", field, op, value, ...(relation ? {relation} : {})});
const fallbackDependencies = {resolveModuleConfig: async () => related, requireModulePermission: async () => ({})};
const imports = {
  "./modules/resolveModuleConfig": fallbackDependencies,
  "./auth/requireModulePermission": fallbackDependencies,
};
const load = loader(imports);
const {compileAdvancedFilters, filterConditionExpression} = load("apps/web/lib/advancedFilters.ts");
const types = load("packages/types/index.ts");

test("one condition, AND, OR and nested groups compile without changing the serializable input", async () => {
  const value = group([group([condition(), condition("name", "=", "Pending")], "OR"), condition("amount", ">", 1000)]);
  const snapshot = structuredClone(value);
  assert.equal((await compileAdvancedFilters(value, root, {})).expression, 'and(or(name.eq."ACME",name.eq."Pending"),amount.gt.1000)');
  assert.deepEqual(value, snapshot);
  assert.equal((await compileAdvancedFilters(group(), root, {})).expression, undefined);
});

test("type-specific text, numeric, date, boolean, membership and empty operators", async () => {
  const values = [condition("name", "contains", "ACME"), condition("name", "notContains", "other"),
    condition("name", "startsWith", "a"), condition("name", "endsWith", "z"), condition("name", "isNull"),
    condition("amount", "between", [10, 20]), condition("date", "between", ["2026-01-01", "2026-02-01"]),
    condition("active", "=", false), condition("client_id", "in", ["a", "b"]), condition("client_id", "notIn", ["c"])];
  const {expression} = await compileAdvancedFilters(group(values), root, {});
  assert.match(expression, /name\.ilike\."%ACME%"/);
  assert.match(expression, /name\.not\.ilike\."%other%"/);
  assert.match(expression, /and\(amount.gte.10,amount.lte.20\)/);
  assert.match(expression, /date.gte."2026-01-01"/);
  assert.match(expression, /active.eq.false/);
  assert.match(expression, /client_id.not.in.\("c"\)/);
  for (const invalid of [condition("amount", "contains", "1"), condition("amount", "=", "100"), condition("active", "=", "true"),
    condition("date", "=", "2026-02-30"), condition("date", "=", "tomorrow"), condition("amount", "between", [20, 10])])
    await assert.rejects(compileAdvancedFilters(group([invalid]), root, {}), error => error.status === 400);
});

test("related conditions use empty embedded joins, preserve cross-table OR and cache metadata/permissions", async () => {
  const permissions = []; let resolutions = 0;
  const deps = {resolveModuleConfig: async slug => { assert.equal(slug, "clients"); resolutions++; return related; },
    requireModulePermission: async (...args) => permissions.push(args)};
  const result = await compileAdvancedFilters(group([condition(), condition("name", "contains", "ACME", "client_id"),
    condition("name", "!=", "Old", "client_id")], "OR"), root, {}, deps);
  assert.equal(result.expression, 'or(name.eq."ACME",jiro_search_0.not.is.null,jiro_search_1.not.is.null)');
  assert.deepEqual(result.embeds.map(embed => embed.select), ["jiro_search_0:customers!client_id()", "jiro_search_1:customers!client_id()"]);
  assert.equal(resolutions, 1); assert.deepEqual(permissions, [["clients", "ver"]]);
});

test("rejects unfilterable/undeclared/virtual fields, forged relations, operators, raw fragments and excessive nesting", async () => {
  for (const invalid of [condition("secret"), condition("virtual", "=", 1), condition("name),id", "=", "x"),
    condition("tax", "=", "x", "client_id"), condition("name", "=", "x", "arbitrary_table"),
    condition("name", "eq.x),or(id.gt.0", "x"), condition("name", "=", {sql: "select *"})])
    await assert.rejects(compileAdvancedFilters(group([invalid]), root, {}), error => error.status === 400);
  let deep = group([condition()]); for (let i = 0; i < 5; i++) deep = group([deep]);
  await assert.rejects(compileAdvancedFilters(deep, root, {}), /complejo/);
  await assert.rejects(compileAdvancedFilters(group(Array.from({length: 41}, () => condition())), root, {}), /demasiadas/);
  await assert.rejects(compileAdvancedFilters(group([condition()]), {...root, capabilities: {allowSearch: false}}, {}), error => error.status === 403);
  await assert.rejects(compileAdvancedFilters(group([condition("name", "=", "x", "client_id")]), root, {}, {
    ...fallbackDependencies, requireModulePermission: async () => { throw Object.assign(Error("Denied"), {status: 403}); },
  }), error => error.status === 403);
});

test("PostgREST delimiters and quotes remain inside one escaped literal", () => {
  assert.equal(filterConditionExpression("name", "=", 'x"),or(id.gt.0,name.eq."x\\'), 'name.eq."x\\"),or(id.gt.0,name.eq.\\"x\\\\"');
  assert.throws(() => filterConditionExpression("name", "=", "a\u0000b"), /no válido/);
});

function apiFixture({denied = [], schema = root, dataResponse} = {}) {
  const requests = []; const perms = [];
  const {createClient} = require("@supabase/supabase-js");
  const client = createClient("https://example.test", "test-key", {auth: {persistSession: false, autoRefreshToken: false}, global: {
    fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push({url, headers: new Headers(init?.headers)});
      if (url.pathname.endsWith("/modulos")) return new Response(JSON.stringify({id: "m", slug: "projects", props: schema}), {headers: {"Content-Type": "application/json"}});
      if (dataResponse) return dataResponse(url);
      return new Response(JSON.stringify([{id: "p1", name: "ACME", amount: 2000}]), {headers: {"Content-Type": "application/json", "Content-Range": "10-10/23"}});
    },
  }});
  const actualDefaults = load("apps/web/lib/moduleDefaultFilters.ts");
  const permission = async (slug, action) => { perms.push([slug, action]); if (denied.includes(`${slug}:${action}`)) throw Object.assign(Error("Denied"), {status: 403}); };
  const route = loader({
    ...imports,
    "./auth/requireModulePermission": {requireModulePermission: permission},
    "@/lib/supabase/server": {createClient: async () => client},
    "@/lib/auth/requireModulePermission": {requireModulePermission: permission},
    "@/lib/moduleDefaultFilters": {...actualDefaults, buildModuleDefaultFilterRuntimeContext: async () => ({})},
    "@/lib/auth/handleApiError": {handleApiError: error => Response.json({error: error.message}, {status: error.status || 500})},
  })("apps/web/app/api/list/route.ts");
  const run = body => route.POST(new Request("http://localhost/api/list", {method: "POST", body: JSON.stringify({moduleSlug: "projects", ...body})}));
  return {run, requests, perms};
}

test("real Supabase query builder receives validated predicates, server pagination/count, sort and ANDed default groups", async () => {
  const fixture = apiFixture({schema: {...root, db: {...root.db, defaultFilters: group([condition("active", "=", true), condition("amount", ">", 500)], "OR")}}});
  const response = await fixture.run({advancedFilters: group([condition("name", "contains", "ACME", "client_id")]), limit: 10, offset: 10, sort: [{field: "amount", dir: "desc"}]});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok: true, data: [{id: "p1", name: "ACME", amount: 2000}], count: 23});
  const request = fixture.requests.at(-1);
  assert.equal(request.url.searchParams.get("offset"), "10"); assert.equal(request.url.searchParams.get("limit"), "10");
  assert.equal(request.url.searchParams.get("order"), "amount.desc,id.asc");
  assert.equal(request.url.searchParams.get("select"), "*,jiro_search_0:customers!client_id()");
  assert.match(request.url.searchParams.get("or"), /and\(and\(jiro_search_0.not.is.null\),or\(active.eq.true,amount.gt.500\)\)/);
  assert.equal(request.url.searchParams.get("jiro_search_0.or"), '(name.ilike."%ACME%")');
  assert.match(request.headers.get("prefer"), /count=exact/);
});

test("API enforces root and related view permission and export capability + permission before querying records", async () => {
  for (const denied of [["projects:ver"], ["clients:ver"], ["projects:exportar"]]) {
    const fixture = apiFixture({denied});
    const response = await fixture.run({advancedFilters: group([condition("name", "=", "ACME", "client_id")]), purpose: "export"});
    assert.equal(response.status, 403);
    assert.ok(fixture.requests.every(request => request.url.pathname.endsWith("/modulos")));
  }
  const fixture = apiFixture({schema: {...root, capabilities: {allowExport: false}}});
  assert.equal((await fixture.run({advancedFilters: group(), purpose: "export"})).status, 403);
});

test("legacy filters retain their transport and advanced sort/filter bypass attempts fail closed", async () => {
  const legacy = apiFixture();
  const response = await legacy.run({filters: [{field: "name", op: "=", value: "ACME"}], limit: 10});
  assert.equal(response.status, 200); assert.equal((await response.json()).count, undefined);
  assert.equal(legacy.requests.at(-1).url.searchParams.get("name"), "eq.ACME");
  for (const body of [{filters: [{field: "secret", op: "=", value: "x"}]}, {sort: [{field: "evil", dir: "asc"}]}, {offset: -1}, {limit: 201}]) {
    assert.equal((await apiFixture().run({advancedFilters: group(), ...body})).status, 400);
  }
});

test("missing and ambiguous FKs return descriptive 400 errors without fallback joins", async () => {
  for (const [code, message] of [["PGRST200", /no coincide/], ["PGRST201", /varias relaciones/]]) {
    const fixture = apiFixture({dataResponse: () => Response.json({code, message: "physical relationship error"}, {status: 400})});
    const result = await fixture.run({advancedFilters: group([condition("name", "isNotNull", undefined, "client_id")])});
    assert.equal(result.status, 400);
    assert.match((await result.json()).error, message);
    assert.equal(fixture.requests.filter(request => !request.url.pathname.endsWith("/modulos")).length, 1);
  }
});

test("out-of-range advanced pages recover count with exactly the same predicates and no wrong-page rows", async () => {
  const fixture = apiFixture({dataResponse: url => url.searchParams.get("offset") === "40"
    ? Response.json({code: "PGRST103", message: "Requested range not satisfiable"}, {status: 416})
    : Response.json([{id: "first-row"}], {headers: {"Content-Range": "0-0/23"}})});
  const result = await fixture.run({advancedFilters: group([condition(), condition("name", "isNotNull", undefined, "client_id")], "OR"), offset: 40, limit: 10});
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {ok: true, data: [], count: 23});
  const requests = fixture.requests.filter(request => !request.url.pathname.endsWith("/modulos"));
  assert.equal(requests.length, 2);
  for (const key of ["select", "or", "jiro_search_0.or", "order"]) assert.equal(requests[0].url.searchParams.get(key), requests[1].url.searchParams.get(key));
  assert.equal(requests[1].url.searchParams.get("offset"), "0");
  assert.equal(requests[1].url.searchParams.get("limit"), "1");
});

test("strict filter flags and relation permissions apply at both schema levels; related defaults remain mandatory", async () => {
  for (const flag of [undefined, false, "true", 1]) {
    await assert.rejects(compileAdvancedFilters(group([condition()]), {...root, fields: root.fields.map(field => ({...field, filter: flag}))}, {}), error => error.status === 400);
    const schema = {...root, fields: root.fields.map(field => field.name === "client_id" ? {...field, filter: flag} : field)};
    await assert.rejects(compileAdvancedFilters(group([condition("name", "=", "x", "client_id")]), schema, {}), error => error.status === 400);
    const target = {...related, schema: {...related.schema, fields: related.schema.fields.map(field => ({...field, filter: flag}))}};
    await assert.rejects(compileAdvancedFilters(group([condition("name", "=", "x", "client_id")]), root, {}, {...fallbackDependencies, resolveModuleConfig: async () => target}), error => error.status === 400);
  }
  const target = {...related, schema: {...related.schema, db: {...related.schema.db, defaultFilters: group([condition("tax", "=", "allowed")])}}};
  const compiled = await compileAdvancedFilters(group([condition(), condition("name", "=", "x", "client_id")], "OR"), root, {}, {...fallbackDependencies, resolveModuleConfig: async () => target});
  assert.equal(compiled.embeds[0].expression, 'and(name.eq."x",and(tax.eq."allowed"))');
});

test("client table/column fragments cannot redirect the advanced query", async () => {
  const fixture = apiFixture();
  assert.equal((await fixture.run({advancedFilters: group([condition()]), table: "private_table", select: "private_column"})).status, 200);
  assert.ok(fixture.requests.at(-1).url.pathname.endsWith("/projects"));
  assert.equal(fixture.requests.at(-1).url.searchParams.get("select"), "*");
  for (const field of ["name.desc,secret", "client_id(name)", "name->secret"]) {
    const rejected = apiFixture();
    assert.equal((await rejected.run({advancedFilters: group(), sort: [{field}]})).status, 400);
    assert.ok(rejected.requests.every(request => request.url.pathname.endsWith("/modulos")));
  }
});

test("field inventory uses labels and filter:true on both ends, without physical column discovery", () => {
  assert.deepEqual(types.advancedSearchFields(root, {clients: related.schema}).map(option => option.label),
    ["Nombre", "Importe", "Fecha", "Activo", "Cliente", "Cliente > Nombre cliente"]);
  assert.deepEqual(types.advancedSearchFields({...root, fields: root.fields.map(field => ({...field, filter: false}))}, {clients: related.schema}), []);
});

test("real ListView keeps legacy toolbar and supports hidden actions plus unsliced server pages", () => {
  const React = require("react"); const {renderToStaticMarkup} = require("react-dom/server");
  const {default: ListView} = loader({"./providers/DataProvider": {}, "./components/fields/Selector": {__esModule: true, default: () => null}})("packages/ui/src/ListView.tsx");
  const props = {schema: {db: {table: "projects"}, fields: root.fields.slice(0, 1)}, data: [{id: "p", name: "ACME"}], onCreate() {}, onExport() {}, onImport() {}};
  const normal = renderToStaticMarkup(React.createElement(ListView, props));
  assert.match(normal, /bi-plus-lg/); assert.match(normal, /Mostrar filtros/); assert.match(normal, /bi-download/);
  const results = renderToStaticMarkup(React.createElement(ListView, {...props, toolbar: {create: false, search: false}, pagination: {page: 2, pageSize: 10, total: 23, onChange() {}}}));
  assert.doesNotMatch(results, /bi-plus-lg|Mostrar filtros/); assert.match(results, /ACME/); assert.match(results, /11-20 de 23/);
  const restricted = renderToStaticMarkup(React.createElement(ListView, {...props, schema: {...props.schema, capabilities: {allowExport: false, allowImport: false}}}));
  assert.doesNotMatch(restricted, /bi-download|bi-upload/);
});

test("ListPageClient combines effective permissions and capabilities in advanced results", () => {
  const React = require("react"); const {renderToStaticMarkup} = require("react-dom/server");
  for (const capability of [false, true]) for (const permitted of [false, true]) {
    const {default: Page} = loader({
      "@repo/ui": {ListView: props => React.createElement("div", null,
        props.onExport && "EXPORT", props.onImport && "IMPORT", props.onCreate && "CREATE", props.onSearch && "SEARCH")},
      "./AdvancedSearchView": {AdvancedSearchView: props => props.children({data: [], onExport: props.onExport})},
      "@/lib/perms": {usePerms: () => ({loading: false, hasPermiso: (_, action) => action === "ver" || permitted}), RequirePerms: props => props.children},
      "@/lib/supabase/client": {}, "@/lib/hooks/useConfirm": {useConfirm: () => ({})},
      "next/navigation": {useRouter: () => ({})},
    })("apps/web/lib/ListPageClient.tsx");
    const html = renderToStaticMarkup(React.createElement(Page, {advancedSearch: true, rows: [], moduleSlug: "projects", baseRoute: "/m/projects", titleSingular: "Proyecto",
      schema: {...root, capabilities: {allowImport: capability, allowExport: capability}}}));
    assert.equal(html.includes("EXPORT"), capability && permitted);
    assert.equal(html.includes("IMPORT"), capability && permitted);
    assert.doesNotMatch(html, /CREATE|SEARCH/);
  }
});

test("filter summary renders labels, nested logic and readable values without editor controls", () => {
  const React = require("react"); const {renderToStaticMarkup} = require("react-dom/server");
  const {FilterExpressionSummary} = loader({"./components/fields/Selector": {__esModule: true, default: () => null}})("packages/ui/src/FilterExpressionSummary.tsx");
  const fields = types.advancedSearchFields(root, {clients: related.schema});
  const html = renderToStaticMarkup(React.createElement(FilterExpressionSummary, {fields, filter: group([
    condition("active", "=", false), group([condition("name", "contains", "ACME", "client_id"), condition("amount", "between", [10, 20])], "OR"),
  ])}));
  assert.match(html, /TODAS · AND/); assert.match(html, /CUALQUIERA · OR/);
  assert.match(html, /Cliente &gt; Nombre cliente/); assert.match(html, /Contiene/); assert.match(html, /Falso/); assert.match(html, /10 y 20/);
  assert.doesNotMatch(html, /<select|<input|client_id|"kind"/);
  const empty = renderToStaticMarkup(React.createElement(FilterExpressionSummary, {fields, filter: group()}));
  assert.match(empty, /No hay condiciones configuradas/); assert.doesNotMatch(empty, /jiro-filter-group/);
});
