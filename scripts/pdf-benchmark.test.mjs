import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { statistics, parseStageLogs, summarize, runBenchmark } from "./pdf-benchmark.mjs";

const id = "12345678-1234-4123-8123-123456789abc";
const line = value => "[pdf-benchmark] " + JSON.stringify({ id, ...value });

test("benchmark reports nearest-rank percentiles and leaves missing timings unknown", () => {
  assert.deepEqual(statistics([10, 20, 30, 40, NaN]), { count: 4, mean: 25, p50: 20, p95: 40 });
  assert.equal(statistics([]), null);
  const report = summarize({ samples: [{ id, ok: true, elapsedMs: 100 }] });
  assert.equal(report.summary.followingMs, null);
  assert.equal(report.summary.perStage["service.cleanup"].all, null);
  assert.equal(report.samples[0].browser, "unknown");
});

test("stage logs correlate requests, expose duplicate stages and discard sensitive fields", () => {
  const logs = [
    "https://private.example/object?token=secret",
    line({ scope: "web", stage: "pdfService", ms: 100, token: "secret" }),
    line({ scope: "service", stage: "responseReady", ms: 70 }),
    line({ scope: "service", stage: "cleanup", ms: 5 }),
    line({ scope: "service", browser: "reused" }),
    line({ scope: "service", stage: "cleanup", ms: 9 }),
    line({ scope: "service", stage: "unknown-secret", ms: 10 }),
    line({ scope: "__proto__", stage: "token", ms: 10 }),
    line({ id: "secret", scope: "service", stage: "total", ms: 10 }),
  ].join("\n");
  const parsed = parseStageLogs(logs);
  assert.equal(parsed.size, 1);
  const report = summarize({ samples: [{ id, ok: true, elapsedMs: 110 }] }, logs);
  assert.equal(report.samples[0].serviceRoundTripResidualMs, 30);
  assert.deepEqual(report.samples[0].duplicateStages, ["service.cleanup"]);
  assert.doesNotMatch(JSON.stringify(report), /secret|https:|token/);
});

test("benchmark repeats the exact PDF request, records fallback and stops on 429 without retry", async () => {
  const requests = [];
  const sleeps = [];
  const url = "https://app.example/api/pdf/generate?template=fixture&id=record";
  const report = await runBenchmark({ url, headers: { cookie: "session=secret" }, runs: 3,
    sleep: async ms => sleeps.push(ms), fetchImpl: async (target, options) => {
      requests.push({ target, options });
      if (requests.length === 2) return new Response("private error token=secret", { status: 429 });
      return new Response("%PDF-test", { headers: { "content-type": "application/pdf", "x-pdf-generator": "local", "x-pdf-upstream-status": "503" } });
    } });
  assert.equal(requests.length, 2);
  assert.ok(requests.every(r => r.target === url && r.options.redirect === "error" && r.options.headers.get("cookie") === "session=secret"));
  assert.notEqual(requests[0].options.headers.get("x-pdf-benchmark-id"), requests[1].options.headers.get("x-pdf-benchmark-id"));
  assert.deepEqual(sleeps, [2500]);
  assert.equal(report.samples[0].generator, "local");
  assert.equal(report.samples[0].upstreamStatus, 503);
  assert.equal(report.samples[1].ok, false);
  assert.equal(report.summary.allMs.count, 1);
  assert.doesNotMatch(JSON.stringify(report), /secret|app\.example|fixture&id/);
});

test("timing correlation stays opt-in, including rejected operations", async () => {
  const source = readFileSync("pdf-service/server.js", "utf8");
  const logs = [];
  const sandbox = { performance, process: { env: {} }, console: { info: message => logs.push(message) } };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf("async function timePdfStage"), source.indexOf("async function withTimeout")), sandbox);
  await sandbox.timePdfStage("page.close", async () => {}, id);
  assert.equal(logs.length, 0);
  sandbox.process.env.PDF_TIMING_LOGS = "1";
  await assert.rejects(sandbox.timePdfStage("page.close", async () => { throw new Error("private token=secret"); }, id));
  const record = parseStageLogs(logs.join("\n")).get(id);
  assert.ok(record.stages["service.page.close"] >= 0);
  assert.doesNotMatch(logs.join("\n"), /secret|private/);
});

test("concurrent browser acquisitions report creation and reuse for the correct request", async () => {
  const source = readFileSync("pdf-service/server.js", "utf8");
  const secondId = "87654321-1234-4123-8123-123456789abc";
  const logs = [];
  const sandbox = { process: { env: { PDF_TIMING_LOGS: "1" } },
    console: { info: message => logs.push(message) },
    launchBrowser: async () => ({ on() {}, isConnected: () => true }),
  };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf("let activeJobs"), source.indexOf("function buildLaunchOptions")), sandbox);
  await Promise.all([sandbox.acquireBrowser(id), sandbox.acquireBrowser(secondId)]);
  const parsed = parseStageLogs(logs.join("\n"));
  assert.equal(parsed.get(id).browser, "created");
  assert.equal(parsed.get(secondId).browser, "reused");
});

test("generation correlates cleanup after response and rejects sensitive correlation headers", async () => {
  const source = readFileSync("pdf-service/server.js", "utf8");
  for (const candidate of [id, "https://private.example/?token=secret"]) {
    const logs = [], order = [];
    let handler;
    const page = { async setContent() {}, async waitForTimeout(ms) { assert.equal(ms, 50); },
      async pdf() { return Buffer.from("%PDF-test"); }, async close() { order.push("page.close"); } };
    const context = { async route() {}, async newPage() { return page; }, async close() { order.push("context.close"); } };
    const sandbox = { performance, Buffer, process: { env: { PDF_TIMING_LOGS: "1" } },
      console: { info: message => logs.push(message), error() {} },
      app: { post(_path, fn) { handler = fn; } }, activeJobs: 0,
      MAX_CONCURRENT_JOBS: 2, MAX_HTML_BYTES: 750000, JOB_TIMEOUT_MS: 30000,
      ALLOWED_RESOURCE_HOSTS: [], timingSafeBearer: () => true,
      acquireBrowser: async value => { assert.equal(value, candidate === id ? id : null); return { browser: { newContext: async () => context } }; },
      releaseBrowser: async () => order.push("release"), retireBrowser() {},
      observeImageRequests() {}, waitForPdfImages: async () => {}, logImagePrintState: async () => {},
      withTimeout: async work => work(), sanitizeDisposition: () => "inline", sanitizeFilename: () => "test.pdf",
      playwrightVersion: "test",
    };
    vm.createContext(sandbox);
    vm.runInContext(source.slice(source.indexOf("async function timePdfStage"), source.indexOf("async function withTimeout")), sandbox);
    vm.runInContext(source.slice(source.indexOf('app.post("/generate"'), source.indexOf("const port =")), sandbox);
    const res = { setHeader() {}, status(code) { assert.equal(code, 200); return this; }, send() { order.push("response"); return this; } };
    await handler({ headers: { "x-pdf-benchmark-id": candidate }, body: { html: "<p>fixture</p>" } }, res);
    assert.deepEqual(order, ["response", "page.close", "context.close", "release"]);
    assert.equal(sandbox.activeJobs, 0);
    const records = parseStageLogs(logs.join("\n"));
    if (candidate === id) {
      for (const stage of ["cleanup", "page.close", "context.close", "browser.release", "total", "responseReady"]) {
        assert.ok(records.get(id).stages[`service.${stage}`] >= 0, stage);
      }
    } else assert.equal(records.size, 0);
    assert.doesNotMatch(logs.join("\n"), /private|secret|token=/);
  }
});
