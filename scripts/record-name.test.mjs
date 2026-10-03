import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(resolve("apps/web/package.json"));
const cache = new Map();
function load(file) {
  const path = resolve(file);
  if (cache.has(path)) return cache.get(path);
  const result = { exports: {} };
  const js = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)(id => {
    if (id === "@repo/types") return { ...load("packages/types/recordName.ts"), ...load("packages/types/normalizeModuleSchema.ts") };
    if (id.startsWith(".")) { const p = resolve(dirname(path), id); return load(p + (existsSync(p + ".ts") ? ".ts" : ".tsx")); }
    return require(id);
  }, result, result.exports);
  cache.set(path, result.exports);
  return result.exports;
}
const { getRecordName, getRecordNameField, getRecordNameFieldName, updateRecordNameField } = load("packages/types/recordName.ts");
const { normalizeModuleSchema } = load("packages/types/normalizeModuleSchema.ts");
const schema = { db: { table: "clients", primaryKey: "key" }, ui: { displayField: "old" }, fields: [{ name: "legal", label: "Razón social", type: "text", recordName: true }, { name: "tax", label: "CIF", type: "text" }] };

test("explicit name overrides legacy display, retains technical ids and survives JSON normalization", () => {
  const normalized = normalizeModuleSchema(JSON.parse(JSON.stringify(schema)));
  assert.equal(getRecordNameField(normalized).name, "legal");
  assert.equal(getRecordNameFieldName(normalized, "old"), "legal");
  const row = { key: "42", legal: "ACME S.L.", old: "Old", tax: "CIF-1" };
  assert.equal(getRecordName(row, normalized, { legacyField: "old" }), "ACME S.L.");
  assert.equal(row.key, "42");
});

test("single selection transfers, clears and preserves the original schema", () => {
  const fields = updateRecordNameField(schema.fields, 1, { ...schema.fields[1], recordName: true });
  assert.equal(fields[0].recordName, false);
  assert.equal(fields[1].recordName, true);
  assert.equal(schema.fields[0].recordName, true);
  assert.equal(getRecordName({ tax: "CIF-1" }, { fields }), "CIF-1");
  assert.equal(getRecordNameField({ fields: updateRecordNameField(fields, 1, { ...fields[1], recordName: false }) }), undefined);
});

test("legacy names and custom primary keys remain supported; empty configured names fall directly to id", () => {
  assert.equal(getRecordName({ key: "k", old: "Legacy" }, { ...schema, fields: [] }), "Legacy");
  assert.equal(getRecordName({ key: "k", old: "Legacy" }, { ...schema, fields: [] }, { legacyField: "missing" }), "k");
  for (const value of [null, undefined, "", "  ", {}]) assert.equal(getRecordName({ key: "k", old: "Legacy", legal: value }, schema), "k");
  assert.equal(getRecordName({ legal: 0 }, schema), "0");
  assert.equal(getRecordName({ legal: false }, schema), "false");
  assert.equal(getRecordName({ id: "fallback" }, schema), "fallback");
});

test("normalization rejects multiple names and invalid flags, without modifying legacy schemas", () => {
  assert.throws(() => normalizeModuleSchema({ ...schema, fields: schema.fields.map(field => ({ ...field, recordName: true })) }), /Solo un campo/);
  assert.throws(() => normalizeModuleSchema({ ...schema, fields: [{ ...schema.fields[0], recordName: "true" }] }), /boolean/);
  assert.equal(normalizeModuleSchema({ ...schema, fields: [schema.fields[1]] }).fields[0].recordName, undefined);
});

