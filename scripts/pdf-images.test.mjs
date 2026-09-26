import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync("pdf-service/server.js", "utf8");
function imageHelpers(hosts = []) {
  const warnings = [];
  const sandbox = { URL, net: { isIP: (host) => /^\d+\.\d+\.\d+\.\d+$/.test(host) ? 4 : 0 },
    ALLOWED_RESOURCE_HOSTS: hosts, console: { warn: (...args) => warnings.push(args) }, document: { images: [] } };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf("function isPrivateIp"), source.indexOf("async function timePdfStage")), sandbox);
  return { sandbox, warnings };
}

test("Storage needs its exact allowlisted HTTPS host; private and unlisted hosts remain blocked", () => {
  const host = "xflhljlfgzqczydrfwws.supabase.co";
  const url = `https://${host}/storage/v1/object/public/logo.png`;
  assert.equal(imageHelpers().sandbox.isAllowedResourceUrl(url), false);
  const { sandbox } = imageHelpers([host, "127.0.0.1", "10.0.0.1"]);
  assert.equal(sandbox.isAllowedResourceUrl(url), true);
  for (const bad of [`http://${host}/logo.png`, "https://another.supabase.co/logo.png", "https://127.0.0.1/logo.png", "https://10.0.0.1/logo.png", "/logo.png"]) {
    assert.equal(sandbox.isAllowedResourceUrl(bad), false, bad);
  }
});

test("a valid image is decoded before page.pdf, and the resource route does not abort it", async () => {
  const host = "xflhljlfgzqczydrfwws.supabase.co";
  const { sandbox, warnings } = imageHelpers([host]);
  let decodeDone = false;
  let finishDecode;
  let pdfCalled = false;
  let handler;
  let intercept;
  const image = { loading: "lazy", naturalWidth: 32, currentSrc: `https://${host}/logo.png`,
    decode: () => new Promise(resolve => { finishDecode = () => { decodeDone = true; resolve(); }; }) };
  sandbox.document.images = [image];
  const page = {
    async setContent() { let continued = false; await intercept({ request: () => ({ url: () => image.currentSrc }), continue: async () => { continued = true; }, abort: async () => assert.fail("valid image was blocked") }); assert.ok(continued); },
    async waitForTimeout() {}, async evaluate(fn) { return fn(); },
    async pdf() { assert.equal(decodeDone, true); pdfCalled = true; return Buffer.from("%PDF-test"); },
    async close() {},
  };
  Object.assign(sandbox, { app: { post(_path, callback) { handler = callback; } }, activeJobs: 0,
    MAX_CONCURRENT_JOBS: 2, MAX_HTML_BYTES: 750000, JOB_TIMEOUT_MS: 30000, performance,
    timingSafeBearer: () => true, acquireBrowser: async () => ({ browser: { async newContext() { return { async route(_glob, fn) { intercept = fn; }, async newPage() { return page; }, async close() {} }; } } }),
    releaseBrowser: async () => {}, retireBrowser() {}, timePdfStage: async (_label, work) => work(),
    withTimeout: async work => work(), sanitizeDisposition: () => "inline", sanitizeFilename: () => "test.pdf",
    process: { env: {} }, Buffer, playwrightVersion: "test",
  });
  vm.runInContext(source.slice(source.indexOf('app.post("/generate"'), source.indexOf("const port =")), sandbox);
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, send() { return this; } };
  const request = handler({ headers: {}, body: { html: '<img src="https://' + host + '/logo.png">' } }, res);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(image.loading, "eager");
  assert.equal(pdfCalled, false);
  assert.equal(typeof finishDecode, "function");
  finishDecode();
  await request;
  assert.equal(res.code, 200);
  assert.equal(pdfCalled, true);
  assert.equal(warnings.length, 0);
});

test("failed and relative image diagnostics do not reveal signed paths or tokens", async () => {
  const { sandbox, warnings } = imageHelpers();
  sandbox.document.images = ["https://images.example/private/file.png?token=secret", "/relative.png"].map(src => ({ naturalWidth: 0, currentSrc: src, decode: async () => { throw new Error("failed"); } }));
  await sandbox.waitForPdfImages({ evaluate: fn => fn() });
  assert.match(JSON.stringify(warnings), /images\.example/);
  assert.match(JSON.stringify(warnings), /relative-or-invalid/);
  assert.doesNotMatch(JSON.stringify(warnings), /secret|private|file\.png/);
});

const serviceUrl = process.env.PDF_IMAGE_TEST_SERVICE_URL;
const secret = process.env.PDF_IMAGE_TEST_SERVICE_SECRET;
const imageUrl = process.env.PDF_IMAGE_TEST_URL;
test("real service embeds the Storage PNG itself, not the broken-image icon", {
  skip: !serviceUrl || !secret || !imageUrl ? "Set PDF_IMAGE_TEST_SERVICE_URL, PDF_IMAGE_TEST_SERVICE_SECRET and PDF_IMAGE_TEST_URL" : false,
}, async () => {
  const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
  assert.equal(imageResponse.status, 200, "PNG must be accessible without browser cookies");
  const png = Buffer.from(await imageResponse.arrayBuffer());
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "Fixture must be a PNG");
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const src = imageUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const response = await fetch(serviceUrl.replace(/\/$/, "") + "/generate", {
    method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ html: `<html><body><img src="${src}"></body></html>` }), signal: AbortSignal.timeout(45000),
  });
  assert.equal(response.status, 200);
  const pdf = Buffer.from(await response.arrayBuffer()).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-"));
  const objects = pdf.split(/\d+\s+\d+\s+obj\b/);
  assert.ok(objects.some(obj => /\/Subtype\s*\/Image\b/.test(obj) && new RegExp(`/Width\\s+${width}\\b`).test(obj) && new RegExp(`/Height\\s+${height}\\b`).test(obj)),
    `PDF does not embed the source PNG (${width}x${height}); check the service allowlist and resource logs`);
});
