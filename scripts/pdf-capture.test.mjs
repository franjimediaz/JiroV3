import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, privateDecrypt, createDecipheriv, constants } from "node:crypto";
import { createHtmlCapture } from "../pdf-service/capture-html.js";
import { appendDiagnosticCss } from "./pdf-layout-variants.mjs";

test("capture is opt-in, expiring, exact, encrypted and single-use under concurrency", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pdf-capture-test-"));
  try {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    let now = Date.now();
    const output = join(directory, "capture.enc");
    const env = { PDF_CAPTURE_MODE: "diagnostic", PDF_CAPTURE_UNTIL: new Date(now + 60000).toISOString(),
      PDF_CAPTURE_OUTPUT: output, PDF_CAPTURE_FILENAME: "fixture.pdf",
      PDF_CAPTURE_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }) };
    const html = '<!doctype html>\n<img src="https://private.example/object?token=SECRET">ñ';
    assert.equal(await createHtmlCapture({ ...env, PDF_CAPTURE_MODE: "" })(html, "fixture.pdf"), false);
    assert.equal(await createHtmlCapture({ ...env, PDF_CAPTURE_UNTIL: new Date(now + 3600000).toISOString() })(html, "fixture.pdf"), false);
    const expired = createHtmlCapture(env, () => now);
    const capture = createHtmlCapture(env, () => now);
    assert.equal(await capture(html, "other.pdf"), false);
    assert.deepEqual(await Promise.all([capture(html, "fixture.pdf"), capture("other", "fixture.pdf")]), [true, false]);
    const raw = await readFile(output, "utf8");
    assert.doesNotMatch(raw, /SECRET|private\.example|<img|token=/);
    const data = JSON.parse(raw);
    const key = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(data.key, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(data.iv, "base64"));
    decipher.setAuthTag(Buffer.from(data.tag, "base64"));
    assert.equal(Buffer.concat([decipher.update(Buffer.from(data.data, "base64")), decipher.final()]).toString("utf8"), html);
    assert.equal(await createHtmlCapture(env, () => now)("replacement", "fixture.pdf"), false);
    now += 60001;
    assert.equal(await expired(html, "fixture.pdf"), false);
    assert.equal(await readFile(output, "utf8"), raw);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("diagnostic CSS preserves original document bytes around the injected style", () => {
  const html = '<html><head></head><body><img src="https://example.test/a?token=SECRET"></body></html>';
  const result = appendDiagnosticCss(html, "*{box-shadow:none!important}");
  assert.equal(result.replace(/<style data-pdf-diagnostic>[\s\S]*?<\/style>/, ""), html);
});
