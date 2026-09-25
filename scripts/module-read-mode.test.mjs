import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const root = process.cwd();

async function loadModuleReadMode() {
  const source = readFileSync(join(root, "packages/types/moduleReadMode.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const encoded = Buffer.from(outputText).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

describe("module read mode", () => {
  it("defaults missing readMode to client", async () => {
    const { getEffectiveModuleReadMode, normalizeModuleReadMode } = await loadModuleReadMode();

    assert.equal(normalizeModuleReadMode(undefined), "client");
    assert.equal(normalizeModuleReadMode("client"), "client");
    assert.equal(normalizeModuleReadMode("server"), "server");
    assert.equal(normalizeModuleReadMode("other"), "client");
    assert.equal(getEffectiveModuleReadMode({}), "client");
    assert.equal(getEffectiveModuleReadMode({ db: {} }), "client");
  });

  it("reads server mode from module props or resolved schema wrappers", async () => {
    const { getEffectiveModuleReadMode } = await loadModuleReadMode();

    assert.equal(getEffectiveModuleReadMode({ db: { readMode: "server" } }), "server");
    assert.equal(getEffectiveModuleReadMode({ schema: { db: { readMode: "server" } } }), "server");
  });
});
