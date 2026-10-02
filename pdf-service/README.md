# PDF resource configuration

Set this environment variable on the **pdf-service process in production** (Render), then restart/redeploy that service:

```env
PDF_ALLOWED_RESOURCE_HOSTS=xflhljlfgzqczydrfwws.supabase.co
```

Use exact hostnames only, without https://, paths or wildcards. Preserve any existing trusted hosts, separated by commas. Setting this only on the Next.js app does not configure the separate PDF service.

Storage images must use absolute HTTPS URLs. Private objects need a valid signed URL; the service does not inherit the user's browser cookies. Do not add private addresses or disable SSRF checks. A missing allowlist denies all external images.

The service logs blocked hosts and failed image hosts without paths or signed query strings. PDF_TIMING_LOGS=1 also measures image decoding. Image readiness remains bounded by the existing PDF job timeout.

Run the real deployed-service image regression with PDF_IMAGE_TEST_SERVICE_URL, PDF_IMAGE_TEST_SERVICE_SECRET and PDF_IMAGE_TEST_URL (an accessible PNG URL):

```sh
node --test --test-isolation=none scripts/pdf-images.test.mjs
```

The integration test checks that the PDF embeds the PNG's actual dimensions, not Chromium's broken-image icon. It is skipped when these test variables are absent.

## Reproducible end-to-end benchmark

Enable `PDF_TIMING_LOGS=1` on **both Vercel and Render**. Deploy the timing
instrumentation before collecting the baseline; keep it enabled for the after run.
No authentication, rate-limit, allowlist or browser-isolation settings need to change.

Choose one representative template/record and keep its data, images and deployment
configuration unchanged. Store the authenticated request headers as a JSON object
in a private file **outside the repository**. Do not paste credentials in commands,
commit that file, or publish raw platform logs.

Set these variables locally (not in the deployments):

- `PDF_BENCHMARK_URL`: full authenticated `/api/pdf/generate?template=...&id=...` endpoint.
- `PDF_BENCHMARK_HEADERS_FILE`: private JSON file containing the existing user's request headers.
- `PDF_BENCHMARK_OUTPUT`: new JSON output file, preferably outside the repository.
- `PDF_BENCHMARK_RUNS`: optional, default 6, range 2–20.

```sh
node scripts/pdf-benchmark.mjs run
```

The script makes sequential requests to the exact same URL, spaced by at least
2.5 seconds, validates the PDF signature and records client elapsed time and the
actual generator/upstream status. It stops at the first failed request, including
429, without retries. It never follows redirects with authentication headers.
It prints no URL, cookie, response body or arbitrary error message.

Export text logs from both platforms covering the run, including cleanup after
the last response. Each request carries a random `x-pdf-benchmark-id`; Vercel
forwards it to Render. Only UUID v4 values are accepted for timing correlation.
Join the exports with the original report (use a **new** `PDF_BENCHMARK_OUTPUT`):

```sh
node scripts/pdf-benchmark.mjs report before.json vercel.txt render.txt
```

The joined report contains each request's stages, first observed generation,
following generations, mean, nearest-rank p50/p95, and confirmed browser-reuse
statistics. Missing stages are `null`, not zero. Duplicate stage records are
flagged; use non-overlapping log exports. Only known stage names and numeric
durations are extracted from the logs.

Repeat identically after an evidence-based optimization. Compare following-request
means and percentiles with the same generator and verified browser reuse; compute
improvement as `(before - after) / before * 100`. Six requests are a quick check;
use 20 and repeated runs for a more stable p95 while respecting rate limits.

Interpretation:

- The first observation is **not automatically a cold start**. Confirm Render
  process startup from platform events; browser creation alone can also mean recycling.
- `web.total` measures the API handler, while client elapsed also includes client
  transport. `web.pdfService` covers Vercel's remote fetch and body consumption.
- `service.setContent` includes resource loading up to the load event;
  `service.images` measures the subsequent decode wait. Do not add image-load time
  again to `setContent`.
- Context/page creation, the existing 50 ms delay, printing, page/context close,
  browser release and aggregate cleanup are measured separately. Aggregate stages
  overlap their children and must not be summed with them.
- The response is sent **before cleanup**. `service.responseReady` excludes cleanup;
  `service.total` includes it. This behavior is unchanged.
- `serviceRoundTripResidualMs` is `web.pdfService - service.responseReady`:
  transport, proxy queueing and possibly startup; it is **not pure Vercel–Render RTT**.
- A local generator with a `web.pdfService` stage proves a remote attempt followed
  by fallback. Stage totals alone do not prove N+1 queries or cache behavior.
- PDF sizes are recorded, not used as visual equivalence proof. Compare rendered
  pages separately before accepting an optimization; dynamic dates can change bytes.
