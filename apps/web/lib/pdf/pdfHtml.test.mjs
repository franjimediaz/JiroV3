import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const sourceDir = path.resolve("apps/web/lib/pdf");

async function transpilePdfModule(fileName, tempDir) {
  const source = await readFile(path.join(sourceDir, fileName), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
    .replaceAll('from "./pdfHtml"', 'from "./pdfHtml.mjs"')
    .replaceAll('from "./renderAdvancedBlocks"', 'from "./renderAdvancedBlocks.mjs"')
    .replaceAll('from "./normalizePdfTemplate"', 'from "./normalizePdfTemplate.mjs"')
    .replaceAll('from "./planRenderer"', 'from "./planRenderer.mjs"');

  const outFile = path.join(tempDir, fileName.replace(/\.ts$/, ".mjs"));
  await writeFile(outFile, output, "utf8");
  return outFile;
}

async function loadPdfModules() {
  const tempRoot = path.join(sourceDir, ".test-tmp");
  await mkdir(tempRoot, { recursive: true });
  const tempDir = await mkdtemp(path.join(tempRoot, "run-"));
  await transpilePdfModule("pdfHtml.ts", tempDir);
  await transpilePdfModule("normalizePdfTemplate.ts", tempDir);
  await transpilePdfModule("planRenderer.ts", tempDir);
  await transpilePdfModule("renderAdvancedBlocks.ts", tempDir);
  const renderPath = await transpilePdfModule("renderTemplateToHtml.ts", tempDir);
  const pdfHtml = await import(pathToFileURL(path.join(tempDir, "pdfHtml.mjs")).href);
  const planRenderer = await import(pathToFileURL(path.join(tempDir, "planRenderer.mjs")).href);
  const renderer = await import(pathToFileURL(renderPath).href);
  return { ...pdfHtml, ...planRenderer, ...renderer };
}

const modulesPromise = loadPdfModules();

test("sanitizePdfHtml keeps plain text unchanged", async () => {
  const { sanitizePdfHtml } = await modulesPromise;
  assert.equal(sanitizePdfHtml("Presupuesto generado para Cliente Demo"), "Presupuesto generado para Cliente Demo");
});

test("sanitizePdfHtml renders basic HTML instead of escaping it", async () => {
  const { sanitizePdfHtml } = await modulesPromise;
  assert.equal(sanitizePdfHtml("<strong>Cliente Demo</strong>"), "<strong>Cliente Demo</strong>");
});

test("resolveAndSanitizePdfHtml resolves image variables before sanitizing", async () => {
  const { resolveAndSanitizePdfHtml } = await modulesPromise;
  const html = resolveAndSanitizePdfHtml({
    input: '<img src="{{branding.logoUrl}}" alt="Logo" style="max-height:10px; width:150px;" />',
    ctx: { branding: { logoUrl: "https://example.com/logo.png" } },
    resolveTemplate: (input, ctx) => String(input).replaceAll("{{branding.logoUrl}}", ctx.branding.logoUrl),
  });

  assert.match(html, /<img/);
  assert.match(html, /src="https:\/\/example\.com\/logo\.png"/);
  assert.match(html, /max-height:\s*10px/);
  assert.match(html, /width:\s*150px/);
});

test("resolveAndSanitizePdfHtml resolves branding signature images", async () => {
  const { resolveAndSanitizePdfHtml } = await modulesPromise;
  const html = resolveAndSanitizePdfHtml({
    input: '<img src="{{branding.firmaUrl}}" alt="Firma" style="max-height:24px;" />',
    ctx: { branding: { firmaUrl: "https://example.com/firma.png" } },
    resolveTemplate: (input, ctx) => String(input).replaceAll("{{branding.firmaUrl}}", ctx.branding.firmaUrl),
  });

  assert.match(html, /<img/);
  assert.match(html, /src="https:\/\/example\.com\/firma\.png"/);
  assert.match(html, /max-height:\s*24px/);
});

test("resolveAndSanitizePdfHtml resolves variables inside formatted text", async () => {
  const { resolveAndSanitizePdfHtml } = await modulesPromise;
  const html = resolveAndSanitizePdfHtml({
    input: "<p>Presupuesto para <strong>{{customer.name}}</strong></p>",
    ctx: { customer: { name: "Empresa Demo" } },
    resolveTemplate: (input, ctx) => String(input).replaceAll("{{customer.name}}", ctx.customer.name),
  });

  assert.equal(html, "<p>Presupuesto para <strong>Empresa Demo</strong></p>");
});

test("sanitizePdfHtml removes scripts and keeps safe content", async () => {
  const { sanitizePdfHtml } = await modulesPromise;
  assert.equal(sanitizePdfHtml("<script>alert('xss')</script><p>Texto seguro</p>"), "<p>Texto seguro</p>");
});

test("sanitizePdfHtml removes dangerous event attributes", async () => {
  const { sanitizePdfHtml } = await modulesPromise;
  const html = sanitizePdfHtml('<img src="https://example.com/logo.png" onerror="alert(\'xss\')" />');
  assert.match(html, /<img/);
  assert.match(html, /src="https:\/\/example\.com\/logo\.png"/);
  assert.doesNotMatch(html, /onerror/);
});

test("sanitizePdfHtml removes dangerous URL protocols", async () => {
  const { sanitizePdfHtml } = await modulesPromise;
  const html = sanitizePdfHtml('<a href="javascript:alert(\'xss\')">click</a>');
  assert.equal(html, '<a target="_blank" rel="noopener noreferrer">click</a>');
});

test("renderTemplateToHtml applies safe HTML to headers, cards and sections", async () => {
  const { renderTemplateToHtml } = await modulesPromise;
  const html = renderTemplateToHtml(
    {
      blocks: [
        { type: "header", title: "<strong>{{record.title}}</strong>", rightText: '<img src="{{branding.logoUrl}}" alt="Logo" />' },
        { type: "cards", title: "<em>Resumen</em>", cards: [{ title: "<strong>Tarjeta</strong>", lines: ["<p>{{record.description}}</p>"] }] },
        { type: "section", title: "<span>Info</span>", blocks: [{ type: "text", value: "<p>Bloque <strong>seguro</strong></p>" }] },
      ],
    },
    {
      record: { title: "Cliente Demo", description: "Descripcion" },
      branding: { logoUrl: "https://example.com/logo.png" },
    },
  );

  assert.match(html, /<div class="hdr-title"><strong>Cliente Demo<\/strong><\/div>/);
  assert.match(html, /<img src="https:\/\/example\.com\/logo\.png" alt="Logo" \/>/);
  assert.match(html, /<div class="cards-card-title"><strong>Tarjeta<\/strong><\/div>/);
  assert.match(html, /<div class="sec-title"><span>Info<\/span><\/div>/);
  assert.match(html, /<p>Bloque <strong>seguro<\/strong><\/p>/);
});

test("renderTemplateToHtml renders plan fields as images instead of raw JSON", async () => {
  const { renderTemplateToHtml } = await modulesPromise;
  const plan = { version: 8, canvas: { width: 200, height: 100, unit: "m", scale: { pixels: 100, realValue: 1, unit: "m" }, grid: { enabled: true, size: 20 } }, layers: [{ id: "l1", name: "Plano", visible: true, locked: false, order: 1 }], activeLayerId: "l1", objects: [{ id: "r1", type: "rect", layerId: "l1", x: 10, y: 10, width: 80, height: 40, stroke: "#111827", strokeWidth: 2, fill: "transparent", label: "Sala", showArea: true }] };
  const html = renderTemplateToHtml(
    { blocks: [{ type: "text", value: "<p>{{record.plano}}</p>" }] },
    { record: { plano: plan }, __planFields: { record: ["plano"], related: {} } },
  );
  assert.match(html, /<img/);
  assert.match(html, /data:image\/svg\+xml/);
  assert.doesNotMatch(html, /"objects"/);
});

test("renderTemplateToHtml supports renderPlan calls and table plan columns", async () => {
  const { renderTemplateToHtml } = await modulesPromise;
  const plan = { version: 8, canvas: { width: 200, height: 100, unit: "m", grid: { enabled: true, size: 20 } }, objects: [{ id: "t1", type: "text", x: 20, y: 20, text: "Plano", fontSize: 16, fill: "#111827" }] };
  const html = renderTemplateToHtml(
    {
      blocks: [
        { type: "text", value: "{{ renderPlan(plano, width=300, height=180, includeGrid=false) }}" },
        { type: "table", repeat: "related.estancias", columns: [{ label: "Plano", value: "{{item.plano}}", renderer: "plan", options: { width: 240, height: 160 } }] },
      ],
    },
    { record: { plano: plan }, related: { estancias: [{ plano: plan }] }, __planFields: { record: ["plano"], related: { estancias: ["plano"] } } },
  );
  assert.equal((html.match(/pdf-plan-img/g) || []).length, 2);
  assert.match(html, /width="300"/);
  assert.match(html, /width="240"/);
});

test("plan renderer cache keys are stable and option-sensitive", async () => {
  const { getPlanRenderCacheKey, createPlanRenderCache, renderPlanToDataUrl, normalizePlanForRender } = await modulesPromise;
  const plan = { version: 8, canvas: { width: 100, height: 100 }, objects: [{ id: "x", type: "text", x: 1, y: 1, text: "X" }] };
  assert.ok(normalizePlanForRender(JSON.stringify(plan)));
  assert.equal(normalizePlanForRender("{bad json"), null);
  assert.equal(getPlanRenderCacheKey(plan, { width: 100 }), getPlanRenderCacheKey({ objects: plan.objects, canvas: plan.canvas, version: 8 }, { width: 100 }));
  assert.notEqual(getPlanRenderCacheKey(plan, { width: 100 }), getPlanRenderCacheKey(plan, { width: 101 }));
  const cache = createPlanRenderCache();
  const first = renderPlanToDataUrl(plan, { width: 100 }, cache);
  const second = renderPlanToDataUrl(plan, { width: 100 }, cache);
  assert.equal(first, second);
  assert.equal(cache.size, 1);
});
