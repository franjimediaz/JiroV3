import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const stageNames = {
  web: new Set(["total", "templateQuery", "resolvePdfContext", "renderTemplateToHtml", "pdfService", "pdfLocal"]),
  service: new Set(["total", "responseReady", "browser", "context", "page", "setContent", "renderDelay", "images", "page.pdf", "page.close", "context.close", "browser.release", "cleanup"]),
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function statistics(values) {
  const sorted = values.filter(v => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const percentile = p => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return { count: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p50: percentile(0.5), p95: percentile(0.95) };
}

// Only known timing fields survive parsing; raw log contents never enter the report.
export function parseStageLogs(text) {
  const records = new Map();
  for (const line of text.split(/\r?\n/)) {
    const marker = line.indexOf("[pdf-benchmark] ");
    if (marker < 0) continue;
    let value;
    try { value = JSON.parse(line.slice(marker + "[pdf-benchmark] ".length)); } catch { continue; }
    if (!value || !uuid.test(value.id) || !Object.hasOwn(stageNames, value.scope)) continue;
    let record = records.get(value.id);
    if (!record) { record = { stages: {}, browser: "unknown", duplicates: [] }; records.set(value.id, record); }
    if (value.scope === "service" && ["created", "reused"].includes(value.browser)) record.browser = value.browser;
    if (!stageNames[value.scope].has(value.stage) || !Number.isFinite(value.ms) || value.ms < 0) continue;
    const key = `${value.scope}.${value.stage}`;
    if (Object.hasOwn(record.stages, key)) { record.duplicates.push(key); continue; }
    record.stages[key] = value.ms;
  }
  return records;
}

export function summarize(report, logs = "") {
  const records = parseStageLogs(logs);
  const samples = report.samples.map(sample => {
    const record = records.get(sample.id);
    const stages = record?.stages || {};
    // This residual includes transport, proxy queueing and startup, NOT pure network RTT.
    const residual = stages["web.pdfService"] - stages["service.responseReady"];
    return { ...sample, stages, browser: record?.browser || "unknown",
      duplicateStages: record?.duplicates || [],
      serviceRoundTripResidualMs: Number.isFinite(residual) ? residual : null };
  });
  const successful = samples.filter(s => s.ok);
  const following = samples.slice(1).filter(s => s.ok);
  const perStage = {};
  for (const [scope, names] of Object.entries(stageNames)) {
    for (const name of names) {
      const key = `${scope}.${name}`;
      perStage[key] = { all: statistics(successful.map(s => s.stages[key])),
        following: statistics(following.map(s => s.stages[key])) };
    }
  }
  return { ...report, samples, summary: {
    first: samples[0] || null, // First observed request is not proof of a platform cold start.
    allMs: statistics(successful.map(s => s.elapsedMs)),
    followingMs: statistics(following.map(s => s.elapsedMs)),
    confirmedBrowserReusedMs: statistics(following.filter(s => s.browser === "reused").map(s => s.elapsedMs)),
    perStage,
  } };
}

export async function runBenchmark({ url, headers = {}, runs = 6, intervalMs = 2500,
  fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const target = new URL(url);
  if (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname))) throw new Error("invalid target");
  if (target.username || target.password || target.pathname !== "/api/pdf/generate" || !target.searchParams.get("template") || !target.searchParams.get("id")) throw new Error("invalid PDF endpoint");
  if (!Number.isInteger(runs) || runs < 2 || runs > 20 || !Number.isFinite(intervalMs) || intervalMs < 2500) throw new Error("invalid benchmark limits");
  const samples = [];
  const startedAt = new Date().toISOString();
  for (let index = 0; index < runs; index++) {
    if (index) await sleep(intervalMs);
    const id = randomUUID();
    const started = performance.now();
    const sample = { id, index, ok: false, status: null, generator: "unknown", upstreamStatus: null };
    try {
      const requestHeaders = new Headers(headers);
      requestHeaders.set("x-pdf-benchmark-id", id);
      const response = await fetchImpl(target.href, { headers: requestHeaders, cache: "no-store",
        redirect: "error", signal: AbortSignal.timeout(120000) });
      sample.status = response.status;
      const generator = response.headers.get("x-pdf-generator");
      sample.generator = ["local", "service"].includes(generator) ? generator : "unknown";
      const upstream = response.headers.get("x-pdf-upstream-status");
      sample.upstreamStatus = /^\d{3}$/.test(upstream || "") ? Number(upstream) : null;
      const body = Buffer.from(await response.arrayBuffer());
      sample.ok = response.ok && (response.headers.get("content-type") || "").includes("application/pdf") && body.subarray(0, 5).toString() === "%PDF-";
      if (sample.ok) sample.bytes = body.length;
    } catch { /* Do not print exceptions containing endpoints or credentials. No retries. */ }
    sample.elapsedMs = performance.now() - started;
    samples.push(sample);
    if (!sample.ok) break; // Includes 429: never bypass rate limiting.
  }
  return summarize({ version: 1, fixtureHash: createHash("sha256").update(target.href).digest("hex"),
    startedAt, requestedRuns: runs, intervalMs, samples });
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  let report;
  if (mode === "run") {
    const headers = process.env.PDF_BENCHMARK_HEADERS_FILE
      ? JSON.parse(await readFile(process.env.PDF_BENCHMARK_HEADERS_FILE, "utf8")) : {};
    report = await runBenchmark({ url: process.env.PDF_BENCHMARK_URL, headers,
      runs: Number(process.env.PDF_BENCHMARK_RUNS || 6) });
  } else if (mode === "report" && args.length >= 2) {
    const input = JSON.parse(await readFile(args[0], "utf8"));
    const logs = (await Promise.all(args.slice(1).map(path => readFile(path, "utf8")))).join("\n");
    report = summarize(input, logs);
  } else throw new Error("invalid arguments");
  const json = JSON.stringify(report, null, 2) + "\n";
  if (process.env.PDF_BENCHMARK_OUTPUT) await writeFile(process.env.PDF_BENCHMARK_OUTPUT, json, { flag: "wx", mode: 0o600 });
  else process.stdout.write(json);
  if (report.samples.some(sample => !sample.ok)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("PDF benchmark failed; check arguments, environment, authentication and input/output files. Details suppressed to protect credentials.");
    process.exitCode = 1;
  });
}
