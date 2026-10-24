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
    const mod = { exports: {} }; cache.set(path, mod);
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    }}).outputText;
    new Function("require", "module", "exports", code)(id => {
      if (id in overrides) return overrides[id];
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

const modules = {
  tasks: { slug: "tasks", permissionsKey: "tasks", table: "tasks", primaryKey: "id", schema: { db: { table: "tasks" }, fields: [
    { name: "title", label: "Titulo", type: "text" },
    { name: "service", label: "Servicio", type: "selectorTabla", ref: { moduleSlug: "services", displayField: "name" } },
    { name: "broken", label: "Roto", type: "text" },
  ] } },
  services: { slug: "services", permissionsKey: "services", table: "services", primaryKey: "id", schema: { db: { table: "services" }, fields: [
    { name: "name", label: "Nombre", type: "text" },
    { name: "category", label: "Categoria", type: "selectorTabla", ref: { moduleSlug: "categories", displayField: "name" } },
  ] } },
  categories: { slug: "categories", permissionsKey: "categories", table: "categories", primaryKey: "id", schema: { db: { table: "categories" }, fields: [
    { name: "name", label: "Nombre", type: "text" },
    { name: "color", label: "Color", type: "color" },
    { name: "back", label: "Volver", type: "selectorTabla", ref: { moduleSlug: "tasks", displayField: "title" } },
  ] } },
};
const dependencies = {
  resolveModuleConfig: async slug => modules[slug],
  requireModulePermission: async () => ({}),
};
const load = loader({
  "../modules/resolveModuleConfig": dependencies,
  "../auth/requireModulePermission": dependencies,
  "./modules/resolveModuleConfig": dependencies,
  "./auth/requireModulePermission": dependencies,
});
const refs = load("packages/types/fieldRefs.ts");
const resolver = load("apps/web/lib/fields/resolveFieldRef.ts");
const planner = load("apps/web/lib/fields/fieldRefQuery.ts");

test("FieldRef normalizes legacy strings and reads hydrated paths up to three relations", () => {
  assert.deepEqual(refs.normalizeFieldRef(" title "), { field: "title", relations: [] });
  const ref = { relations: ["service", "category"], field: "color" };
  assert.deepEqual(refs.normalizeFieldRef(ref), ref);
  assert.equal(refs.getFieldRefValue({ service: { category: { color: "#123456" } } }, ref), "#123456");
  assert.equal(refs.formatFieldRefPath(ref), "service > category > color");
});

test("RelatedFieldSelector resolves direct and nested labels, filters types, preserves invalid paths and caches schemas", async () => {
  const react = { __esModule: true, default: { createElement() {} }, useEffect() {}, useMemo() {}, useState() {} };
  const uiLoad = loader({ react, "../../providers/DataProvider": { dataProvider: {} } });
  const selector = uiLoad("packages/ui/src/components/fields/RelatedFieldSelector.tsx");
  const calls = [];
  const dataProvider = { getSchema: async slug => {
    calls.push(slug);
    if (!modules[slug]) throw new Error("missing");
    return modules[slug].schema;
  } };
  selector.clearRelatedFieldSchemaCache();

  assert.deepEqual(await selector.describeRelatedFieldPath({ dataProvider, sourceModuleSlug: "tasks", value: "title" }),
    { label: "Titulo", valid: true });
  assert.deepEqual(await selector.describeRelatedFieldPath({ dataProvider, sourceModuleSlug: "tasks",
    value: { relations: ["service", "category"], field: "color" } }),
    { label: "Servicio › Categoria › Color", valid: true });
  assert.deepEqual(await selector.describeRelatedFieldPath({ dataProvider, sourceModuleSlug: "tasks",
    value: { relations: ["service"], field: "missing" } }),
    { label: "service > missing", valid: false });
  assert.deepEqual(await selector.describeRelatedFieldPath({ dataProvider, sourceModuleSlug: "services", value: "name" }),
    { label: "Nombre", valid: true });
  assert.deepEqual(calls.sort(), ["categories", "services", "tasks"]);

  const options = selector.listRelatedFieldOptions({ schema: modules.categories.schema,
    allowedField: field => field.type === "color" });
  assert.deepEqual(options.selectable.map(field => field.name), ["color"]);
  assert.deepEqual(options.relationFields.map(field => field.name), ["back"]);
  assert.equal(selector.listRelatedFieldOptions({ schema: modules.categories.schema, depth: 3 }).relationFields.length, 0);
});

test("resolver validates hops, fields, cycles, depth and permissions", async () => {
  const checked = [];
  const deps = { ...dependencies, requireModulePermission: async (slug, action) => checked.push([slug, action]) };
  const resolved = await resolver.resolveFieldRef("tasks", { relations: ["service", "category"], field: "color" }, deps);
  assert.equal(resolved.targetTable, "categories");
  assert.deepEqual(resolved.relations.map(item => item.field), ["service", "category"]);
  assert.deepEqual(checked, [["tasks", "ver"], ["services", "ver"], ["categories", "ver"]]);
  await assert.rejects(resolver.resolveFieldRef("tasks", { relations: ["broken"], field: "name" }, deps), /selectorTabla/);
  await assert.rejects(resolver.resolveFieldRef("tasks", { relations: ["service"], field: "missing" }, deps), /no existe/);
  await assert.rejects(resolver.resolveFieldRef("tasks", { relations: ["service", "category", "back"], field: "title" }, deps), /ciclo/);
  await assert.rejects(resolver.resolveFieldRef("tasks", { relations: ["service", "category", "back", "service"], field: "name" }, deps), /supera/);
});

test("planner deduplicates joins and uses one resolved plan regardless of row count", async () => {
  const calls = new Map();
  const deps = { ...dependencies, resolveModuleConfig: async slug => {
    calls.set(slug, (calls.get(slug) || 0) + 1); return modules[slug];
  }};
  const input = { relations: ["service", "category"], field: "color" };
  const resolved = await resolver.resolveFieldRefs("tasks", Array.from({ length: 100 }, () => input), deps);
  assert.deepEqual(Object.fromEntries(calls), { tasks: 1, services: 1, categories: 1 });
  const select = planner.buildFieldRefSelect(resolved, []);
  assert.equal(select.length, 1);
  assert.match(select[0], /service:services!service\(category:categories!category\(color\)\)/);
});

test("related filters and sorts are applied to hydrated relation paths", async () => {
  const resolved = await resolver.resolveFieldRefs("tasks", [
    { relations: ["service", "category"], field: "color" },
    { relations: ["service"], field: "name" },
  ], dependencies);
  const calls = [];
  const query = new Proxy({}, { get: (_, method) => (...args) => { calls.push([method, ...args]); return query; } });
  planner.applyFieldRefFilters(query, [{ field: { relations: ["service", "category"], field: "color" }, op: "=", value: "red" }], resolved);
  planner.applyFieldRefSort(query, [{ field: { relations: ["service"], field: "name" }, direction: "asc" }], resolved);
  assert.deepEqual(calls[0], ["eq", "service.category.color", "red"]);
  assert.deepEqual(calls[1], ["order", "service(name)", { ascending: true }]);
  assert.throws(() => planner.applyFieldRefSort(query, [
    { field: { relations: ["service", "category"], field: "color" }, direction: "asc" },
  ], resolved), /más de un nivel/);
});

test("nested default filter groups compile related predicates for one server query", async () => {
  const inputs = [{ relations: ["service", "category"], field: "color" }, "title"];
  const resolved = await resolver.resolveFieldRefs("tasks", inputs, dependencies);
  const compiled = planner.compileFieldRefFilterGroup({ logic: "OR", items: [
    { field: inputs[0], op: "=", value: "red" },
    { field: "title", op: "contains", value: "urgent" },
  ] }, resolved);
  assert.equal(compiled.embeds.length, 1);
  assert.match(compiled.embeds[0].select, /jiro_default_0:services!service\(category:categories!category!inner\(\)\)/);
  assert.match(compiled.embeds[0].expression, /category\.color\.eq\."red"/);
  assert.equal(compiled.expression, 'or(jiro_default_0.not.is.null,title.ilike."%urgent%")');
});

test("formula dependencies sharing a relation are hydrated in one batch", async () => {
  const compute = load("packages/ui/src/engines/computeEngine.ts");
  const fields = [
    { name: "quantity", type: "number" },
    { name: "service", type: "selectorTabla", ref: { moduleSlug: "services", valueField: "id", displayField: "name" } },
    { name: "total", type: "number", compute: { type: "formula", expr: "quantity * service_price + service_tax", deps: ["quantity"], dependencies: [
      { token: "service_price", ref: { relations: ["service"], field: "price" } },
      { token: "service_tax", ref: { relations: ["service"], field: "tax" } },
    ], persist: "none" } },
  ];
  const calls = [];
  const result = await compute.applyCompute({ schema: { fields }, record: { quantity: 2, service: "svc-1" }, dataProvider: {
    aggregate: async () => 0,
    list: async input => { calls.push(input); return { data: [{ id: "svc-1", price: 10, tax: 3 }] }; },
  } });
  assert.equal(result.total, 23);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].fieldRefs, [{ field: "price", relations: [] }, { field: "tax", relations: [] }]);
});

