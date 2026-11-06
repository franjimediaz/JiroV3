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


const schema = { db: { table: "modulos", primaryKey: "id" }, fields: [
  { name: "id", type: "text" }, { name: "nombre", type: "text", recordName: true }, { name: "slug", type: "text" },
] };
for (const scenario of [
  { name: "exact ModuloForm regression without style configuration", hasStyle: false, expected: ["nombre"] },
  { name: "disabled", hasStyle: false, styleIconField: "missing", expected: ["nombre"] },
  { name: "enabled without legacy fields", hasStyle: true, expected: ["nombre"] },
  { name: "legacy", hasStyle: true, extra: ["icon", "color"], expected: ["nombre", "icon", "color"] },
  { name: "explicit", hasStyle: true, styleIconField: "customIcon", styleColorField: "customColor", expected: ["nombre", "customIcon", "customColor"] },
  { name: "related", hasStyle: true, styleColorField: { relations: ["category"], field: "color" }, expected: ["nombre", { relations: ["category"], field: "color" }] },
  { name: "explicit invalid remains requested", hasStyle: true, styleIconField: "missing", expected: ["nombre", "missing"] },
]) {
  test("SelectorTabla popup and selected IDs: " + scenario.name, async () => {
    const requests = [], states = [], effects = [];
    const row = { id: "1", nombre: "M?dulos", icon: "bi-box", color: "red", customIcon: "bi-star", customColor: "blue", category: { color: "green" } };
    const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: "fragment",
      useState: initial => { const i = states.length; states.push(initial); return [initial, value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
      useMemo: fn => fn(), useCallback: fn => fn, useEffect: fn => effects.push(fn),
    };
    const load = loader({ react, "../../modals/PopUpSelector": { PopupSelector: () => null }, "../../providers/DataProvider": { dataProvider: {
      getSchema: async () => ({ ...schema, fields: [...schema.fields, ...(scenario.extra || []).map(name => ({ name, type: "text" }))] }),
      list: async input => { requests.push(input); return { data: [row] }; },
    } } });
    const Selector = load("packages/ui/src/components/fields/Selector.tsx").default;
    const tree = Selector({ ...scenario, moduleSlug: "modulos", displayField: "nombre", value: "1", onChange() {} });
    await tree.props.children[0].props.onClick();
    assert.deepEqual(requests[0].fieldRefs, scenario.expected);
    assert.equal(states[1][0].label, "M?dulos");
    if (scenario.expected.length === 1) { assert.equal(states[1][0].icon, undefined); assert.equal(states[1][0].color, undefined); }
    if (scenario.name === "legacy") assert.deepEqual([states[1][0].icon, states[1][0].color], ["bi-box", "red"]);
    if (scenario.name === "explicit") assert.deepEqual([states[1][0].icon, states[1][0].color], ["bi-star", "blue"]);
    if (scenario.name === "related") assert.equal(states[1][0].color, "green");
    for (const effect of effects) effect();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests[1].fieldRefs, scenario.expected);
  });
}
test("style refs deduplicate and exclude virtual legacy fields", () => {
  const { resolveSelectorStyle, selectorFieldRefs } = loader()("packages/ui/src/utils/selectorStyle.ts");
  const style = resolveSelectorStyle({ hasStyle: true }, { fields: [{ name: "icon", virtual: true }, { name: "color" }] });
  assert.deepEqual(selectorFieldRefs(["color", { field: "color" }], style), ["color"]);
});

test("relationDisplay shares schema-aware legacy and related style resolution", async () => {
  const { preloadRelationDisplayCache, getRelationDisplayConfig, getRelationBucketKey } = loader()("packages/ui/src/utils/relationDisplay.tsx");
  for (const hasStyle of [false, true]) {
    const calls = [];
    const result = await preloadRelationDisplayCache({ rows: [{ target: "1" }], fields: [{ name: "target", type: "selectorTabla", ref: { moduleSlug: "modulos", displayField: "nombre", hasStyle } }], getValue: row => row.target, cache: {}, dataProvider: {
      getSchema: async () => schema,
      lookup: async input => { calls.push(input); return [{ id: "1", nombre: "Modules", icon: "ignored" }]; },
    } });
    assert.deepEqual(calls[0].select, ["id", "nombre"]);
    assert.deepEqual(Object.values(result.patch)[0], { label: "Modules", icon: undefined, color: undefined });
  }
  const ref = { relations: ["category"], field: "color" };
  const field = { name: "target", type: "selectorTabla", ref: { moduleSlug: "modulos", displayField: "nombre", hasStyle: true, styleColorField: ref } };
  const result = await preloadRelationDisplayCache({ rows: [{ target: "1" }], fields: [field], getValue: row => row.target, cache: {}, dataProvider: {
    getSchema: async () => schema,
    lookup: async () => { throw new Error("Related refs must use list"); },
    list: async input => { assert.deepEqual(input.fieldRefs, ["nombre", ref]); return { data: [{ id: "1", nombre: "Modules", category: { color: "green" } }] }; },
  } });
  assert.equal(Object.values(result.patch)[0].color, "green");
  assert.notEqual(getRelationBucketKey(getRelationDisplayConfig(field)), getRelationBucketKey(getRelationDisplayConfig({ ...field, ref: { ...field.ref, styleColorField: { relations: ["other"], field: "color" } } })));
});