test("bulk relation resolution selects the configured column, preserves ids/icons and overrides embedded legacy labels", async () => {
  const { preloadRelationDisplayCache, getRelationDisplayConfig, getRelationCacheKey, getRelationDisplayResult } = load("packages/ui/src/utils/relationDisplay.tsx");
  const field = { name: "client", type: "selectorTabla", ref: { moduleSlug: "clients", displayField: "old", valueField: "key", hasStyle: true } };
  let calls = 0;
  const result = await preloadRelationDisplayCache({ rows: [{ client: "k" }, { client: "j" }], fields: [field], getValue: (row, f) => row[f.name], cache: {}, dataProvider: {
    getSchema: async () => schema,
    lookup: async input => { calls++; assert.ok(input.select.includes("legal")); assert.ok(!input.select.includes("old")); return [{ key: "k", legal: "ACME", icon: "bi-building", color: "#fff" }, { key: "j", legal: "Other" }]; },
  } });
  assert.equal(calls, 1);
  const config = getRelationDisplayConfig(field);
  assert.deepEqual(result.patch[getRelationCacheKey(config, "k")], { label: "ACME", icon: "bi-building", color: "#fff" });
  assert.equal(getRelationDisplayResult({ config, rawValue: "k", cache: result.patch }).entry.label, "ACME");
  assert.equal(getRelationDisplayResult({ config, rawValue: { id: "k", old: "Old embedded label" }, cache: result.patch }).entry.label, "ACME");
});

test("relations without schema metadata keep legacy labels", async () => {
  const { preloadRelationDisplayCache } = load("packages/ui/src/utils/relationDisplay.tsx");
  const result = await preloadRelationDisplayCache({ rows: [{ client: "k" }], fields: [{ name: "client", type: "selectorTabla", ref: { moduleSlug: "clients", displayField: "old" } }], getValue: row => row.client, cache: {}, dataProvider: { list: async () => ({ data: [{ id: "k", old: "Legacy" }] }) } });
  assert.equal(Object.values(result.patch)[0].label, "Legacy");
});

test("plan record search and labels use Record name but preserve valueField", async () => {
  const { loadLinkTargetRecords } = load("packages/ui/src/components/specialViews/PlanEditorView/planDataSources.ts");
  const result = await loadLinkTargetRecords({ moduleSlug: "clients", displayField: "old", valueField: "key" }, { getSchema: async () => schema, list: async input => {
    assert.equal(input.filters[0].field, "legal");
    return { data: [{ key: "k", legal: "ACME", old: "Old" }] };
  } }, "ACME");
  assert.equal(result[0].recordId, "k");
  assert.equal(result[0].displayValue, "ACME");
});

test("the module editor updates its JSON with one selected field in create and edit configurations", () => {
  const source = readFileSync("packages/ui/src/ModuloForm/ModuloForm.tsx", "utf8");
  const ast = ts.createSourceFile("ModuloForm.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let update;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "updateField") update = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(update);
  const code = ts.transpileModule(`const update = ${update};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const original of [schema, { ...schema, fields: schema.fields.map(field => ({ ...field, recordName: false })) }]) {
    let next, raw;
    new Function("propsObj", "updateRecordNameField", "setPropsObj", "setRawText", `${code}; update(1, {...propsObj.fields[1], recordName: true});`)(original, updateRecordNameField, value => { next = value; }, value => { raw = value; });
    assert.deepEqual(JSON.parse(raw), next);
    assert.equal(next.fields.filter(field => field.recordName).length, 1);
    assert.equal(next.fields[1].recordName, true);
    assert.equal(normalizeModuleSchema(JSON.parse(raw)).fields[1].recordName, true);
  }
});

test("schema metadata loads are shared and invalidated after editing a module", async () => {
  const { dataProvider, invalidateModuleSchemaCache } = load("packages/ui/src/providers/DataProvider.ts");
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: true, json: async () => ({ ok: true, data: [{ slug: "clients", props: schema }] }) };
  };
  try {
    await Promise.all([dataProvider.getSchema("clients"), dataProvider.getSchema("clients")]);
    assert.equal(calls, 1);
    await dataProvider.getSchema("clients");
    assert.equal(calls, 1);
    invalidateModuleSchemaCache();
    await dataProvider.getSchema("clients");
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; invalidateModuleSchemaCache(); }
});
