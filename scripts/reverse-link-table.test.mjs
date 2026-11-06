import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync("packages/ui/src/components/fields/ReverseLinkTable.tsx", "utf8");
const ast = ts.createSourceFile("ReverseLinkTable.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let columnsExpression;

function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "columns") {
    columnsExpression = node.initializer?.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);

test("ReverseLink columns support modern appearance and retain the legacy alias", () => {
  assert.ok(columnsExpression);
  const compiled = ts.transpileModule(`module.exports = targetSchema => ${columnsExpression}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: undefined };
  new Function("module", "exports", compiled)(module, module.exports);
  const selectColumns = module.exports;
  const fields = [
    { name: "modernList", appearance: "List" },
    { name: "modernAlways", appearance: "Always" },
    { name: "legacy", appareance: "List" },
    { name: "hidden", appearance: "Zoom" },
    { name: "modernWins", appearance: "Zoom", appareance: "List" },
  ];

  assert.deepEqual(selectColumns({ fields }).map(field => field.name), [
    "modernList",
    "modernAlways",
    "legacy",
  ]);
});