test("visibility reads a canonical two-hop FieldRef from a hydrated related record", () => {
  const visibility = load("packages/ui/src/engines/visibilityEngine.ts");
  const rule = { field: { relations: ["customer", "country"], field: "code" }, op: "=", value: "ES" };
  const values = { customer: "customer-1" };
  const relatedRecordsByField = { customer: { country: { code: "ES" } } };
  assert.equal(visibility.getRuleLeftValue(rule, values, relatedRecordsByField), "ES");
  assert.equal(visibility.evaluateVisibilityConfig({ visibility: { enabled: true, rules: [rule] }, values,
    schema: { db: { table: "orders" }, fields: [] }, relatedRecordsByField }), true);
});

test("PlanEditor and CreateRelated consume related reads while destinations stay direct", () => {
  const plan = load("packages/ui/src/components/specialViews/PlanEditorView/planDataSources.ts");
  const createRelated = load("packages/ui/src/utils/createRelatedPayload.ts");
  const symbol = plan.normalizeSymbolRecord({ id: "1", kind: { category: { color: "#123456" } } }, {
    enabled: true, moduleSlug: "objects", valueField: "id", labelField: "id",
    colorField: { relations: ["kind", "category"], field: "color" },
  });
  assert.equal(symbol.color, "#123456");
  assert.deepEqual(createRelated.buildCreateRelatedPayload({
    type: "createRelated", target: { moduleSlug: "contacts" },
    fieldMap: { customerName: { relations: ["customer"], field: "name" } }, defaults: { active: true },
  }, { db: { table: "orders" }, fields: [] }, { customer: { name: "ACME" } }), { customerName: "ACME", active: true });
});
