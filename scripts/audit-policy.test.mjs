import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const root = process.cwd();

async function loadAuditPolicy() {
  const source = readFileSync(join(root, "apps/web/lib/audit/shouldAuditEvent.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const encoded = Buffer.from(outputText).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

describe("module audit policy", () => {
  it("audits create update delete and file uploads by default when props.audit is absent", async () => {
    const { shouldAuditEvent } = await loadAuditPolicy();

    assert.equal(shouldAuditEvent({}, "record.create"), true);
    assert.equal(shouldAuditEvent({}, "record.update"), true);
    assert.equal(shouldAuditEvent({}, "record.delete"), true);
    assert.equal(shouldAuditEvent({}, "file.upload"), true);
  });

  it("does not audit reads by default", async () => {
    const { shouldAuditEvent } = await loadAuditPolicy();

    assert.equal(shouldAuditEvent({}, "record.read"), false);
  });

  it("disables configurable events when enabled is false", async () => {
    const { shouldAuditEvent } = await loadAuditPolicy();
    const moduleConfig = { audit: { enabled: false, events: ["record.create", "file.upload"] } };

    assert.equal(shouldAuditEvent(moduleConfig, "record.create"), false);
    assert.equal(shouldAuditEvent(moduleConfig, "file.upload"), false);
  });

  it("allows file uploads to be disabled explicitly", async () => {
    const { shouldAuditEvent } = await loadAuditPolicy();
    const moduleConfig = { audit: { enabled: true, events: ["record.create", "record.update", "record.delete"] } };

    assert.equal(shouldAuditEvent(moduleConfig, "file.upload"), false);
  });

  it("uses explicit events as an allowlist", async () => {
    const { shouldAuditEvent } = await loadAuditPolicy();
    const moduleConfig = { audit: { enabled: true, events: ["record.update", "file.upload"] } };

    assert.equal(shouldAuditEvent(moduleConfig, "record.create"), false);
    assert.equal(shouldAuditEvent(moduleConfig, "record.update"), true);
    assert.equal(shouldAuditEvent(moduleConfig, "record.delete"), false);
    assert.equal(shouldAuditEvent(moduleConfig, "file.upload"), true);
  });

  it("always audits mandatory events even when module config disables auditing", async () => {
    const { shouldAuditEvent } = await loadAuditPolicy();
    const moduleConfig = { audit: { enabled: false, events: [] } };

    assert.equal(shouldAuditEvent(moduleConfig, "users.create"), true);
    assert.equal(shouldAuditEvent(moduleConfig, "users.roles.update"), true);
    assert.equal(shouldAuditEvent(moduleConfig, "workflows.run"), true);
  });
});
