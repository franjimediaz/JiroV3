import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createSourceLoader,
  loadSource,
  row,
  folder,
  groupsFor,
  resolveModuleDestinations,
  buildDashboardModuleGroups,
} from "./helpers/dashboard-fixtures.mjs";
import { discoverModulePages } from "../apps/web/module-page-routes.mjs";
const { effectivePermissions, permissionGranted } = loadSource(
  "apps/web/lib/auth/permissionRules.ts",
);

test("new dynamic module joins a new family without source edits", () => {
  const groups = groupsFor(
    [
      folder("rrhh", "RRHH"),
      row("employees", {
        id: "test-rrhh",
        nombre: "Empleados",
        parent_id: "rrhh",
      }),
    ],
    { employees: { ver: true } },
  );
  assert.equal(groups[0].name, "RRHH");
  assert.equal(groups[0].modules[0].href, "/m/employees");
});
test("new physical internal page is discovered automatically, missing pages remain excluded", () => {
  const root = mkdtempSync(join(tmpdir(), "jiro-route-"));
  try {
    mkdirSync(join(root, "(main)/rrhh/empleados"), { recursive: true });
    writeFileSync(
      join(root, "(main)/rrhh/empleados/page.tsx"),
      "export default function Page() { return null; }",
    );
    const pages = new Set(discoverModulePages(root));
    const rows = [row("employees", { route: "/rrhh/empleados" })];
    const groups = buildDashboardModuleGroups(
      rows,
      (slug) => slug === "employees",
      resolveModuleDestinations(rows, pages),
    );
    assert.equal(groups[0].modules[0].href, "/rrhh/empleados");
    assert.equal(
      resolveModuleDestinations(
        [row("missing", { route: "/rrhh/missing" })],
        pages,
      ).size,
      0,
    );
  } finally {
    assert.equal(
      resolve(root).startsWith(resolve(tmpdir()) + "/") ||
        resolve(root).startsWith(resolve(tmpdir()) + "\\"),
      true,
    );
    assert.match(
      root.slice(resolve(tmpdir()).length + 1),
      /^jiro-route-[^/\\]+$/,
    );
    rmSync(root, { recursive: true });
  }
});
test("partial wildcard never becomes all actions and legacy true remains supported", () => {
  const permissions = effectivePermissions({
    "*": { crear: true, ver: false },
  });
  assert.equal(permissionGranted(permissions, "task", "ver"), false);
  assert.equal(permissionGranted(permissions, "task", "crear"), true);
  assert.equal(
    permissionGranted(effectivePermissions({ task: true }), "task", "ver"),
    true,
  );
  assert.equal(
    permissionGranted(
      effectivePermissions({ task: { ver: "true" } }),
      "task",
      "read",
    ),
    true,
  );
});

test("existing static creation destinations require crear as well as module visibility", () => {
  for (const [slug, route] of [
    ["users", "/system/users/new"],
    ["rol", "/system/rol/new"],
    ["pdf_templates", "/system/pdf-templates/new"],
  ]) {
    const rows = [row(slug, { route })];
    assert.deepEqual(groupsFor(rows, { [slug]: { ver: true } }), []);
    assert.equal(
      groupsFor(rows, { [slug]: { ver: true, crear: true } })[0].modules[0]
        .href,
      route,
    );
  }
});
test("the real guard and dashboard use the same role even when ordinary rol SELECT is denied", async () => {
  for (const task of [true, false]) {
    let roleReads = 0;
    let rpcCalls = 0;
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "verified-user" } },
          error: null,
        }),
      },
      rpc() {
        rpcCalls++;
        throw new Error("N+1 RPC");
      },
      from(table) {
        assert.equal(table, "users");
        return {
          select() {
            return this;
          },
          eq(key, value) {
            assert.equal(key, "uid");
            assert.equal(value, "verified-user");
            return this;
          },
          maybeSingle: async () => ({
            data: { uid: "verified-user", role_id: "own-role" },
          }),
        };
      },
    };
    const admin = {
      from(table) {
        assert.equal(table, "rol");
        roleReads++;
        return {
          select() {
            return this;
          },
          eq(key, value) {
            assert.equal(key, "id");
            assert.equal(value, "own-role");
            return this;
          },
          maybeSingle: async () => ({
            data: {
              id: "own-role",
              perms: {
                py: { ver: true },
                task: { ver: task },
                rol: { ver: false },
              },
            },
          }),
        };
      },
    };
    // Reproduce React request memoization with a new isolated request for each user.
    const requestCache = (fn) => {
      let promise;
      return () => (promise ??= fn());
    };
    const loader = createSourceLoader({
      react: { cache: requestCache },
      "@/lib/supabase/server": { createClient: async () => supabase },
      "@/lib/supabase/admin": { supabaseAdmin: admin },
    });
    const { getCurrentUser } = loader("apps/web/lib/auth/getCurrentUser.ts");
    const { hasPermission, requirePermission } = loader(
      "apps/web/lib/auth/requirePermission.ts",
    );
    const ctx = await getCurrentUser();
    assert.equal(hasPermission(ctx, "task.ver"), task);
    if (task) await requirePermission("task.ver");
    else
      await assert.rejects(
        requirePermission("task.ver"),
        (error) => error.status === 403,
      );
    await requirePermission("py.read");
    assert.equal(roleReads, 1);
    assert.equal(rpcCalls, 0);
    assert.equal(
      permissionGranted(effectivePermissions(ctx.role.perms), "task", "ver"),
      task,
    );
  }
});
