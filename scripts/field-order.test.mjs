import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(resolve("packages/ui/package.json"));
function load(file, overrides = {}) {
  const path = resolve(file), module = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function("require", "module", "exports", code)(id => {
    if (id in overrides) return overrides[id];
    if (id.startsWith(".")) {
      const base = resolve(dirname(path), id);
      if (existsSync(base + ".ts")) return load(base + ".ts", overrides);
    }
    return require(id);
  }, module, module.exports);
  return module.exports;
}
const { reorderFields, createFieldIdentity, updateSectionReferences, duplicateField } = load("packages/ui/src/ModuloForm/fieldOrder.ts");
const { orderedSectionFields } = load("packages/ui/src/utils/formFieldOrder.ts");
const { normalizeModuleSchema } = load("packages/types/normalizeModuleSchema.ts");
const field = name => ({ name, label: name, type: "text" });

test("drag moves the whole field, keeps input immutable and survives JSON normalization/reload", () => {
  const a = field("a"), b = field("b");
  const c = { ...field("c"), type: "address", virtual: true, required: true, address: { countries: ["ES"] }, compute: { type: "none" }, ref: { future: true }, options: ["one"], ui: { size: 2 }, appearance: { color: "red" }, defaultValue: { formatted: "Madrid" }, future: { allowed: true } };
  const input = Object.freeze([a, b, c]);
  const moved = reorderFields(input, c, b);
  assert.deepEqual(moved.map(f => f.name), ["a", "c", "b"]);
  assert.deepEqual(input.map(f => f.name), ["a", "b", "c"]);
  assert.equal(moved[1], c);
  const rawText = JSON.stringify({ db: { table: "records" }, fields: moved }, null, 2);
  const parsed = JSON.parse(rawText);
  assert.deepEqual(parsed.fields[1], c);
  assert.deepEqual(normalizeModuleSchema(parsed).fields.map(f => f.name), ["a", "c", "b"]);
  assert.equal(reorderFields(input, a, a), input);
  assert.equal(reorderFields(input, field("unknown"), b), input);
});

test("section membership and unassigned fields both follow global order", () => {
  const fields = [field("a"), field("b"), field("c"), field("d")];
  assert.deepEqual(orderedSectionFields(fields, ["c", "a", "a", "missing"]).map(f => f.name), ["a", "c"]);
  const assigned = new Set(["c", "a"]);
  assert.deepEqual(fields.filter(f => !assigned.has(f.name)).map(f => f.name), ["b", "d"]);
  const moved = reorderFields(fields, fields[2], fields[0]);
  assert.deepEqual(orderedSectionFields(moved, ["a", "c"]).map(f => f.name), ["c", "a"]);
});

test("session drag IDs remain stable across reorder, including duplicate or empty names", () => {
  const identify = createFieldIdentity();
  const fields = [field("same"), field("same"), field("")];
  const ids = fields.map(identify);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(reorderFields(fields, fields[2], fields[1]).map(identify), [ids[0], ids[2], ids[1]]);
  assert.deepEqual(Object.keys(fields[0]), ["name", "label", "type"]);
});

test("rename/remove cleans legacy and tab section references without modifying other config", () => {
  const sections = [{ id: "main", label: "Main", fields: ["a", "c"] }];
  const schema = { db: { table: "records" }, fields: [field("a"), field("c")], ui: { formSections: sections, tabs: [{ id: "tab", type: "form", config: { future: true, formSections: sections } }, { id: "other", type: "treeview", config: { keep: true } }] } };
  const renamed = updateSectionReferences(schema, "c", "phone");
  assert.deepEqual(renamed.ui.formSections[0].fields, ["a", "phone"]);
  assert.deepEqual(renamed.ui.tabs[0].config.formSections[0].fields, ["a", "phone"]);
  assert.equal(renamed.ui.tabs[0].config.future, true);
  assert.equal(renamed.ui.tabs[1], schema.ui.tabs[1]);
  assert.deepEqual(updateSectionReferences(renamed, "phone").ui.formSections[0].fields, ["a"]);
  assert.deepEqual(schema.ui.formSections[0].fields, ["a", "c"]);
});

