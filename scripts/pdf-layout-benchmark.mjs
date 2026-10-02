import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import net from "node:net";
import vm from "node:vm";
import os from "node:os";
import { realVariants } from "./pdf-layout-variants.mjs";

const require = createRequire(new URL("../pdf-service/package.json", import.meta.url));
const { chromium } = require("playwright");
const minimal = "<!doctype html><html><head><meta charset='utf-8'></head><body><p>PDF benchmark: texto simple.</p></body></html>";

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 : null;
}

// Read the actual service settings; do not import server.js (which starts a server).
export function serviceSettings(source, env) {
  const sandbox = { process: { env }, URL, net,
    ALLOWED_RESOURCE_HOSTS: (env.PDF_ALLOWED_RESOURCE_HOSTS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean) };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf("function buildLaunchOptions"), source.indexOf("async function launchBrowser")), sandbox);
  vm.runInContext(source.slice(source.indexOf("function isPrivateIp"), source.indexOf("// Host-only diagnostics")), sandbox);
  const options = source.match(/page\.pdf\((\{[\s\S]*?\n\s*\})\)/)?.[1];
  if (!options) throw new Error("PDF options unavailable");
  return { launch: sandbox.buildLaunchOptions(), allowed: sandbox.isAllowedResourceUrl,
    pdf: vm.runInContext(`(${options})`, sandbox) };
}

export function countChromiumPages(pdf) {
  // Chromium emits uncompressed page dictionaries, distinct from /Type /Pages.
  const count = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
  return count || null;
}

async function sample(browser, fixture, settings, timeout) {
  const times = {};
  const stage = async (name, work) => { const t = performance.now(); try { return await work(); } finally { times[name] = performance.now() - t; } };
  const start = performance.now();
  const context = await stage("context", () => browser.newContext({ javaScriptEnabled: process.env.PDF_ENABLE_JAVASCRIPT === "1" }));
  let page, pdf, metrics;
  const resources = { allowed: 0, blocked: 0, failed: 0, responses: {} };
  try {
    await context.route("**/*", route => {
      const allowed = settings.allowed(route.request().url());
      resources[allowed ? "allowed" : "blocked"]++;
      return allowed ? route.continue() : route.abort();
    });
    page = await stage("newPage", () => context.newPage());
    page.setDefaultTimeout(timeout);
    page.on("requestfailed", () => resources.failed++);
    page.on("response", r => { resources.responses[r.status()] = (resources.responses[r.status()] || 0) + 1; });
    await stage("setContent", () => page.setContent(fixture.html, { waitUntil: "load", timeout }));
    await stage("renderDelay", () => page.waitForTimeout(50));
    await stage("images", () => page.evaluate(async () => {
      await Promise.all(Array.from(document.images, async image => {
        image.loading = "eager";
        try { await image.decode(); } catch { /* Same service behavior. */ }
      }));
    }));
    pdf = await stage("page.pdf", () => page.pdf({ ...settings.pdf, timeout }));
    times.toPdf = performance.now() - start;
    // Inspection occurs AFTER printing; its cost is excluded from rendering totals.
    const inspectionStart = performance.now();
    await page.emulateMedia({ media: "print" });
    metrics = await page.evaluate(() => {
      const elements = [...document.querySelectorAll("*")];
      const counts = { shadows: 0, filters: 0, translucent: 0, backgrounds: 0, breaks: 0, hidden: 0 };
      const fonts = new Set();
      let cssRules = 0, inaccessibleStyleSheets = 0;
      function countRules(rules) {
        for (const rule of rules) { cssRules++; if (rule.cssRules) countRules(rule.cssRules); }
      }
      for (const sheet of document.styleSheets) {
        try { countRules(sheet.cssRules); } catch { inaccessibleStyleSheets++; }
      }
      for (const element of elements) {
        const css = getComputedStyle(element);
        if (css.boxShadow !== "none" || css.textShadow !== "none") counts.shadows++;
        if (css.filter !== "none" || css.backdropFilter !== "none") counts.filters++;
        if (Number(css.opacity) < 1) counts.translucent++;
        if (css.backgroundImage !== "none") counts.backgrounds++;
        if ([css.breakBefore, css.breakAfter].some(v => !["auto", "avoid"].includes(v))) counts.breaks++;
        if (css.display === "none" || css.visibility === "hidden") counts.hidden++;
        fonts.add(css.fontFamily);
      }
      return { domNodes: elements.length, images: document.images.length, cssRules, inaccessibleStyleSheets,
        svg: document.querySelectorAll("svg").length, svgNodes: document.querySelectorAll("svg *").length,
        tables: document.querySelectorAll("table").length, rows: document.querySelectorAll("tr").length,
        styles: document.querySelectorAll("style,link[rel=stylesheet]").length,
        scripts: document.scripts.length, fontFamilies: fonts.size, fontFaces: document.fonts.size,
        fontsLoaded: document.fonts.status === "loaded", css: counts,
        imageDimensions: Array.from(document.images, image => {
          const box = image.getBoundingClientRect();
          return { complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
            printedCssWidth: box.width, printedCssHeight: box.height,
            pixelsPerCssPixel: box.width > 0 ? image.naturalWidth / box.width : null };
        }),
        resourceTimings: performance.getEntriesByType("resource").map(r => ({
          duration: r.duration, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize,
        })),
      };
    });
    times.inspection = performance.now() - inspectionStart;
  } finally {
    const cleanupStart = performance.now();
    try { await page?.close(); } finally { await context.close(); }
    times.cleanup = performance.now() - cleanupStart;
  }
  times.total = performance.now() - start - times.inspection;
  return { times, htmlBytes: Buffer.byteLength(fixture.html), pdfBytes: pdf.length,
    pages: countChromiumPages(pdf), metrics, resources };
}

