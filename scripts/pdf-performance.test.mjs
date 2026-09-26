import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function loadBrowserPool(maxJobs, launch) {
  const source = readFileSync("pdf-service/server.js", "utf8");
  const pool = source.slice(source.indexOf("let activeJobs"), source.indexOf("function buildLaunchOptions"));
  const sandbox = { process: { env: { PDF_BROWSER_MAX_JOBS: String(maxJobs) } }, launchBrowser: launch };
  vm.createContext(sandbox);
  vm.runInContext(pool + "\nglobalThis.pool = { acquireBrowser, releaseBrowser, retireBrowser };", sandbox);
  return sandbox.pool;
}

function fakeBrowser() {
  let disconnected;
  return {
    connected: true, closes: 0,
    on(event, callback) { disconnected = callback; },
    isConnected() { return this.connected; },
    async close() { this.closes++; this.connected = false; disconnected?.(); },
    disconnect() { this.connected = false; disconnected?.(); },
  };
}

test("PDF browser shares launch, isolates recycling from active jobs and reconnects", async () => {
  const browsers = [];
  const pool = loadBrowserPool(2, async () => { const b = fakeBrowser(); browsers.push(b); return b; });
  const [first, second] = await Promise.all([pool.acquireBrowser(), pool.acquireBrowser()]);
  assert.equal(browsers.length, 1);
  assert.equal(first, second);
  await pool.releaseBrowser(first);
  assert.equal(browsers[0].closes, 0);
  const third = await pool.acquireBrowser();
  assert.equal(browsers.length, 2);
  await pool.releaseBrowser(second);
  assert.equal(browsers[0].closes, 1);
  assert.equal(browsers[1].closes, 0);
  browsers[1].disconnect();
  const fourth = await pool.acquireBrowser();
  assert.equal(browsers.length, 3);
  await pool.releaseBrowser(third);
  await pool.releaseBrowser(fourth);
});

test("PDF browser recovers from launch failure and supports disabled recycling", async () => {
  let launches = 0;
  const pool = loadBrowserPool(0, async () => {
    if (++launches === 1) throw new Error("launch failed");
    return fakeBrowser();
  });
  await assert.rejects(pool.acquireBrowser(), /launch failed/);
  const first = await pool.acquireBrowser();
  await pool.releaseBrowser(first);
  const second = await pool.acquireBrowser();
  assert.equal(first, second);
  await pool.releaseBrowser(second);
  assert.equal(launches, 2);
  assert.equal(first.browser.closes, 0);
});

test("PDF datasets query in parallel and retain filters, aggregation and duplicate ID order", async () => {
  const source = readFileSync("apps/web/lib/pdf/resolvePdfDatasets.ts", "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { resolvePdfDatasets } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
  const pending = [];
  const filters = [];
  const supabase = { from(table) {
    return { select() { return this; }, eq(...args) { filters.push([table, ...args]); return this; },
      then(resolve) { pending.push({ table, resolve }); } };
  } };
  const resultPromise = resolvePdfDatasets({ supabase, ctx: { record: { owner: 7 }, related: { items: [{ n: 3 }, { n: 1 }] } }, template: { datasets: [
    { id: "same", source: "table", table: "first", filters: [{ field: "owner", valueFromPath: "record.owner" }] },
    { id: "same", source: "table", table: "second" },
    { id: "related", source: "related", relatedKey: "items", filters: [{ field: "n", op: "gt", value: 1 }], aggregates: [{ op: "sum", field: "n", as: "total" }] },
    { source: "table", table: "ignored" },
  ] } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 2);
  pending[1].resolve({ data: [{ n: 2 }] });
  pending[0].resolve({ data: [{ n: 1 }] });
  const result = await resultPromise;
  assert.deepEqual(Object.keys(result), ["same", "related"]);
  assert.deepEqual(filters, [["first", "owner", 7]]);
  assert.deepEqual(result.same.rows, [{ n: 2 }]);
  assert.equal(result.related.summary.total, 3);
  assert.equal(result.related.count, 1);
});

test("PDF request closes its page and context after success or rendering failure", async () => {
  const source = readFileSync("pdf-service/server.js", "utf8");
  for (const fail of [false, true]) {
    const closed = [];
    let handler;
    const context = {
      async route() {},
      async newPage() { return {
        async setContent() { if (fail) throw new Error("render failed"); },
        async waitForTimeout() {}, async pdf() { return Buffer.from("pdf"); },
        async close() { closed.push("page"); },
      }; },
      async close() { closed.push("context"); },
    };
    const sandbox = {
      app: { post(_path, callback) { handler = callback; } },
      activeJobs: 0, MAX_CONCURRENT_JOBS: 2, MAX_HTML_BYTES: 750000, JOB_TIMEOUT_MS: 30000,
      timingSafeBearer: () => true,
      acquireBrowser: async () => ({ browser: { async newContext(options) { assert.equal(options.javaScriptEnabled, false); return context; } } }),
      releaseBrowser: async () => { closed.push("release"); },
      withTimeout: async (work) => work(),
      timePdfStage: async (_label, work) => work(), performance, retireBrowser() {},
      waitForPdfImages: async () => {},
      sanitizeDisposition: () => "inline", sanitizeFilename: () => "test.pdf",
      process: { env: {} }, Buffer, console: { error() {} }, playwrightVersion: "test",
    };
    vm.createContext(sandbox);
    vm.runInContext(source.slice(source.indexOf('app.post("/generate"'), source.indexOf('const port =')), sandbox);
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, send() { return this; }, json() { return this; } };
    await handler({ headers: {}, body: { html: "<p>test</p>" } }, response);
    assert.equal(response.code, fail ? 500 : 200);
    assert.deepEqual(closed, ["page", "context", "release"]);
    assert.equal(sandbox.activeJobs, 0);
  }
});

test("retiring a failed PDF browser does not close concurrent jobs or replace a newer browser", async () => {
  const browsers = [];
  const pool = loadBrowserPool(0, async () => { const browser = fakeBrowser(); browsers.push(browser); return browser; });
  const first = await pool.acquireBrowser();
  const concurrent = await pool.acquireBrowser();
  pool.retireBrowser(first);
  await pool.releaseBrowser(first);
  assert.equal(first.browser.closes, 0);
  const replacement = await pool.acquireBrowser();
  pool.retireBrowser(concurrent);
  await pool.releaseBrowser(concurrent);
  assert.equal(first.browser.closes, 1);
  const reused = await pool.acquireBrowser();
  assert.equal(replacement, reused);
  assert.equal(browsers.length, 2);
  await pool.releaseBrowser(replacement);
  await pool.releaseBrowser(reused);
});

test("service stage timings are opt-in and include failed operations", async () => {
  const source = readFileSync("pdf-service/server.js", "utf8");
  const messages = [];
  const sandbox = { performance, process: { env: {} }, console: { info: (message) => messages.push(message) } };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf("async function timePdfStage"), source.indexOf("async function withTimeout")), sandbox);
  assert.equal(await sandbox.timePdfStage("browser", async () => 7), 7);
  assert.deepEqual(messages, []);
  sandbox.process.env.PDF_TIMING_LOGS = "1";
  await assert.rejects(sandbox.timePdfStage("page.pdf", async () => { throw new Error("failed"); }), /failed/);
  assert.match(messages[0], /\[pdf-service\] page\.pdf: \d+ms/);
});