test("duplicate creates a separate full field with an available name", () => {
  const original = { ...field("a"), address: { countries: ["ES"] } };
  const copy = duplicateField(original, [original, field("a_copy"), field("a_copy_2")]);
  assert.equal(copy.name, "a_copy_3");
  copy.address.countries.push("PT");
  assert.deepEqual(original.address.countries, ["ES"]);
});

test("shared menu renders Bootstrap metadata as icons, preserving custom React icons", () => {
  const { MenuIcon } = load("packages/ui/src/MenuIcon.tsx");
  const { createElement } = require("react");
  const { renderToStaticMarkup } = createRequire(resolve("apps/web/package.json"))("react-dom/server");
  for (const icon of ["bi-pencil", "bi bi-copy", "bi-trash"]) {
    const html = renderToStaticMarkup(createElement(MenuIcon, { icon }));
    assert.match(html, /<i class="bi bi-/);
    assert.match(html, /aria-hidden="true"/);
    assert.doesNotMatch(html, />bi-/);
  }
  assert.equal(renderToStaticMarkup(createElement(MenuIcon, { icon: createElement("svg", { "data-custom": "yes" }) })), '<svg data-custom="yes"></svg>');
});

test("all editor field lists use drag only and synchronize raw JSON on drop", () => {
  const editor = readFileSync("packages/ui/src/ModuloForm/ModuloForm.tsx", "utf8");
  const row = readFileSync("packages/ui/src/ModuloForm/FieldRow.tsx", "utf8");
  const form = readFileSync("packages/ui/src/Form.tsx", "utf8");
  assert.doesNotMatch(editor + row, /onMoveUp|onMoveDown|canUp|canDown|const moveField/);
  assert.match(editor, /renderFields\(propsObj.fields\)/);
  assert.match(editor, /renderFields\(fieldsInSection\)/);
  assert.match(editor, /renderFields\(unassigned/);
  assert.match(editor, /const onReorderFields[\s\S]*?setPropsObj\(next\);\s*setRawText\(JSON.stringify\(serializeModuleSchema\(next\), null, 2\)\)/);
  assert.match(editor, /onClick=\{applyRawJson\}/);
  assert.match(form, /orderedSectionFields\(normalizedSchema.fields/);
  assert.doesNotMatch(form, /unsectionedFields/);
  assert.doesNotMatch(form, /section.fields.map/);
});

test("drag context commits only valid drops, supports keyboard and respects readOnly", () => {
  const identify = createFieldIdentity();
  const sensors = [];
  const { SortableFieldList } = load("packages/ui/src/ModuloForm/SortableFieldList.tsx", {
    react: { useId: () => "list", useState: () => [identify] },
    "@dnd-kit/core": { DndContext: "context", closestCenter: "closest", PointerSensor: "pointer", KeyboardSensor: "keyboard",
      useSensor: (sensor, options) => { sensors.push({ sensor, options }); return sensor; }, useSensors: (...items) => items },
    "@dnd-kit/sortable": { SortableContext: "sortable", sortableKeyboardCoordinates: "coordinates", verticalListSortingStrategy: "vertical" },
    "./FieldRow": { FieldRow: "field-row" }, "./modulo-detalle.module.css": {},
  });
  const fields = [field("a"), field("b"), field("c")];
  const calls = [];
  const props = { fields, rowProps: {}, onReorder: (...args) => calls.push(args) };
  const tree = SortableFieldList(props);
  assert.equal(tree.props.onDragMove, undefined);
  assert.equal(sensors[0].options.activationConstraint.distance, 8);
  assert.equal(sensors[1].options.coordinateGetter, "coordinates");
  tree.props.onDragEnd({ active: { id: identify(fields[2]) }, over: null });
  tree.props.onDragEnd({ active: { id: identify(fields[2]) }, over: { id: identify(fields[2]) } });
  assert.equal(calls.length, 0);
  tree.props.onDragEnd({ active: { id: identify(fields[2]) }, over: { id: identify(fields[1]) } });
  assert.deepEqual(calls, [[fields[2], fields[1]]]);
  SortableFieldList({ ...props, rowProps: { readOnly: true } }).props.onDragEnd({ active: { id: identify(fields[2]) }, over: { id: identify(fields[1]) } });
  assert.equal(calls.length, 1);
});
