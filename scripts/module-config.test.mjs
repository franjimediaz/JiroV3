import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function harness() {
  const slots = []; let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } }),
    Fragment: "fragment",
    createContext: () => ({}),
    useContext: () => null,
    useEffect: () => {},
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
  };
  function load(file, imports = {}) {
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    new Function("require", "module", "exports", code)(id => {
      if (id === "react") return react;
      if (id in imports) return imports[id];
      throw Error(`Unexpected import: ${id}`);
    }, module, module.exports);
    return module.exports;
  }
  const components = load("packages/ui/src/ModuloForm/ConfigEditor.tsx", { "../modals/ModalConfirm": () => null, "./modulo-detalle.module.css": {} });
  return { ...components, render(props) { cursor = 0; return components.ConfigEditor(props); } };
}
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return undefined;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat()) { const match = find(child, predicate); if (match) return match; }
}
function open(h, props) {
  find(h.render(props), node => node.type === "button").props.onClick();
}
function session(h, props) { return find(h.render(props), node => node.type === h.ConfigSession); }

test("field edits are isolated, cancel discards nested mutations and reopening reads current data", () => {
  const h = harness(); const field = { name: "total", type: "number", compute: { type: "formula", expr: "price * quantity", deps: ["price", "quantity"] } };
  let applied = 0;
  const props = { title: "Total", value: field, onChange: () => applied++, children: (draft, update) => ({ draft, update }) };
  open(h, props);
  const draft = session(h, props).props.children;
  draft.draft.compute.deps.push("discount");
  draft.update({ ...draft.draft, label: "Changed" });
  assert.equal(applied, 0);
  assert.deepEqual(field.compute.deps, ["price", "quantity"]);
  session(h, props).props.onClose();
  assert.equal(session(h, props), undefined);
  props.value = { ...field, label: "Latest" };
  open(h, props);
  assert.equal(session(h, props).props.children.draft.label, "Latest");
  assert.deepEqual(session(h, props).props.children.draft.compute.deps, ["price", "quantity"]);
});

test("Apply commits once, preserving unknown configuration properties and serialized shape", () => {
  const h = harness(); const original = { name: "client", type: "selectorTabla", ref: { moduleSlug: "clients", custom: { flag: true } }, recordName: true };
  const commits = [];
  const props = { title: "Cliente", value: original, onChange: next => commits.push(next), children: (draft, update) => ({ draft, update }) };
  open(h, props);
  session(h, props).props.children.update({ ...session(h, props).props.children.draft, label: "Customer" });
  session(h, props).props.onApply();
  assert.deepEqual(commits, [{ ...original, label: "Customer" }]);
  assert.equal(original.label, undefined);
  assert.equal(session(h, props), undefined);
});

test("nested Apply changes only the parent draft; cancelling the parent discards the complete transaction", () => {
  const parent = harness(); const child = harness(); let saved;
  const props = { title: "Campo", value: { visibility: { enabled: false, rules: [] } }, onChange: next => { saved = next; }, children: (draft, update) => ({ draft, update }) };
  open(parent, props);
  const p = session(parent, props).props.children;
  const childProps = { title: "Visibilidad", value: p.draft.visibility, onChange: next => p.update({ ...p.draft, visibility: next }), children: (draft, update) => ({ draft, update }) };
  open(child, childProps);
  session(child, childProps).props.children.update({ enabled: true, rules: [{ field: "status", op: "=", value: "active" }] });
  session(child, childProps).props.onApply();
  assert.equal(saved, undefined);
  assert.equal(session(parent, props).props.children.draft.visibility.rules.length, 1);
  session(parent, props).props.onClose();
  assert.equal(saved, undefined);
  assert.deepEqual(props.value.visibility, { enabled: false, rules: [] });
});

test("creating a field or condition only appends after Apply", () => {
  for (const value of [{ name: "campo_1", type: "text" }, { field: "", op: "=", value: "" }]) {
    const h = harness(); const records = [];
    const props = { title: "Añadir", value, onChange: next => records.push(next), children: draft => draft };
    open(h, props); session(h, props).props.onClose();
    assert.deepEqual(records, []);
    open(h, props); session(h, props).props.onApply();
    assert.deepEqual(records, [value]);
  }
});
