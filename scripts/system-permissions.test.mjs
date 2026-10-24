import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createSourceLoader } from "./helpers/dashboard-fixtures.mjs";

const load = createSourceLoader();
const permissions = load("packages/types/systemPermissions.ts");
const { SYSTEM_PERMISSION_GROUPS, updatePermission, permissionChecked, isRolePermissions } = permissions;
const { WORKFLOW_CATALOG } = load("packages/types/workflows.ts");

test("system permission catalog includes every executable workflow and run", () => {
  const group = SYSTEM_PERMISSION_GROUPS.find(group => group.namespace === "workflows");
  assert.deepEqual(group.permissions.map(item => item.action), ["run", ...WORKFLOW_CATALOG.map(item => item.key)]);
});

test("editing one arbitrary permission is immutable and never grants other workflows", () => {
  const original = { task: { ver: true }, workflows: { "records.copyRelated": true }, extension: { "custom.action": false } };
  const next = updatePermission(original, "workflows", "run", true);
  assert.equal(original.workflows.run, undefined);
  assert.equal(permissionChecked(original, "workflows", "records.copyRelated"), true);
  assert.equal(permissionChecked(next, "workflows", "derive.createFromParent"), false);
  assert.deepEqual(next.extension, original.extension);
  assert.equal(updatePermission(next, "workflows", "records.copyRelated", false).workflows["records.copyRelated"], false);
});

test("role validation retains dotted keys and legacy explicit grants, rejects unsafe structures", () => {
  assert.equal(isRolePermissions({ workflows: { run: true, "records.copyRelated": true }, task: true, "*": { ver: true } }), true);
  for (const value of [null, [], { workflows: { run: "true" } }, { workflows: { records: { copyRelated: true } } }, { workflows: { "bad key": true } }, JSON.parse('{"__proto__":{"run":true}}'), { workflows: { constructor: true } }])
    assert.equal(isRolePermissions(value), false);
});

test("role PUT passes complete validated permission JSON to the user-scoped client", async () => {
  let updated;
  const chain = { update(value) { updated = value; return chain; }, eq() { return chain; }, select() { return chain; }, async single() { return { data: { id: "role", ...updated }, error: null }; } };
  const route = createSourceLoader({
    "@repo/types": permissions,
    "@/lib/supabase/server": { createClient: async () => ({ from: () => chain }) },
  })("apps/web/app/api/roles/[id]/route.ts");
  const perms = { workflows: { run: true, "records.copyRelated": true, "derive.createFromParent": false } };
  const response = await route.PUT(new Request("https://example.test/api/roles/role", { method: "PUT", body: JSON.stringify({ title: "Role", slug: "role", perms }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(updated.perms, perms);
  assert.deepEqual((await response.json()).data.perms, perms);
  updated = undefined;
  const invalid = await route.PUT(new Request("https://example.test/api/roles/role", { method: "PUT", body: JSON.stringify({ perms: { workflows: { run: {} } } }) }));
  assert.equal(invalid.status, 400);
  assert.equal(updated, undefined);
});

test("Roles renders a separate catalog-driven system section and retains the backend double check", () => {
  const page = readFileSync("apps/web/app/(main)/system/rol/[id]/page.tsx", "utf8");
  assert.match(page, /Permisos de sistema/);
  assert.match(page, /SYSTEM_PERMISSION_GROUPS\.map/);
  assert.match(page, /permissionChecked\(role\.perms/);
  const endpoint = readFileSync("apps/web/app/api/workflows/run/route.ts", "utf8");
  assert.match(endpoint, /requirePermission\("workflows\.run"\)/);
  assert.match(endpoint, /requirePermission\(`workflows\.\$\{body\.workflowKey\}`\)/);
});

test("Roles loads existing workflow checks, edits one independently and saves all namespaces", async () => {
  const slots = []; let cursor = 0; let first = true; const effects = [];
  const originalFetch = globalThis.fetch;
  let saved;
  const role = { id: "role", title: "Editor", slug: "editor", perms: { task: { ver: true }, workflows: { run: false, "records.copyRelated": true }, custom: { action: true } } };
  globalThis.fetch = async (url, options) => {
    if (options?.method === "PUT") { saved = JSON.parse(options.body); return { ok: true, json: async () => ({ ok: true }) }; }
    return { ok: true, json: async () => ({ ok: true, data: url.includes("modulos") ? [{ id: "task", nombre: "Tasks", slug: "task", tipo: "tabla" }] : structuredClone(role) }) };
  };
  const { default: Page } = createSourceLoader({
    "@repo/types": permissions,
    react: {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
      useEffect(effect) { if (first) effects.push(effect); },
    },
    "next/navigation": { useParams: () => ({ id: "role" }), useRouter: () => ({ push() {}, back() {} }) },
  })("apps/web/app/(main)/system/rol/[id]/page.tsx");
  const render = () => { cursor = 0; const tree = Page(); first = false; return tree; };
  const find = (tree, predicate) => {
    if (!tree || typeof tree !== "object") return undefined;
    if (predicate(tree)) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
  };
  try {
    render(); effects.forEach(effect => effect());
    await new Promise(resolve => setImmediate(resolve));
    const checkbox = (label) => find(find(render(), node => node.type === "label" && find(node, child => child.type === "span" && child.props.children === label)), node => node.type === "input");
    assert.equal(checkbox("Copiar registros relacionados").props.checked, true);
    assert.equal(checkbox("Ejecutar workflows").props.checked, false);
    checkbox("Ejecutar workflows").props.onChange({ target: { checked: true } });
    assert.equal(checkbox("Crear desde un registro padre").props.checked, false);
    await find(render(), node => node.type === "button" && node.props.children === "Guardar cambios").props.onClick();
    assert.deepEqual(saved.perms, { ...role.perms, workflows: { ...role.perms.workflows, run: true } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
