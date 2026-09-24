import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const root = process.cwd();

async function loadModuleCapabilities() {
  const source = readFileSync(join(root, "packages/types/moduleCapabilities.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const encoded = Buffer.from(outputText).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

describe("module capabilities", () => {
  it("keeps all capabilities enabled by default when props.capabilities is absent", async () => {
    const { getEffectiveModuleCapabilities } = await loadModuleCapabilities();

    assert.deepEqual(getEffectiveModuleCapabilities({}), {
      allowCreate: true,
      allowDelete: true,
      allowEdit: true,
      allowExport: true,
      allowImport: true,
      allowSearch: true,
    });
  });

  it("allows each module capability to hide its corresponding list action", async () => {
    const { moduleCapabilityEnabled } = await loadModuleCapabilities();

    assert.equal(moduleCapabilityEnabled({ capabilities: { allowCreate: false } }, "allowCreate"), false);
    assert.equal(moduleCapabilityEnabled({ capabilities: { allowEdit: false } }, "allowEdit"), false);
    assert.equal(moduleCapabilityEnabled({ capabilities: { allowDelete: false } }, "allowDelete"), false);
    assert.equal(moduleCapabilityEnabled({ capabilities: { allowImport: false } }, "allowImport"), false);
    assert.equal(moduleCapabilityEnabled({ capabilities: { allowExport: false } }, "allowExport"), false);
    assert.equal(moduleCapabilityEnabled({ capabilities: { allowSearch: false } }, "allowSearch"), false);
  });

  it("combines module capabilities with role permissions for CRUD, import and export", async () => {
    const { isModuleActionAvailable } = await loadModuleCapabilities();

    assert.equal(isModuleActionAvailable({ capabilities: { allowCreate: true } }, "crear", true), true);
    assert.equal(isModuleActionAvailable({ capabilities: { allowCreate: true } }, "crear", false), false);
    assert.equal(isModuleActionAvailable({ capabilities: { allowCreate: false } }, "crear", true), false);

    assert.equal(isModuleActionAvailable({ capabilities: { allowEdit: true } }, "actualizar", true), true);
    assert.equal(isModuleActionAvailable({ capabilities: { allowEdit: true } }, "actualizar", false), false);
    assert.equal(isModuleActionAvailable({ capabilities: { allowEdit: false } }, "actualizar", true), false);

    assert.equal(isModuleActionAvailable({ capabilities: { allowDelete: true } }, "eliminar", true), true);
    assert.equal(isModuleActionAvailable({ capabilities: { allowDelete: true } }, "eliminar", false), false);
    assert.equal(isModuleActionAvailable({ capabilities: { allowDelete: false } }, "eliminar", true), false);

    assert.equal(isModuleActionAvailable({ capabilities: { allowExport: true } }, "exportar", true), true);
    assert.equal(isModuleActionAvailable({ capabilities: { allowExport: true } }, "exportar", false), false);
    assert.equal(isModuleActionAvailable({ capabilities: { allowExport: false } }, "exportar", true), false);

    assert.equal(isModuleActionAvailable({ capabilities: { allowImport: true } }, "importar", true), true);
    assert.equal(isModuleActionAvailable({ capabilities: { allowImport: true } }, "importar", false), false);
    assert.equal(isModuleActionAvailable({ capabilities: { allowImport: false } }, "importar", true), false);
  });

  it("updates only props.capabilities and preserves other module props", async () => {
    const { applyModuleCapabilitiesToProps } = await loadModuleCapabilities();
    const props = {
      audit: { enabled: true, events: ["record.create"] },
      db: { table: "py", primaryKey: "id" },
      fields: [{ name: "name", type: "text" }],
      ui: { color: "#123456" },
      custom: { keep: true },
    };

    const next = applyModuleCapabilitiesToProps(props, {
      allowCreate: true,
      allowDelete: false,
      allowEdit: true,
      allowExport: false,
      allowImport: true,
      allowSearch: false,
    });

    assert.deepEqual(next.audit, props.audit);
    assert.deepEqual(next.db, props.db);
    assert.deepEqual(next.fields, props.fields);
    assert.deepEqual(next.ui, props.ui);
    assert.deepEqual(next.custom, props.custom);
    assert.deepEqual(next.capabilities, {
      allowCreate: true,
      allowDelete: false,
      allowEdit: true,
      allowExport: false,
      allowImport: true,
      allowSearch: false,
    });
  });
});
