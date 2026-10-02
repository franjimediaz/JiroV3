import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { median, serviceSettings, countChromiumPages } from "./pdf-layout-benchmark.mjs";

test("layout benchmark computes even/odd medians without changing samples", () => {
  const values = [90, 10, 50, 30];
  assert.equal(median(values), 40);
  assert.deepEqual(values, [90, 10, 50, 30]);
  assert.equal(median([90, 10, 50]), 50);
  assert.equal(median([]), null);
});

test("layout benchmark reads actual service options and retains its allowlist", () => {
  const settings = serviceSettings(readFileSync("pdf-service/server.js", "utf8"), { PDF_ALLOWED_RESOURCE_HOSTS: "images.example" });
  assert.deepEqual(JSON.parse(JSON.stringify(settings.pdf)), { format: "A4", printBackground: true,
    preferCSSPageSize: true, margin: { top: "24px", right: "24px", bottom: "24px", left: "24px" } });
  assert.equal(settings.launch.headless, true);
  assert.equal(settings.launch.args.length, 0);
  assert.equal(settings.allowed("https://images.example/private?token=secret"), true);
  for (const url of ["https://other.example/image", "http://images.example/image", "http://localhost/image", "file:///private/image"]) {
    assert.equal(settings.allowed(url), false);
  }
});

test("Chromium page counting excludes the Pages tree and reports unknown rather than zero", () => {
  assert.equal(countChromiumPages(Buffer.from("/Type /Pages /Count 2 /Type /Page /Type /Page")), 2);
  assert.equal(countChromiumPages(Buffer.from("unrecognized")), null);
});
