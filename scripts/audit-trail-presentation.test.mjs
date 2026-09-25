import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const root = process.cwd();

async function loadAuditTrailPresentation() {
  const source = readFileSync(join(root, "packages/types/auditTrailPresentation.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const encoded = Buffer.from(outputText).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

describe("audit trail presentation", () => {
  it("formats known actions and keeps unknown actions unchanged", async () => {
    const { formatAuditActionLabel } = await loadAuditTrailPresentation();

    assert.equal(formatAuditActionLabel("record.create"), "Crear registro");
    assert.equal(formatAuditActionLabel("record.update"), "Modificar registro");
    assert.equal(formatAuditActionLabel("record.delete"), "Eliminar registro");
    assert.equal(formatAuditActionLabel("file.upload"), "Subir archivo");
    assert.equal(formatAuditActionLabel("custom.event"), "custom.event");
  });

  it("decorates actors in bulk-friendly rows and tolerates null or unknown actors", async () => {
    const { decorateAuditTrailRows } = await loadAuditTrailPresentation();
    const actorsByUid = new Map([
      ["11111111-1111-1111-1111-111111111111", { uid: "11111111-1111-1111-1111-111111111111", name: "Ada", email: "ada@example.test" }],
    ]);

    const rows = decorateAuditTrailRows(
      [
        { actor_user_id: "11111111-1111-1111-1111-111111111111", module: "py", action: "record.update", success: true },
        { actor_user_id: null, module: "py", action: "record.delete", success: false },
        { actor_user_id: "22222222-2222-2222-2222-222222222222", module: "py", action: "custom.event", success: true },
      ],
      { actorsByUid },
    );

    assert.equal(rows[0].actor_label, "Ada");
    assert.equal(rows[0].actor_email, "ada@example.test");
    assert.equal(rows[0].action_label, "Modificar registro");
    assert.equal(rows[1].actor_label, "Sistema");
    assert.equal(rows[1].success_label, "Fallo");
    assert.equal(rows[2].actor_label, "Usuario desconocido");
    assert.equal(rows[2].action_label, "custom.event");
  });

  it("builds compact resource and metadata presentation fields", async () => {
    const { decorateAuditTrailRows } = await loadAuditTrailPresentation();
    const [row] = decorateAuditTrailRows([
      {
        module: "py",
        action: "record.update",
        resource_type: "py",
        resource_id: "abc-123",
        metadata: { fieldNames: ["name", "status"], reason: "validation" },
      },
    ]);

    assert.equal(row.resource_label, "py #abc-123");
    assert.match(row.metadata_preview, /fieldNames/);
    assert.doesNotMatch(row.metadata_preview, /\[object Object\]/);
  });
});
