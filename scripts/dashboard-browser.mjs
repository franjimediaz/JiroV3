// Isolated visual checks with explicit fixtures; no production data or auth changes.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";
import ts from "typescript";

const base = resolve("apps/web/app/(main)");
const require = createRequire(resolve(base, "Dashboard.tsx"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function load(file) {
  const code = ts.transpileModule(readFileSync(resolve(base, file), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  const localRequire = (id) =>
    id.endsWith(".css")
      ? { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) }
      : require(id);
  new Function("require", "module", "exports", code)(
    localRequire,
    mod,
    mod.exports,
  );
  return mod.exports;
}
const { Dashboard, DashboardSkeleton } = load("Dashboard.tsx");
const { buildDashboardModules, featuredModules } = load("dashboard-model.ts");
const row = (slug, name, props = {}, parent_id = null) => ({
  id: slug,
  slug,
  nombre: name,
  activo: true,
  tipo: "tabla",
  orden: 1,
  route: null,
  parent_id,
  props: { db: { table: slug }, ...props },
});
const modules = buildDashboardModules([
  row("clientes", "Clientes", { ui: { icon: "bi-person", color: "#2563eb" } }),
  row("proyectos", "Proyectos", {
    ui: { icon: "bi bi-briefcase", color: "#0f766e" },
  }),
  row("documentos", "Documentación y seguimiento de proyectos"),
  row("tareas", "Tareas pendientes"),
  row("sin-configurar", "Sin configurar", { db: null }),
  row("system", "Sistema"),
  row("modulos", "Módulos", {}, "system"),
  row("rol", "Roles", {}, "system"),
  row("pdf-templates", "Plantillas PDF", {}, "system"),
]);
const featured = featuredModules(modules);
featured[0].count = 0;
featured[1].count = 1234;
const output = resolve(".next/dashboard-check");
mkdirSync(output, { recursive: true });
const css = [
  "apps/web/app/globals.css",
  "apps/web/node_modules/bootstrap/dist/css/bootstrap.min.css",
  "apps/web/node_modules/bootstrap-icons/font/bootstrap-icons.css",
  "apps/web/app/(main)/dashboard.module.css",
]
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
let fixture = "normal";
function markup() {
  const stress = modules.map((item) => ({
    ...item,
    name: "TextoSinEspacios".repeat(14),
  }));
  const element =
    fixture === "loading"
      ? React.createElement(DashboardSkeleton)
      : React.createElement(Dashboard, {
          modules:
            fixture === "empty" || fixture === "error"
              ? []
              : fixture === "stress"
                ? stress
                : modules,
          featured:
            fixture === "empty" || fixture === "error"
              ? []
              : fixture === "stress"
                ? stress.slice(0, 4)
                : featured,
          email:
            fixture === "stress"
              ? `${"correo".repeat(30)}@example.test`
              : "equipo@example.test",
          loadError: fixture === "error",
        });
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Dashboard fixture</title><style>${css}</style></head><body>
    <nav class="navbar navbar-dark bg-dark" style="height:90px;color:white;padding:24px">JiRo · Prueba visual</nav>
    <div class="container-fluid"><div class="main-shell-layout"><aside class="main-shell-sidebar d-none d-lg-block" style="background:#0b162b"></aside>
    <main class="main-shell-content flex-grow-1 p-3 p-lg-4"><div class="bg-white rounded shadow-sm p-3 p-lg-4">${renderToStaticMarkup(element)}</div></main>
    </div></div></body></html>`;
}
const server = createServer((req, res) => {
  if (req.url.startsWith("/fonts/")) {
    const file = resolve(
      "apps/web/node_modules/bootstrap-icons/font/fonts",
      req.url.split("?")[0].slice(7),
    );
    res.setHeader("Content-Type", "font/woff2");
    res.end(readFileSync(file));
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(markup());
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  for (fixture of ["normal", "stress", "empty", "error", "loading"]) {
    for (const width of [1440, 1280, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1050 });
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page
        .locator(".dashboard, .dashboard *")
        .evaluateAll((nodes) =>
          nodes
            .filter(
              (node) =>
                node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1,
            )
            .map((node) => node.className),
        );
      assert.deepEqual(overflow, [], `${fixture} at ${width}px overflows`);
      assert.equal(await page.locator('a[href="#"]').count(), 0);
      if (fixture === "normal") {
        for (const href of await page
          .locator(".dashboard a")
          .evaluateAll((links) => links.map((a) => a.getAttribute("href")))) {
          assert.ok(
            href.startsWith("/m/") ||
              existsSync(resolve(base, `.${href}/page.tsx`)),
          );
        }
        assert.ok(await page.getByText("0 registros accesibles").count());
        assert.ok(await page.getByText("Conteo no disponible").count());
        const missingIcons = await page
          .locator(".dashboard i")
          .evaluateAll(
            (nodes) =>
              nodes.filter((node) =>
                ["none", "normal", '""'].includes(
                  getComputedStyle(node, "::before").content,
                ),
              ).length,
          );
        assert.equal(missingIcons, 0);
        await page.keyboard.press("Tab");
        assert.equal(
          await page
            .locator(":focus")
            .evaluate((node) => getComputedStyle(node).outlineStyle),
          "solid",
        );
      }
      await page.screenshot({
        path: resolve(output, `${fixture}-${width}.png`),
        fullPage: true,
      });
    }
  }
  fixture = "normal";
  await page.goto(url);
  const links = await page
    .locator(".dashboard a")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  for (let index = 0; index < links.length; index++) {
    await page.goto(url);
    await page.locator(".dashboard a").nth(index).click();
    assert.equal(new URL(page.url()).pathname, links[index]);
  }
  await page.goto(url);
  const request = page.waitForRequest((req) => req.method() === "POST");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  assert.equal(new URL((await request).url()).pathname, "/api/auth/signout");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 25 visual fixtures, overflow, icons, keyboard focus, all link targets and signout POST. Screenshots:",
    output,
  );
} finally {
  await browser.close();
  server.close();
}
