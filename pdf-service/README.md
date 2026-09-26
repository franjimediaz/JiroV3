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
