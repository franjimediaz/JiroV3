# One-shot diagnostic capture

No capture is enabled by default, including production. HTML is captured only
after the existing service authentication and size checks, unchanged, before
rendering. Capture failures do not fail PDF generation. Capture I/O affects the
single captured request: exclude that request from timing comparisons.

1. On your own computer create keys in a private directory outside the repository
   and outside OneDrive/shared folders:
   `node scripts/pdf-capture.mjs keys C:/private/pdf-diagnostic`
2. For a short diagnostic window configure the service:
   - `PDF_CAPTURE_MODE=diagnostic`
   - `PDF_CAPTURE_UNTIL`: absolute ISO timestamp no more than 15 minutes in the future
     when the service starts. The absolute deadline prevents rearming after restarts.
   - `PDF_CAPTURE_FILENAME`: exact filename sent by the web application. Use a
     fixed `t` parameter on `/api/pdf/generate` to make this predictable; the route
     builds `${template}-${id}-${t}.pdf`. Do not log the request URL.
   - `PDF_CAPTURE_OUTPUT`: absolute path in a **private temporary directory**, e.g.
     `/tmp/pdf-diagnostic.enc`. Never point this at a static/public directory.
   - `PDF_CAPTURE_PUBLIC_KEY`: contents of `public.pem`. **Never upload private.pem.**
3. Generate the matching real PDF once through the existing authenticated API.
   Retrieve the encrypted file through the authorized Render shell/file access
   before expiry. There is no new HTTP download endpoint or capture response.
4. Disable/remove the capture variables. The instance makes only one capture
   attempt. Exclusive file creation prevents overwrites; the encrypted file is
   deleted at expiry while the process is alive. If the process terminates first,
   remove the leftover encrypted file manually. Mode 0600 is used; Windows users
   must also use a private directory with appropriate inherited ACLs.
5. Locally decrypt:
   `node scripts/pdf-capture.mjs decrypt C:/private/pdf-diagnostic C:/private/pdf-diagnostic/capture.enc`
   This creates `real.html` without overwriting an existing file. Keep it private:
   it necessarily contains the exact data and signed URLs required to reproduce
   the real request. Delete plaintext and keys once diagnosis is complete.

The envelope uses AES-256-GCM and RSA-OAEP SHA-256. Only ciphertext is stored on
the service. No content, URLs, filenames, paths or raw errors are logged.
Configuration errors silently disable capture. Do not commit any capture or key.

## Controlled comparisons

```powershell
node scripts/pdf-layout-benchmark.mjs --real C:/private/pdf-diagnostic/real.html .turbo/real-local.json
```

This uses A minimal, B without images, C **byte-for-byte captured HTML**, a
C-normalized control, and separate D variants for shadows, element opacity,
gradients, backgrounds, inline SVG, font family, page breaks and layout. B replaces
images with boxes measured in print media, removes picture sources and SVG image
references and disables CSS background/list images. That transformation may still
affect layout: compare C-normalized and page counts; it is diagnostic only.

Treatments have deliberately narrow meanings: opacity does not remove alpha in
colors/assets; SVG suppression only covers inline SVG; fonts changes family but
does not promise removal of every declared/downloaded font. Background removal
overlaps gradients, and layout treatment changes many layout rules. Such runs
identify categories, not necessarily a single property. Styles with inline
`!important` or browser-specific behavior may resist overrides. No visual
equivalence is claimed for B/D: never deploy these treatments as optimizations.

CSS rule counts include nested readable CSSOM rules and report inaccessible
stylesheets separately. Each sample reports DOM size, image dimensions, page
count, HTML/PDF bytes and stage durations. Missing/expired images invalidate C.

For local vs Render, run the **same diagnostic script and captured HTML** in a
private diagnostic workspace on the Render instance, with the same Playwright,
launch options, environment and resource allowlist. The script imports its
Playwright via `pdf-service/package.json` and reads `pdf-service/server.js`; transfer
the script and its `pdf-layout-variants.mjs` dependency with that directory layout.
Decrypt only in that private workspace, and remove plaintext immediately after
the run. Never upload the private key: transfer plaintext only through an
authorized secure channel. This is a separate diagnostic browser process, not
a measurement of the existing HTTP service, proxy/network latency or cold starts.
Avoid simultaneous production traffic when comparing infrastructure capacity.

Compare matching `htmlSha256`, page counts, complete images and Chromium versions.
Run one excluded warmup and seven measured iterations per case (default) on each
host. Do not compare old Render full-document timings to local minimal timings.
Only accept a proposed production change after separate visual PDF comparison;
these diagnostic variants intentionally alter appearance and are not candidates
for direct deployment.
