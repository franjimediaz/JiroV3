import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(resolve("apps/web/package.json"));
function loader(overrides = {}) {
  const cache = new Map();
  return function load(file) {
    const path = resolve(file);
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    }}).outputText;
    new Function("require", "module", "exports", "process", code)((id) => {
      if (id in overrides) return overrides[id];
      if (id.startsWith(".") || id.startsWith("@/")) {
        const base = id.startsWith("@/") ? resolve("apps/web", id.slice(2)) : resolve(dirname(path), id);
        for (const suffix of [".ts", ".tsx"]) if (existsSync(base + suffix)) return load(base + suffix);
      }
      return require(id);
    }, module, module.exports, process);
    return module.exports;
  };
}

const fixtures = [
  ["image/png", "background.png", [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]],
  ["image/jpeg", "background.jpg", [0xff,0xd8,0xff,0x00]],
  ["image/webp", "background.webp", [0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]],
];

function routeFixture() {
  const calls = { buckets: [], uploads: [], urls: [] };
  const storage = { from(bucket) { return {
    async upload(path, buffer, options) { calls.uploads.push({ bucket, path, buffer, options }); return { error: null }; },
    getPublicUrl(path) {
      calls.urls.push({ bucket, path });
      return { data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/${bucket}/${path}` } };
    },
  }; } };
  storage.getBucket = async bucket => { calls.buckets.push(bucket); return { data: { id: bucket, public: bucket === "crm-public" }, error: null }; };
  const route = loader({
    "@/lib/supabase/admin": { supabaseAdmin: { storage } },
    "@/lib/auth/requirePermission": { configuredPermission: () => "files.delete", requirePermission: async () => ({ user: { id: "user-1" } }) },
    "@/lib/auth/requireModulePermission": { requireModulePermission: async () => ({ user: { id: "user-1" } }) },
    "@/lib/auth/handleApiError": { handleApiError: error => Response.json({ error: error.message }, { status: error.status || 500 }) },
    "@/lib/audit/writeAuditEvent": { writeAuditEvent: async () => {} },
    "@/lib/audit/shouldAuditEvent": { shouldAuditEvent: () => false },
    "@/lib/modules/resolveModuleConfig": { resolveModuleConfig: async () => ({ schema: {} }) },
    "@/lib/security/rateLimit": { getClientIp: () => "127.0.0.1", enforceRateLimit: async () => {} },
    "@/lib/security/requestId": { getRequestId: () => "request-1" },
    "@/lib/security/safeStoragePath": {
      buildServerStoragePath: ({ fileName }) => `user-1/plans/general/${fileName}`,
      isPathInUserScope: () => true,
    },
  })("apps/web/app/api/upload/route.ts");
  return { route, calls };
}

async function post(route, kind, mime, name, bytes) {
  const body = new FormData();
  body.append("kind", kind);
  body.append("moduleSlug", "plans");
  body.append("file", new File([Uint8Array.from(bytes)], name, { type: mime }));
  return route.POST(new Request("http://localhost/api/upload", { method: "POST", body }));
}

for (const [mime, name, bytes] of fixtures) test(`${mime} upload returns a usable public Storage URL`, async () => {
  const { route, calls } = routeFixture();
  const response = await post(route, "image", mime, name, bytes);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.isPublic, true);
  assert.equal(new URL(result.url).protocol, "https:");
  assert.match(result.url, new RegExp(`/storage/v1/object/public/crm-public/.+/${name}$`));
  assert.equal(calls.urls.length, 1);
  assert.deepEqual(calls.buckets, ["crm-public"]);
  assert.equal(calls.uploads[0].options.contentType, mime);
});

test("private document upload does not return or generate a public URL", async () => {
  const { route, calls } = routeFixture();
  const response = await post(route, "document", "application/pdf", "document.pdf", [0x25,0x50,0x44,0x46,0x2d]);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.isPublic, false);
  assert.equal(Object.hasOwn(result, "url"), false);
  assert.equal(calls.urls.length, 0);
  assert.equal(calls.buckets.length, 0);
});

test("client fallback only builds URLs for explicitly public image responses", async () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  const originalFetch = globalThis.fetch;
  const responses = [];
  globalThis.fetch = async () => Response.json(responses.shift());
  try {
    const { uploadSingleFile } = loader()("packages/ui/src/components/fields/fileUploadUtils.ts");
    responses.push({ bucket: "crm-public", path: "user/fondo con espacio.png", isPublic: true });
    const image = await uploadSingleFile(new File([Uint8Array.from(fixtures[0][2])], "x.png", { type: "image/png" }), "image", "", [], "/api/upload", { moduleSlug: "plans" });
    assert.equal(image.url, "https://project.supabase.co/storage/v1/object/public/crm-public/user/fondo%20con%20espacio.png");
    responses.push({ bucket: "crm-private", path: "user/document.pdf", isPublic: false });
    const document = await uploadSingleFile(new File(["%PDF-"], "x.pdf", { type: "application/pdf" }), "file", "", [], "/api/upload", { moduleSlug: "plans" });
    assert.equal(document.url, null);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  }
});
