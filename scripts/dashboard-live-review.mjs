// Explicit opt-in integration test. Uses isolated users/roles/modules and cleans them up.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
const require = createRequire(resolve("apps/web/package.json"));
process.loadEnvFile(resolve("apps/web/.env.local"));
if (process.env.JIRO_LIVE_REVIEW !== "1")
  throw new Error("Requires JIRO_LIVE_REVIEW=1");
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const base = process.env.JIRO_REVIEW_URL || "http://localhost:3000";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const projectSlug = `review_py_${suffix}`;
const taskSlug = `review_task_${suffix}`;
const folderId = randomUUID(),
  projectId = randomUUID(),
  taskId = randomUUID();
const roleIds = [],
  userIds = [];
const originalUi = {
  dashboard: false,
  sidebar: true,
  icon: "bi-people",
  color: "#35797e",
  reviewMarker: suffix,
};
let browser;
function checked(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function login(roleId, index) {
  const email = `jiro-review-${suffix}-${index}@example.com`;
  const password = `${randomUUID()}Aa!9`;
  const user = checked(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  ).user;
  userIds.push(user.id);
  checked(
    await admin
      .from("users")
      .upsert({
        uid: user.id,
        email,
        role_id: roleId,
        role: index === 0 ? "systemadmin" : "worker",
      }),
  );
  const cookies = new Map();
  const client = createServerClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => [...cookies.values()],
        setAll: (items) =>
          items.forEach((item) => cookies.set(item.name, item)),
      },
    },
  );
  checked(await client.auth.signInWithPassword({ email, password }));
  const context = await browser.newContext();
  await context.addCookies(
    [...cookies.values()].map(({ name, value }) => ({
      name,
      value,
      domain: new URL(base).hostname,
      path: "/",
      sameSite: "Lax",
    })),
  );
  return { context, client, page: await context.newPage() };
}
try {
  for (const task of [true, false]) {
    const id = randomUUID();
    roleIds.push(id);
    checked(
      await admin.from("rol").insert({
        id,
        title: `Review ${suffix}`,
        slug: `review_${suffix}_${task}`,
        perms: {
          modulos: { ver: true, actualizar: true },
          rol: { ver: false },
          [projectSlug]: { ver: true },
          [taskSlug]: { ver: task },
          task: { ver: task },
        },
      }),
    );
  }
  checked(
    await admin.from("modulos").insert([
      {
        id: folderId,
        nombre: `Revisión ${suffix}`,
        slug: `review_family_${suffix}`,
        tipo: "carpeta",
        activo: true,
        route: "#",
        orden: 9999,
        props: {},
      },
      {
        id: projectId,
        parent_id: folderId,
        nombre: "Proyectos · prueba",
        slug: projectSlug,
        tipo: "tabla",
        activo: true,
        route: `/m/${projectSlug}`,
        orden: 1,
        props: { db: { table: "py" }, fields: [], ui: originalUi },
      },
      {
        id: taskId,
        parent_id: folderId,
        nombre: "Tareas · prueba",
        slug: taskSlug,
        tipo: "tabla",
        activo: true,
        route: `/m/${taskSlug}`,
        orden: 2,
        props: {
          db: { table: "task" },
          fields: [],
          ui: { ...originalUi, dashboard: true },
        },
      },
    ]),
  );
  browser = await chromium.launch({ channel: "msedge" });
  const a = await login(roleIds[0], 0),
    b = await login(roleIds[1], 1);
  const errors = [];
  a.page.on("pageerror", (error) => errors.push(error.message));
  b.page.on("pageerror", (error) => errors.push(error.message));
  // Demonstrates the real RLS/fallback discrepancy without modifying policies.
  const hiddenRole = checked(
    await a.client.from("rol").select("id").eq("id", roleIds[0]),
  );
  assert.equal(hiddenRole.length, 0);
  assert.equal(
    checked(await a.client.rpc("can", { modulo: projectSlug, accion: "ver" })),
    true,
  );
  console.log("PASS: real RLS hides rol while public.can grants module access");
  async function editDashboard(enabled) {
    await a.page.goto(`${base}/system/modulos/${projectId}?edit=true`);
    await a.page
      .getByRole("button", { name: "Apariencia", exact: true })
      .click({ timeout: 60000 });
    await a.page.locator("#module-dashboard").setChecked(enabled);
    await a.page.getByRole("button", { name: "Guardar", exact: true }).click();
    await a.page.waitForURL(/edit=false/, { timeout: 60000 });
    const saved = checked(
      await admin.from("modulos").select("props").eq("id", projectId).single(),
    ).props;
    assert.equal(saved.ui.dashboard, enabled);
    for (const key of ["sidebar", "icon", "color", "reviewMarker"])
      assert.deepEqual(saved.ui[key], originalUi[key]);
    const userRead = checked(
      await a.client
        .from("modulos")
        .select("props")
        .eq("id", projectId)
        .single(),
    );
    assert.equal(userRead.props.ui.dashboard, enabled);
    await a.page.goto(`${base}/system/modulos/${projectId}?edit=true`);
    await a.page
      .getByRole("button", { name: "Apariencia", exact: true })
      .click();
    assert.equal(
      await a.page.locator("#module-dashboard").isChecked(),
      enabled,
    );
  }
  await editDashboard(true);
  console.log(
    "PASS: real ModuloForm -> server action -> PostgreSQL -> checkbox reload (true), other ui preserved",
  );
  await a.page.goto(base);
  await a.page
    .locator(`main a[href="/m/${projectSlug}"]`)
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
  assert.ok(await a.page.locator(`main a[href="/m/${projectSlug}"]`).count());
  assert.ok(await a.page.locator(`main a[href="/m/${taskSlug}"]`).count());
  await b.page.goto(base);
  await b.page
    .locator(`main a[href="/m/${projectSlug}"]`)
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
  assert.ok(await b.page.locator(`main a[href="/m/${projectSlug}"]`).count());
  assert.equal(
    await b.page.locator(`main a[href="/m/${taskSlug}"]`).count(),
    0,
  );
  const permsA = await a.context.request.get(`${base}/api/perms`);
  const permsB = await b.context.request.get(`${base}/api/perms`);
  assert.ok(
    (await permsA.json()).permisos.some(
      (p) => p.modulo === taskSlug && p.accion === "ver",
    ),
  );
  assert.equal(
    (await permsB.json()).permisos.some(
      (p) => p.modulo === taskSlug && p.accion === "ver",
    ),
    false,
  );
  await b.page.goto(`${base}/m/${taskSlug}`);
  await b.page.waitForURL(/\/403$/, { timeout: 60000 });
  const denied = await b.context.request.post(`${base}/api/list`, {
    data: { moduleSlug: taskSlug },
  });
  assert.equal(denied.status(), 403);
  console.log(
    "PASS: user A sees both cards; B sees project only; real destination and API deny B (403)",
  );
  await editDashboard(false);
  await a.page.goto(base);
  await a.page
    .locator(`main a[href="/m/${taskSlug}"]`)
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
  assert.equal(
    await a.page.locator(`main a[href="/m/${projectSlug}"]`).count(),
    0,
  );
  console.log(
    "PASS: dashboard=false survives PostgreSQL reload and removes the card",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  checked(await admin.from("modulos").delete().in("id", [projectId, taskId]));
  checked(await admin.from("modulos").delete().eq("id", folderId));
  for (const id of userIds) {
    checked(await admin.from("users").delete().eq("uid", id));
    checked(await admin.auth.admin.deleteUser(id));
  }
  if (roleIds.length)
    checked(await admin.from("rol").delete().in("id", roleIds));
  console.log(
    "Cleanup complete: isolated module, role and auth-user fixtures removed",
  );
}