async function main() {
  const [manifestPath, second, third] = process.argv.slice(2);
  const outputPath = manifestPath === "--real" ? third : second;
  if (!manifestPath || !outputPath) throw new Error("arguments required");
  const fixtures = [{ name: "A", html: minimal }];
  if (manifestPath !== "--minimal" && manifestPath !== "--real") {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    for (const name of ["B", "C", "D"]) {
      if (typeof manifest[name] !== "string") throw new Error("missing real fixture");
      fixtures.push({ name, html: await readFile(resolve(dirname(manifestPath), manifest[name]), "utf8") });
    }
  }
  const iterations = Number(process.env.PDF_LAYOUT_ITERATIONS || 7);
  if (!Number.isInteger(iterations) || iterations < 3 || iterations > 30) throw new Error("invalid iterations");
  const timeout = Number(process.env.PDF_JOB_TIMEOUT_MS || 30000);
  const source = await readFile(new URL("../pdf-service/server.js", import.meta.url), "utf8");
  const settings = serviceSettings(source, process.env);
  const browser = await chromium.launch(settings.launch);
  const runSample = async fixture => {
    let timer;
    try {
      return await Promise.race([sample(browser, fixture, settings, timeout),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("sample timed out")), timeout + 2000); })]);
    } finally { clearTimeout(timer); }
  };
  const report = { playwright: require("playwright/package.json").version, chromium: browser.version(),
    platform: process.platform, cpus: os.availableParallelism(), pdfOptions: settings.pdf,
    iterations, fixtureSource: manifestPath === "--minimal" ? "minimal-only" : "user-supplied", cases: {} };
  try {
    if (manifestPath === "--real") {
      fixtures.push(...await realVariants(browser, await readFile(second, "utf8"), settings, timeout));
    }
    for (const fixture of fixtures) {
      // Warm browser/JIT and OS resource caches once per case; exclude this sample.
      const warmup = await runSample(fixture);
      if (fixture.name === "B" && warmup.metrics.images !== 0) throw new Error("B must exclude image elements");
      report.cases[fixture.name] = { htmlSha256: createHash("sha256").update(fixture.html).digest("hex"), samples: [] };
    }
    for (let i = 0; i < iterations; i++) {
      // Rotate order to limit first-case and host-load bias.
      for (let j = 0; j < fixtures.length; j++) {
        const fixture = fixtures[(i + j) % fixtures.length];
        report.cases[fixture.name].samples.push(await runSample(fixture));
      }
    }
  } finally { await browser.close(); }
  for (const result of Object.values(report.cases)) {
    result.medianMs = Object.fromEntries(Object.keys(result.samples[0].times).map(key => [key, median(result.samples.map(s => s.times[key]))]));
    result.medianPdfBytes = median(result.samples.map(s => s.pdfBytes));
    result.medianCounts = {
      htmlBytes: median(result.samples.map(s => s.htmlBytes)),
      domNodes: median(result.samples.map(s => s.metrics.domNodes)),
      cssRules: median(result.samples.map(s => s.metrics.cssRules)),
      images: median(result.samples.map(s => s.metrics.images)),
      pages: result.samples.every(s => s.pages !== null) ? median(result.samples.map(s => s.pages)) : null,
    };
    result.validImages = result.samples.every(s => s.metrics.imageDimensions.every(i => i.complete && i.naturalWidth > 0));
  }
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ playwright: report.playwright, chromium: report.chromium, platform: report.platform,
    iterations, cases: Object.fromEntries(Object.entries(report.cases).map(([name, result]) => [name, {
      medianMs: result.medianMs, htmlBytes: result.samples[0].htmlBytes, medianPdfBytes: result.medianPdfBytes,
      medianCounts: result.medianCounts,
      pages: result.samples.map(s => s.pages), images: result.samples[0].metrics.images,
      domNodes: result.samples[0].metrics.domNodes, validImages: result.validImages,
    }])) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error("Controlled PDF benchmark failed; check fixtures, installed Chromium, resource allowlist and output path. Details suppressed to protect signed URLs.");
  process.exitCode = 1;
});