test("context loads independent record and related labels concurrently with unchanged data", async () => {
  const pending = [];
  const calls = [];
  const supabase = { from(table) {
    const query = { table, columns: "*", filters: [], single: false,
      select(columns) { this.columns = columns; return this; },
      eq(field, value) { this.filters.push([field, value]); return this; },
      in(field, value) { this.filters.push([field, value]); return this; },
      limit() { return this; },
      maybeSingle() { this.single = true; return this; },
      then(resolve) {
        calls.push([table, this.columns, this.filters]);
        if (table === "owners" || table === "states") { pending.push({ table, resolve }); return; }
        const data = table === "projects" ? { id: "p1", ownerId: "u1" }
          : table === "items" ? [{ id: "i1", projectId: "p1", stateId: "s1" }]
          : table === "branding" ? { nombre: "Company" }
          : this.single ? { props: { fields: [] } }
          : [{ slug: "projects", props: { fields: [] } }, { slug: "items", props: { fields: [] } }];
        resolve({ data, error: null });
      },
    };
    return query;
  } };
  const source = readFileSync("apps/web/lib/pdf/resolvePdfContext.ts", "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, process, console, require(name) {
    if (name === "@/lib/supabase/server") return { createClient: async () => supabase };
    if (name === "./resolvePdfDatasets") return { resolvePdfDatasets: async () => ({}) };
    throw new Error(name);
  } };
  vm.createContext(sandbox);
  vm.runInContext(output, sandbox);
  const resultPromise = sandbox.exports.resolvePdfContext({ sourceTable: "projects", recordId: "p1",
    related: [{ key: "items", table: "items", fkField: "projectId" }],
    labelResolvers: [
      { in: "record", field: "ownerId", refTable: "owners", refLabelField: "name" },
      { in: "related", relatedKey: "items", field: "stateId", refTable: "states", refLabelField: "name" },
    ],
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(pending.map(({ table }) => table).sort(), ["owners", "states"]);
  pending.find(({ table }) => table === "states").resolve({ data: [{ id: "s1", name: "Ready" }] });
  pending.find(({ table }) => table === "owners").resolve({ data: [{ id: "u1", name: "Owner" }] });
  const ctx = await resultPromise;
  assert.equal(ctx.record.ownerId__label, "Owner");
  assert.equal(ctx.py.ownerId__label, "Owner");
  assert.equal(ctx.related.items[0].stateId__label, "Ready");
  assert.equal(ctx.branding.nombre, "Company");
  assert.equal(calls.filter(([table]) => table === "owners").length, 1);
  assert.equal(calls.filter(([table]) => table === "states").length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find(([table]) => table === "owners")[2])), [["id", ["u1"]]]);
});
