import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function extractFunctions(file, names) {
  const source = readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) {
      found.set(node.name.text, node.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { source, code: names.map((name) => found.get(name)).join("\n") };
}

function fieldRef(input) {
  if (typeof input === "string") return { field: input.trim(), relations: [] };
  return {
    field: String(input?.field || "").trim(),
    relations: Array.isArray(input?.relations) ? input.relations.map(String) : [],
  };
}

const serializeFieldRef = (input) => {
  const ref = fieldRef(input);
  return ref.relations.length ? ref : { field: ref.field };
};
const fieldRefKey = (input) => {
  const ref = fieldRef(input);
  return JSON.stringify([ref.relations, ref.field]);
};

function evaluate(code, resultExpression, dependencies) {
  const js = ts.transpileModule(`${code}\nmodule.exports = ${resultExpression};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const names = Object.keys(dependencies);
  new Function("module", "exports", ...names, js)(module, module.exports, ...Object.values(dependencies));
  return module.exports;
}

test("TreeView normalizeColumns accepts legacy strings and direct or related FieldRef objects", () => {
  const { code } = extractFunctions("packages/ui/src/components/specialViews/TreeView.tsx", ["normalizeColumns"]);
  const normalizeColumns = evaluate(code, "normalizeColumns", {
    normalizeFieldRef: fieldRef,
    serializeFieldRef,
    fieldRefKey,
  });

  assert.deepEqual(normalizeColumns(["title"])[0], { field: "title", label: "title", type: undefined, width: undefined, options: undefined });
  assert.deepEqual(normalizeColumns([{ field: { field: "title" } }])[0].field, { field: "title" });
  assert.deepEqual(
    normalizeColumns([{ field: { relations: ["service"], field: "title" } }])[0].field,
    { relations: ["service"], field: "title" },
  );
});

test("TreeView column picker merge updates direct columns and preserves custom labels and related columns", () => {
  const { source, code } = extractFunctions("packages/ui/src/ModuloForm/ModuloForm.tsx", [
    "buildColumnsObjects",
    "mergePickedColumns",
  ]);
  const mergePickedColumns = evaluate(code, "mergePickedColumns", {
    normalizeFieldRef: fieldRef,
    serializeFieldRef,
  });
  const related = { field: { relations: ["service"], field: "title" }, label: "Servicio" };
  const current = [
    { field: { field: "title" }, label: "Título personalizado" },
    related,
    { field: "obsolete", label: "Obsoleta" },
  ];
  const fields = [
    { name: "title", label: "Título del schema", type: "text" },
    { name: "due_at", label: "Fecha hasta", type: "datetime" },
  ];

  assert.deepEqual(mergePickedColumns(current, ["title", "due_at"], fields), [
    { field: { field: "title" }, label: "Título personalizado" },
    related,
    { field: "due_at", label: "Fecha hasta" },
  ]);
  assert.match(source, /columns:\s*mergePickedColumns\(prev\.config\?\.columns, selectedNames, availableFields\)/);
  assert.match(source, />Seleccionar columnas</);
  assert.match(source, /\+ Campo relacionado/);
});
