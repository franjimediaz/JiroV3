import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function loadPdfHelpers() {
  const source = readFileSync("packages/ui/src/pdf.ts", "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(() => ({}), module, module.exports);
  return module.exports;
}

test("generated PDFs are fetched as blobs and downloaded without opening a tab", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const clicks = [];
  let requestedUrl = "";

  globalThis.window = { location: { origin: "https://jiro.test" }, open: () => assert.fail("window.open must not be used") };
  globalThis.document = {
    body: { appendChild() {} },
    createElement: () => ({ style: {}, click() { clicks.push(this); }, remove() {} }),
  };
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(new Blob(["%PDF-test"], { type: "application/pdf" }), {
      headers: { "content-disposition": 'attachment; filename="invoice-42.pdf"' },
    });
  };
  URL.createObjectURL = () => "blob:pdf";
  URL.revokeObjectURL = () => {};

  try {
    await loadPdfHelpers().downloadPdf("invoice", "42");
    assert.match(requestedUrl, /\/api\/pdf\/generate\?/);
    assert.match(requestedUrl, /template=invoice/);
    assert.match(requestedUrl, /id=42/);
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0].href, "blob:pdf");
    assert.equal(clicks[0].download, "invoice-42.pdf");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});

test("PDF generation defaults to attachment and form actions use the blob downloader", () => {
  const route = readFileSync("apps/web/app/api/pdf/generate/route.ts", "utf8");
  const actions = readFileSync("packages/ui/src/ModuloForm/FormActionsBar.tsx", "utf8");
  assert.match(route, /"content-disposition": `attachment; filename="\$\{filename\}"`/);
  assert.match(route, /body = await htmlToPdfBuffer\(html\)/);
  assert.match(route, /"x-pdf-generator": "local"/);
  assert.doesNotMatch(route, /PDF_SERVICE_URL|PDF_SERVICE_SECRET|pdfService/);
  assert.doesNotMatch(route, /shouldDownload/);
  assert.match(actions, /await downloadPdf\(template, recordId, endpoint, params\)/);
  assert.doesNotMatch(actions, /openPdfInNewTab|openPdfInSameTab|window\.open/);
});
