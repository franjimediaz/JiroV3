import assert from "node:assert/strict";
import test from "node:test";
import { createSourceLoader } from "./helpers/dashboard-fixtures.mjs";

const ctx = {
  user: { id: "user" },
  profile: { role_id: "role", role: "editor" },
  role: {
    slug: "editor",
    perms: {
      workflows: { run: true, "records.copyRelated": true, "derive.createFromParent": true },
      task: { ver: true, crear: true },
      customers: { actualizar: true },
      py: { eliminar: true },
    },
  },
};
const load = createSourceLoader({ "./getCurrentUser": { requireUser: async () => ctx } });
const { hasPermission, requirePermission } = load("apps/web/lib/auth/requirePermission.ts");
const { effectivePermissions, permissionGranted } = load("apps/web/lib/auth/permissionRules.ts");

test("ordinary permissions, CRUD aliases and default ver remain supported", () => {
  for (const permission of ["task", "task.ver", "task.read", "task.crear", "task.create", "customers.update", "py.delete", "workflows.run"])
    assert.equal(hasPermission(ctx, permission), true, permission);
});

test("dotted actions survive both role and precomputed permission paths", () => {
  const permissions = effectivePermissions(ctx.role.perms);
  for (const action of ["records.copyRelated", "derive.createFromParent"]) {
    assert.equal(permissionGranted(permissions, "workflows", action), true);
    assert.equal(hasPermission(ctx, `workflows.${action}`), true);
    assert.equal(hasPermission({ ...ctx, permissions }, `workflows.${action}`), true);
  }
});

test("nested actions do not grant prefixes, descendants or different casing", () => {
  for (const action of ["records", "records.copy", "records.copyRelated.extra", "records.copyrelated", "derive", "derive.createFromParent.extra"])
    assert.equal(hasPermission(ctx, `workflows.${action}`), false, action);
  const prefixOnly = { role: { perms: { workflows: { run: true, records: true } } } };
  assert.equal(hasPermission(prefixOnly, "workflows.records.copyRelated"), false);
  assert.equal(hasPermission({ ...ctx, permissions: [] }, "workflows.records.copyRelated"), false);
});

test("requirePermission uses the full action for authorization and logging", async () => {
  const originalInfo = console.info;
  const originalEnv = process.env.NODE_ENV;
  const logs = [];
  console.info = (...args) => logs.push(args);
  process.env.NODE_ENV = "development";
  try {
    for (const permission of ["workflows.records.copyRelated", "workflows.derive.createFromParent", "task", "task.create"])
      assert.equal(await requirePermission(permission), ctx);
    await assert.rejects(requirePermission("workflows.records"), { status: 403 });
    assert.deepEqual(logs.map(([, entry]) => [entry.moduleSlug, entry.normalizedAction, entry.permissionMatched]), [
      ["workflows", "records.copyRelated", true],
      ["workflows", "derive.createFromParent", true],
      ["task", "ver", true],
      ["task", "crear", true],
      ["workflows", "records", false],
    ]);
  } finally {
    console.info = originalInfo;
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  }
});
