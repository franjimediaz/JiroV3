# Controlled PDF layout benchmark

This script does not start or modify the production service. It uses the PDF
service's installed Playwright, reads its Chromium launch/PDF options and resource
policy directly from `server.js`, and preserves per-document context isolation,
JavaScript configuration, `waitUntil: load`, the 50 ms delay and image decoding.
It does not weaken the allowlist or cache resources between contexts.

Supply a private JSON manifest outside the repository:

```json
{"B":"layout-no-images.html","C":"layout-with-images.html","D":"full-real-document.html"}
```

A is generated automatically (plain text). B/C must be the same representative
section of the **real template**, with the same CSS, text and layout. In B replace
image elements with empty boxes retaining their measured printed dimensions;
remove image resource references in CSS as well. Keep fonts and other resources
identical. C restores the original images; D is the full unmodified HTML sent to
the service. If C is already the complete document, explicitly use the same file
for C and D; do not interpret that duplicate as a separate intervention.

Do not reconstruct HTML from the final PDF or substitute synthetic content for
the real template: neither can establish the cause of the production timings.
Signed resources must still be valid and their exact hosts allowlisted. Keep the
manifest/HTML private; reports contain hashes, counts and dimensions, not URLs.

Use `PDF_ALLOWED_RESOURCE_HOSTS`, `PDF_ENABLE_JAVASCRIPT` and any launch settings
matching the deployment. Variables are read from the current process, not loaded
automatically from `.env`. Install the matching Playwright Chromium beforehand.

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.turbo/pdf-browsers'
pnpm exec playwright install chromium --only-shell
node scripts/pdf-layout-benchmark.mjs C:/private/manifest.json .turbo/layout-baseline.json
```

Without a real HTML capture, only the minimum control can be measured:

```powershell
node scripts/pdf-layout-benchmark.mjs --minimal .turbo/layout-minimal.json
```

Default: one excluded warmup per case, followed by seven measured iterations per
case, rotating their order. Set `PDF_LAYOUT_ITERATIONS` to 3–30 to change that.
The browser is reused, with fresh contexts/pages exactly as in the service. Output
files are never overwritten. The report includes all samples and median times for
context, newPage, setContent, delay, decode, page.pdf, cleanup and total; HTML/PDF
bytes, image/DOM counts and page count. Page counting uses Chromium's uncompressed
`/Type /Page` dictionaries; unknown formats return null instead of a false count.

Print-style inspection runs **after** PDF generation and is excluded from rendering
totals. It counts shadows, filters, opacity, backgrounds, SVG nodes, table rows,
page breaks, hidden nodes, scripts, styles and font families. It reports source
image dimensions versus printed CSS dimensions (CSS px, not printer pixels).
Resource Timing byte counts may be zero without cross-origin timing permission;
zero does not prove a cache hit. Blocked/failed resource counts and broken-image
dimensions invalidate a comparison intended to preserve the document.

Use B→C to evaluate images and C→D to evaluate document scale; A→B mixes several
layout/CSS factors and does not identify an individual CSS property. To isolate
one factor, prepare another private manifest changing only that factor, record
page counts/box dimensions and repeat. Removal of shadows, filters or backgrounds
is a diagnostic intervention, not a visually equivalent production optimization.
Do not apply a change until repeated timings and rendered-page comparison support
it. Same Playwright version on Windows versus Linux does not imply equivalent CPU,
fonts, network, Chromium platform binary or deployment conditions.
