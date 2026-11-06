import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(resolve("apps/web/package.json"));
function loader(overrides = {}) {
  const cache = new Map();
  return function load(file) {
    const path = resolve(file);
    if (cache.has(path)) return cache.get(path).exports;
    const mod = { exports: {} }; cache.set(path, mod);
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    }}).outputText;
    new Function("require", "module", "exports", code)(id => {
      if (id in overrides) return overrides[id];
      if (id === "@repo/types") return load("packages/types/index.ts");
      if (id.startsWith(".") || id.startsWith("@/")) {
        const target = id.startsWith("@/") ? resolve("apps/web", id.slice(2)) : resolve(dirname(path), id);
        for (const suffix of [".ts", ".tsx"]) if (existsSync(target + suffix)) return load(target + suffix);
      }
      return require(id);
    }, mod, mod.exports);
    return mod.exports;
  };
}


const contract = {
  moduleSlug: "modulos", displayField: "nombre", valueField: "slug",
  filters: [{ field: "activo", op: "=", value: true }, { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] }],
  sort: [{ field: "orden", direction: "asc" }], fieldRefs: ["nombre"],
};
function fixture({ denied = false, metadata = true, react } = {}) {
  const requests = [], permissions = [];
  const dynamic = { db: { table: "task_records" }, fields: [{ name: "title", label: "Title", type: "text" }] };
  const { createClient } = require("@supabase/supabase-js");
  const client = createClient("https://example.test", "test-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async input => {
    const url = new URL(String(input)); requests.push(url);
    if (url.searchParams.has("slug")) {
      const slug = url.searchParams.get("slug").slice(3);
      return Response.json(metadata ? { id: "meta", slug, props: dynamic, tipo: "tabla" } : null);
    }
    return Response.json([{ id: "1", nombre: "Tasks", slug: "task", activo: true, tipo: "tabla", orden: 1 }]);
  } } });
  const load = loader({
    ...(react ? { react } : {}),
    "./auth/requireModulePermission": { requireModulePermission: async () => ({}) },
    "../auth/requireModulePermission": { requireModulePermission: async () => ({}) },
    "../../modals/PopUpSelector": { PopupSelector: () => null },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/auth/requireModulePermission": { requireModulePermission: async (...args) => { permissions.push(args); if (denied) throw Object.assign(Error("Denied"), { status: 403 }); } },
    "@/lib/moduleDefaultFilters": { buildModuleDefaultFilterRuntimeContext: async () => ({}), resolveDefaultFiltersForQuery: () => ({ filters: [], canQueryDirectly: true }) },
    "@/lib/auth/handleApiError": { handleApiError: error => Response.json({ detail: error.message }, { status: error.status || 500 }) },
  });
  const route = load("apps/web/app/api/list/route.ts");
  const provider = load("packages/ui/src/providers/DataProvider.ts").dataProvider;
  const run = body => route.POST(new Request("http://localhost/api/list", { method: "POST", body: JSON.stringify(body) }));
  return { load, provider, run, requests, permissions, dynamic };
}

test("client and resolver share structural contracts; dynamic modules retain props and input is unchanged", async () => {
  const f = fixture();
  const { resolveModuleConfig, resolveModuleConfigFromRow } = f.load("apps/web/lib/modules/resolveModuleConfig.ts");
  const names = ["id", "parent_id", "nombre", "slug", "route", "tipo", "orden", "activo", "props"];
  for (const slug of ["modulos", "pdf_templates"]) {
    const client = await f.provider.getSchema(slug), server = await resolveModuleConfig(slug);
    assert.deepEqual(server.schema.fields.map(f => f.name), client.fields.map(f => f.name));
    assert.equal(server.table, slug); assert.equal(server.permissionsKey, slug);
    if (slug === "modulos") { assert.deepEqual(client.fields.map(f => f.name), names); assert.equal(server.displayField, "nombre"); }
  }
  const row = { slug: "task", props: f.dynamic }, before = structuredClone(row);
  assert.equal(resolveModuleConfigFromRow(row).table, "task_records");
  assert.deepEqual(resolveModuleConfigFromRow(row).schema.fields.map(f => f.name), ["title"]);
  assert.deepEqual(row, before);
  assert.equal(f.load("packages/types/systemModuleSchemas.ts").getSystemModuleSchema("toString"), undefined);
});

test("DataProvider.list sends the exact ModuloForm query through the real API and PostgREST builder", async () => {
  const f = fixture(), original = globalThis.fetch;
  globalThis.fetch = async (_, init) => f.run(JSON.parse(init.body));
  try {
    const result = await f.provider.list(contract);
    assert.equal(result.data[0].slug, "task");
    const url = f.requests.at(-1);
    assert.equal(url.pathname, "/rest/v1/modulos");
    assert.equal(url.searchParams.get("activo"), "eq.true");
    assert.equal(url.searchParams.get("tipo"), "in.(tabla,subtabla,vista)");
    assert.equal(url.searchParams.get("order"), "orden.asc");
    assert.deepEqual(f.permissions, [["modulos", "ver"]]);
  } finally { globalThis.fetch = original; }
});

test("all structural fields are accepted; invented fields and phantom styles still return 400", async () => {
  const f = fixture();
  const names = f.load("packages/types/systemModuleSchemas.ts").MODULOS_SYSTEM_FIELD_NAMES;
  assert.equal((await f.run({ ...contract, fieldRefs: names })).status, 200);
  for (const field of ["no_existe", "icon", "color"]) {
    for (const input of [{ fieldRefs: [field] }, { filters: [{ field, op: "=", value: 1 }] }, { sort: [{ field, direction: "asc" }] }]) {
      const response = await f.run({ moduleSlug: "modulos", ...input });
      assert.equal(response.status, 400);
      assert.match((await response.json()).detail, new RegExp("Campo no declarado o no disponible: " + field));
    }
  }
});

test("system schema works without metadata row and never bypasses view permissions", async () => {
  assert.equal((await fixture({ metadata: false }).run(contract)).status, 200);
  const f = fixture({ denied: true });
  assert.equal((await f.run(contract)).status, 403);
  assert.equal(f.requests.length, 0);
});

test("real SelectorTabla opens the ModuloForm module list with slug identities", async () => {
  const states = [];
  const react = { cache: fn => fn, createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: "fragment",
    useState: initial => { const i = states.length; states.push(initial); return [initial, value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect() {},
  };
  const f = fixture({ react }), original = globalThis.fetch;
  globalThis.fetch = async (_, init) => f.run(JSON.parse(init.body));
  try {
    const Selector = f.load("packages/ui/src/components/fields/Selector.tsx").default;
    const tree = Selector({ ...contract, value: null, onChange() {} });
    await tree.props.children[0].props.onClick();
    assert.equal(states[1][0].label, "Tasks");
    assert.equal(states[1][0].value, "task");
    assert.equal(states[1][0].icon, undefined);
    assert.equal(f.requests.at(-1).searchParams.get("activo"), "eq.true");
  } finally { globalThis.fetch = original; }
});
