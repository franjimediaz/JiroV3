import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { generateModulePages } from "../../apps/web/module-page-routes.mjs";
generateModulePages();

export const base = resolve("apps/web/app/(main)");
const require = createRequire(resolve(base, "Dashboard.tsx"));
export function createSourceLoader(overrides = {}) {
  const modules = new Map();
  // Loads the actual pure production functions. Network calls are forbidden here.
  return function loadSource(file) {
    const path = resolve(file);
    if (modules.has(path)) return modules.get(path);
    const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const mod = { exports: {} };
    modules.set(path, mod.exports);
    function localRequire(id) {
      if (Object.hasOwn(overrides, id)) return overrides[id];
      if (id.endsWith(".css"))
        return {
          __esModule: true,
          default: new Proxy({}, { get: (_, key) => key }),
        };
      if (id === "@/lib/supabase/server")
        return {
          createClient: () => {
            throw new Error("Unexpected database call in fixture");
          },
        };
      if (id === "@/lib/supabase/admin")
        return {
          supabaseAdmin: {
            from() {
              throw new Error("Unexpected admin call in fixture");
            },
          },
        };
      if (id === "@repo/types")
        return loadSource("packages/types/normalizeModuleSchema.ts");
      if (id.startsWith(".") || id.startsWith("@/")) {
        const target = id.startsWith("@/")
          ? resolve("apps/web", id.slice(2))
          : resolve(dirname(path), id);
        if (target.endsWith(".json")) return require(target);
        for (const suffix of [".ts", ".tsx"])
          if (existsSync(target + suffix)) return loadSource(target + suffix);
      }
      return require(id);
    }
    new Function("require", "module", "exports", compiled)(
      localRequire,
      mod,
      mod.exports,
    );
    return mod.exports;
  };
}
export const loadSource = createSourceLoader();

export const { buildDashboardModuleGroups, dashboardIcon } = loadSource(
  resolve(base, "dashboard-model.ts"),
);
export const { normalizeModuleRoute, resolveModuleDestinations } = loadSource(
  "apps/web/lib/modules/moduleRoutes.ts",
);
export const { hasPermission } = loadSource(
  "apps/web/lib/auth/requirePermission.ts",
);
export const row = (slug, overrides = {}) => ({
  id: slug,
  slug,
  nombre: slug,
  activo: true,
  route: `/m/${slug}`,
  parent_id: null,
  orden: null,
  tipo: "tabla",
  props: { db: { table: slug }, fields: [], ui: { dashboard: true } },
  ...overrides,
});
export const folder = (id, nombre, orden = 0, parent_id = null) =>
  row("#", {
    id,
    nombre,
    orden,
    parent_id,
    tipo: "carpeta",
    route: "#",
    props: {},
  });
export function groupsFor(rows, perms = { "*": { ver: true } }) {
  const ctx = { role: { id: "fixture-role", perms } };
  return buildDashboardModuleGroups(
    rows,
    (slug, action = "ver") => hasPermission(ctx, `${slug}.${action}`),
    resolveModuleDestinations(rows),
  );
}

export const fixtureRows = [
  folder("projects", "Módulo Proyectos", 1),
  folder("settings", "Configuración", 2, "projects"),
  row("py", {
    nombre: "Proyectos",
    parent_id: "projects",
    orden: 1,
    props: {
      db: { table: "py" },
      ui: { dashboard: true, icon: "bi-cone-striped", color: "#35797e" },
    },
  }),
  row("task", { nombre: "Tareas", parent_id: "settings", orden: 2 }),
  row("mytask", { nombre: "Mis Tareas", parent_id: "projects", orden: 3 }),
  row("customers", { nombre: "Clientes", orden: 0 }),
  folder("admin", "Configuración General", 3),
  row("users", {
    nombre: "Usuarios",
    parent_id: "admin",
    route: "/system/users",
  }),
  row("hidden", {
    nombre: "No habilitado",
    parent_id: "projects",
    props: { db: { table: "hidden" }, ui: { sidebar: true } },
  }),
  folder("empty-family", "Familia vacía", 4),
  row("denied", { nombre: "Sin permiso", parent_id: "empty-family" }),
];
export const fixturePerms = {
  customers: { ver: true },
  py: { ver: true },
  task: { ver: true },
  mytask: { ver: true },
  users: { ver: true },
};
