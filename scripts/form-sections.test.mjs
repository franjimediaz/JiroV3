import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createSourceLoader } from "./helpers/dashboard-fixtures.mjs";

const load = createSourceLoader();
const { orderedSectionFields } = load("packages/ui/src/utils/formFieldOrder.ts");
const { normalizeModuleSchema } = load("packages/types/normalizeModuleSchema.ts");
const source = readFileSync("packages/ui/src/Form.tsx", "utf8");
const ast = ts.createSourceFile("Form.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expressions = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ["renderFormContent", "formSections", "fieldsInSections", "reverseLinkFields", "trailingReverseLinks", "displayedReverseLinks", "displayedReverseLinkId", "renderField"].includes(node.name.getText(ast))) expressions[node.name.getText(ast)] = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);

// Execute the actual renderer/selection expressions with field rendering observed.
function evaluate(name, context) {
  assert.ok(expressions[name], name);
  const code = ts.transpileModule(`const result = ${expressions[name]};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(context), `${code}; return result;`)(...Object.values(context));
}
function render(fields, sections, extra = {}) {
  const rendered = [];
  const fieldsInSections = new Set(sections.flatMap(section => section.fields || []));
  const trailingReverseLinks = evaluate("trailingReverseLinks", { formSections: sections, reverseLinkFields: fields.filter(field => field.type === "ReverseLink"), fieldsInSections, useMemo: fn => fn() });
  const renderFormContent = evaluate("renderFormContent", {
    React: { createElement: () => null },
    formSections: sections,
    normalizedSchema: { fields },
    openSections: Object.fromEntries(sections.map(section => [section.id, true])),
    toggleSection() {}, orderedSectionFields, trailingReverseLinks,
    renderField(field) { rendered.push(field); return null; },
    ...extra,
  });
  renderFormContent();
  // The separate historical relation block receives the trailing list.
  if (sections.length) rendered.push(...trailingReverseLinks);
  return rendered;
}
const fields = ["a", "b", "c"].map(name => Object.freeze({ name, type: "text" }));
const section = names => ({ id: "general", label: "General", fields: names });

for (const [label, sections, expected] of [
  ["only section members", [section(["a", "c"])], ["a", "c"]],
  ["flat form with no sections", [], ["a", "b", "c"]],
  ["global order overrides section references", [section(["c", "a"])], ["a", "c"]],
  ["unknown references are ignored", [section(["a", "x"])], ["a"]],
  ["configured empty section has no fallback", [section([])], []],
]) test(label, () => {
  assert.deepEqual(render(Object.freeze(fields), sections).map(field => field.name), expected);
});

test("duplicate membership across sections retains existing rendering semantics", () => {
  assert.deepEqual(render(fields, [section(["a"]), { ...section(["a"]), id: "second" }]).map(field => field.name), ["a", "a"]);
});

test("each form tab selects its own sections, including an empty section list", () => {
  const normalizedSchema = normalizeModuleSchema({ fields, ui: { tabs: [
    { id: "first", type: "form", config: { formSections: [section(["a"])] } },
    { id: "second", type: "form", config: { formSections: [section(["b"])] } },
    { id: "flat", type: "form", config: { formSections: [] } },
  ] } });
  for (const [index, names] of [[0, ["a"]], [1, ["b"]], [2, ["a", "b", "c"]]]) {
    const selected = evaluate("formSections", { activeTab: normalizedSchema.ui.tabs[index], normalizedSchema, useMemo: fn => fn() });
    assert.deepEqual(render(normalizedSchema.fields, selected).map(field => field.name), names);
  }
});

test("legacy sections normalize into the same exclusive form renderer", () => {
  const normalized = normalizeModuleSchema({ fields, ui: { formSections: [section(["c"])] } });
  const sections = evaluate("formSections", { activeTab: normalized.ui.tabs[0], normalizedSchema: normalized, useMemo: fn => fn() });
  assert.deepEqual(render(normalized.fields, sections).map(field => field.name), ["c"]);
});

test("selection delegates unchanged fields to renderField for visibility and mode rules", () => {
  const field = Object.freeze({ name: "a", virtual: true, readOnly: true, visibleWhen: "condition", visibility: { mode: "conditional" }, appearance: "Zoom" });
  for (const sections of [[], [section(["a"])]]) {
    assert.equal(render([field], sections)[0], field);
  }
  assert.deepEqual(render(fields, [section(["a"])], { openSections: {} }), []);
});

const reverseFields = Object.freeze([
  Object.freeze({ name: "a", type: "text" }),
  Object.freeze({ name: "reverse1", type: "ReverseLink" }),
  Object.freeze({ name: "b", type: "text" }),
  Object.freeze({ name: "reverse2", type: "ReverseLink" }),
]);

test("sections append only unassigned ReverseLinks in global order", () => {
  assert.deepEqual(render(reverseFields, [section(["a"])]).map(field => field.name), ["a", "reverse1", "reverse2"]);
});

test("assigned ReverseLinks render inside their section and never again below", () => {
  assert.deepEqual(render(reverseFields, [section(["a", "reverse2"])]).map(field => field.name), ["a", "reverse2", "reverse1"]);
});

test("an empty section still appends ReverseLinks but no normal fields", () => {
  assert.deepEqual(render(reverseFields, [section([])]).map(field => field.name), ["reverse1", "reverse2"]);
});

test("flat forms keep their single existing separate ReverseLink block", () => {
  assert.deepEqual(render(reverseFields, []).map(field => field.name), ["a", "b"]);
  const selected = evaluate("reverseLinkFields", { normalizedSchema: { fields: reverseFields }, useMemo: fn => fn() });
  assert.deepEqual(selected.map(field => field.name), ["reverse1", "reverse2"]);
  assert.match(source, /showReverseLinks && displayedReverseLinks.length > 0/);
});

test("ReverseLink membership is local to the active form tab and does not mutate config", () => {
  const tabs = [[section(["a", "reverse2"])], [section(["a", "reverse1"])]];
  const before = structuredClone(tabs);
  assert.deepEqual(render(reverseFields, tabs[0]).map(field => field.name), ["a", "reverse2", "reverse1"]);
  assert.deepEqual(render(reverseFields, tabs[1]).map(field => field.name), ["a", "reverse1", "reverse2"]);
  assert.deepEqual(tabs, before);
  assert.equal(reverseFields.length, 4);
});

test("section and trailing ReverseLinks pass existing mode and visibility guards", () => {
  for (const effectiveMode of ["create", "edit", "view"]) {
    for (const [modeVisible, conditionVisible] of [[false, true], [true, false], [true, true]]) {
      const calls = [];
      const renderer = evaluate("renderField", {
        React: { createElement: (type, props, ...children) => ({ type, props, children }) },
        isFieldVisibleInMode: (field, mode) => { assert.equal(mode, effectiveMode); calls.push(field); return modeVisible; },
        evaluateFieldVisibility: ({ field }) => { assert.equal(field, reverseFields[1]); return conditionVisible; },
        effectiveMode, values: { id: "parent" }, normalizedSchema: { fields: reverseFields }, relatedRecordsByField: {},
        ReverseLinkTable: "existing-reverse-link", sectionColors: { background: "blue" },
      });
      const result = renderer(reverseFields[1]);
      assert.equal(Boolean(result), modeVisible && conditionVisible);
      assert.equal(calls.length, 1);
      if (result) assert.equal(result.children[0].type, "existing-reverse-link");
    }
  }
});

test("historical bottom block keeps its exact layout and bypasses the generic field renderer", () => {
  let block;
  function find(node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(attribute =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "className" && attribute.initializer?.text === "jiro-reverse-links d-flex flex-column gap-3")) block = node.getText(ast);
    ts.forEachChild(node, find);
  }
  find(ast);
  assert.ok(block);
  assert.doesNotMatch(expressions.renderFormContent, /trailingReverseLinks/);
  assert.doesNotMatch(block, /renderField/);
  const expected = `<div className="jiro-reverse-links d-flex flex-column gap-3">
    <div className="card">
      <ModuleTabs
        items={displayedReverseLinks.map(field => ({ id: field.name, label: (field.label as string) || field.name }))}
        activeId={displayedReverseLinkId}
        onChange={setActiveReverseLink}
        label="Relaciones inversas"
      />
      <div className="card-body">
        {displayedReverseLinks.map((field) => {
          if (displayedReverseLinkId !== field.name) return null;
          return <ReverseLinkTable key={field.name} field={field} parentRecord={values} mode={effectiveMode} moduleColor={sectionColors.background} />;
        })}
      </div>
    </div>
  </div>`;
  // Layout copied from HEAD before the formSections changes; only selection names differ.
  assert.equal(block.replace(/\s+/g, " "), expected.replace(/\s+/g, " "));
});

test("bottom relation selection filters visibility and keeps active tabs valid", () => {
  for (const effectiveMode of ["create", "edit", "view"]) {
    const visible = evaluate("displayedReverseLinks", {
      useMemo: fn => fn(), formSections: [section(["a"])], trailingReverseLinks: reverseFields.filter(field => field.type === "ReverseLink"), reverseLinkFields: [],
      isFieldVisibleInMode: (field, mode) => { assert.equal(mode, effectiveMode); return true; },
      evaluateFieldVisibility: ({ field }) => field.name !== "reverse1",
      effectiveMode, values: {}, normalizedSchema: { fields: reverseFields }, relatedRecordsByField: {},
    });
    assert.deepEqual(visible.map(field => field.name), ["reverse2"]);
    assert.equal(evaluate("displayedReverseLinkId", { displayedReverseLinks: visible, activeReverseLink: "reverse1" }), "reverse2");
    assert.equal(evaluate("displayedReverseLinkId", { displayedReverseLinks: [], activeReverseLink: "reverse1" }), null);
  }
});
