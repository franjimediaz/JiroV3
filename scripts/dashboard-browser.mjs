// Isolated visual checks with explicit fixtures; no production data or auth changes.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";
import {
  loadSource,
  groupsFor,
  fixtureRows,
  fixturePerms,
} from "./helpers/dashboard-fixtures.mjs";

const base = resolve("apps/web/app/(main)");
const require = createRequire(resolve(base, "Dashboard.tsx"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { Dashboard, DashboardSkeleton } = loadSource(
  resolve(base, "Dashboard.tsx"),
);
const groups = groupsFor(fixtureRows, fixturePerms);
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
  const stress = groups.map((group) => ({
    ...group,
    name: "FamiliaSinEspacios".repeat(12),
    modules: group.modules.map((item) => ({
      ...item,
      name: "TextoSinEspacios".repeat(14),
    })),
  }));
  const element =
    fixture === "loading"
      ? React.createElement(DashboardSkeleton)
      : React.createElement(Dashboard, {
          groups:
            fixture === "empty" || fixture === "error"
              ? []
              : fixture === "stress"
                ? stress
                : fixture === "restricted"
                  ? groupsFor(fixtureRows, { py: { ver: true } })
                  : groups,
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
  for (fixture of [
    "normal",
    "stress",
    "empty",
    "error",
    "loading",
    "restricted",
  ]) {
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
        assert.equal(await page.locator(".groupGrid section").count(), 3);
        assert.equal(
          await page.locator('.groupGrid a[href="/m/py"]').count(),
          1,
        );
        assert.equal(
          await page.locator('.groupGrid a[href="/m/task"]').count(),
          1,
        );
        assert.equal(await page.getByText("No habilitado").count(), 0);
        assert.equal(await page.getByText("Familia vacía").count(), 0);
        assert.equal(
          await page.getByText("Configuración", { exact: true }).count(),
          0,
        );
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
      if (fixture === "restricted") {
        assert.equal(await page.locator(".groupGrid section").count(), 1);
        assert.equal(await page.locator(".groupGrid a").count(), 1);
        assert.equal(
          await page.locator(".groupGrid a").getAttribute("href"),
          "/m/py",
        );
      }
      if (fixture === "empty") {
        assert.equal(await page.locator(".groupGrid section").count(), 0);
        assert.ok(
          await page
            .getByText("No tienes accesos configurados para el dashboard.")
            .count(),
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
    "PASS: 30 visual fixtures, groups, permissions, empty states, overflow, icons, keyboard focus, all link targets and signout POST. Screenshots:",
    output,
  );
} finally {
  await browser.close();
  server.close();
}
