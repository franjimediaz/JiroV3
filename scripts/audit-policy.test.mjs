import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const root = process.cwd();

async function loadAuditPolicy() {
  const source = readFileSync(join(root, "packages/types/auditPolicy.ts"), "utf8");
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
    const { getEffectiveModuleAuditConfig, shouldAuditEvent } = await loadAuditPolicy();
    const effective = getEffectiveModuleAuditConfig({});

    assert.equal(shouldAuditEvent({}, "record.create"), true);
    assert.equal(shouldAuditEvent({}, "record.update"), true);
    assert.equal(shouldAuditEvent({}, "record.delete"), true);
    assert.equal(shouldAuditEvent({}, "file.upload"), true);
    assert.equal(effective.enabled, true);
    assert.equal(effective.events["record.create"], true);
    assert.equal(effective.events["record.update"], true);
    assert.equal(effective.events["record.delete"], true);
    assert.equal(effective.events["record.read"], false);
    assert.equal(effective.events["file.upload"], true);
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

  it("builds enabled=false without preserving stale events", async () => {
    const { buildModuleAuditConfig } = await loadAuditPolicy();
    const built = buildModuleAuditConfig({
      enabled: false,
      events: {
        "record.create": true,
        "record.update": true,
        "record.delete": true,
        "record.read": true,
        "file.upload": true,
      },
    });

    assert.deepEqual(built, { enabled: false });
  });

  it("uses explicit events as an allowlist", async () => {
    const { buildModuleAuditConfig, shouldAuditEvent } = await loadAuditPolicy();
    const moduleConfig = { audit: { enabled: true, events: ["record.update", "file.upload"] } };
    const built = buildModuleAuditConfig({
      enabled: true,
      events: {
        "record.create": false,
        "record.update": true,
        "record.delete": false,
        "record.read": false,
        "file.upload": true,
      },
    });

    assert.equal(shouldAuditEvent(moduleConfig, "record.create"), false);
    assert.equal(shouldAuditEvent(moduleConfig, "record.update"), true);
    assert.equal(shouldAuditEvent(moduleConfig, "record.delete"), false);
    assert.equal(shouldAuditEvent(moduleConfig, "file.upload"), true);
    assert.deepEqual(built, { enabled: true, events: ["record.update", "file.upload"] });
  });

  it("updates only props.audit and preserves the rest of props", async () => {
    const { applyModuleAuditConfigToProps } = await loadAuditPolicy();
    const props = {
      db: { table: "py", primaryKey: "id" },
      fields: [{ name: "name", type: "text" }],
      ui: { color: "#123456" },
      custom: { keep: true },
    };

    const next = applyModuleAuditConfigToProps(props, {
      enabled: true,
      events: {
        "record.create": true,
        "record.update": false,
        "record.delete": true,
        "record.read": false,
        "file.upload": true,
      },
    });

    assert.deepEqual(next.db, props.db);
    assert.deepEqual(next.fields, props.fields);
    assert.deepEqual(next.ui, props.ui);
    assert.deepEqual(next.custom, props.custom);
    assert.deepEqual(next.audit, {
      enabled: true,
      events: ["record.create", "record.delete", "file.upload"],
    });
  });

  it("always audits mandatory events even when module config disables auditing", async () => {
    const { shouldAuditEvent } = await loadAuditPolicy();
    const moduleConfig = { audit: { enabled: false, events: [] } };

    assert.equal(shouldAuditEvent(moduleConfig, "users.create"), true);
    assert.equal(shouldAuditEvent(moduleConfig, "users.roles.update"), true);
    assert.equal(shouldAuditEvent(moduleConfig, "workflows.run"), true);
  });
});
