import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const base = resolve("apps/web/app/(main)");
const require = createRequire(resolve(base, "dashboard-model.ts"));
const source = readFileSync(resolve(base, "dashboard-model.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const model = { exports: {} };
new Function("require", "module", "exports", compiled)(
  require,
  model,
  model.exports,
);
const { buildDashboardModules, featuredModules, dashboardIcon } = model.exports;
const row = (slug, overrides = {}) => ({
  id: slug,
  slug,
  nombre: slug,
  activo: true,
  route: null,
  parent_id: null,
  orden: null,
  tipo: "tabla",
  props: { db: { table: slug } },
  ...overrides,
});

test("invalid configuration cannot crash rendering or create arbitrary links", () => {
  for (const props of [
    null,
    "null",
    "[]",
    "{",
    12,
    { ui: { icon: 34, color: {} } },
  ]) {
    const [item] = buildDashboardModules([row("clients", { props })]);
    assert.equal(item.href, null);
    assert.equal(item.icon, "bi bi-grid-1x2");
    assert.equal(item.color, "#2563eb");
  }
  for (const slug of ["..", "a/b", "a?b", "a#b"]) {
    assert.equal(buildDashboardModules([row(slug)])[0].href, null);
  }
});

test("folders and inactive or duplicate modules do not become cards", () => {
  const modules = buildDashboardModules([
    row("folder", { tipo: "carpeta" }),
    row("off", { activo: false }),
    row("clients"),
    row("clients"),
  ]);
  assert.equal(modules.length, 1);
  assert.equal(modules[0].href, "/m/clients");
});

test("system shortcuts use existing routes and unknown routes stay disabled", () => {
  const modules = buildDashboardModules([
    row("system", { parent_id: "unknown" }),
    row("unknown", { parent_id: "system", route: "https://example.com" }),
    ...["modulos", "rol", "users", "pdf-templates"].map((slug) => row(slug)),
  ]);
  assert.equal(modules[0].href, null);
  for (const item of modules.slice(1)) {
    assert.ok(existsSync(resolve(base, `.${item.href}/page.tsx`)));
    assert.ok(item.system);
  }
  assert.ok(existsSync(resolve("apps/web/app/api/auth/signout/route.ts")));
});

test("icons accept picker and legacy classes and reject nonexistent icons", () => {
  assert.equal(dashboardIcon("bi-person"), "bi bi-person");
  assert.equal(dashboardIcon("bi bi-person"), "bi bi-person");
  assert.equal(dashboardIcon("bi bi-does-not-exist"), "bi bi-grid-1x2");
  assert.equal(dashboardIcon("🚀"), "bi bi-grid-1x2");
});

test("featured ordering is deterministic and excludes unavailable destinations", () => {
  const modules = buildDashboardModules([
    row("normal"),
    row("broken", { props: { ui: { home: { featured: true } } } }),
    row("second", {
      props: {
        db: { table: "second" },
        ui: { home: { featured: true, order: 2 } },
      },
    }),
    row("first", {
      props: {
        db: { table: "first", readMode: "server" },
        ui: { dashboard: { featured: true, order: 1 } },
      },
    }),
  ]);
  assert.deepEqual(
    featuredModules(modules).map((item) => item.name),
    ["first", "second"],
  );
  assert.equal(featuredModules(modules)[0].canCount, false);
  assert.equal(featuredModules(modules)[0].count, null);
  assert.equal(
    featuredModules(
      buildDashboardModules(Array.from({ length: 8 }, (_, i) => row(`m${i}`))),
    ).length,
    4,
  );
});
