import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = (path) => readFileSync(join(root, path), "utf8");

describe("security hardening regression checks", () => {
  it("validates configurable permission env vars instead of treating them as authorization bypasses", () => {
    const permissions = source("apps/web/lib/auth/requirePermission.ts");
    const upload = source("apps/web/app/api/upload/route.ts");
    const uploadUrl = source("apps/web/app/api/upload-url/route.ts");

    assert.match(permissions, /CONFIGURABLE_PERMISSION_PATTERN/);
    assert.match(permissions, /process\.env\[envName\]\?\.trim\(\)/);
    assert.match(permissions, /return CONFIGURABLE_PERMISSION_PATTERN\.test\(value\) \? value : fallback/);
    assert.match(uploadUrl, /configuredPermission\("FILES_READ_PERMISSION", "files\.read"\)/);
    assert.doesNotMatch(uploadUrl, /process\.env\.FILES_READ_PERMISSION\s*\|\|/);
  });

  it("keeps upload storage decisions server-owned and validates file content", () => {
    const upload = source("apps/web/app/api/upload/route.ts");
    const validation = source("apps/web/lib/validation/upload.ts");
    const storagePath = source("apps/web/lib/security/safeStoragePath.ts");
    const uploadClient = source("packages/ui/src/components/fields/fileUploadUtils.ts");
    const fieldInput = source("packages/ui/src/components/fields/FieldInput.tsx");
    const form = source("packages/ui/src/Form.tsx");

    assert.match(upload, /if \(!moduleSlug\) throw badRequest\("moduleSlug es requerido"\)/);
    assert.match(upload, /requireModulePermission\(moduleSlug,\s*uploadAction\)/);
    assert.match(upload, /recordId \? "actualizar" : "crear"/);
    assert.doesNotMatch(upload, /requirePermission\(permission\("create"\)\)/);
    assert.match(upload, /formData\.has\("bucket"\)/);
    assert.match(upload, /formData\.has\("folder"\)/);
    assert.match(upload, /formData\.has\("allowedMimeTypes"\)/);
    assert.match(upload, /buildServerStoragePath/);
    assert.match(validation, /detectMimeFromMagicBytes/);
    assert.match(validation, /file\.type && file\.type !== detectedMime/);
    assert.match(storagePath, /sanitizePathSegment\(args\.userId\)/);
    assert.match(storagePath, /return path\.split\("\/"\)\.includes\(userId\)/);
    assert.match(uploadClient, /extractApiErrorMessage/);
    assert.match(uploadClient, /formData\.append\("moduleSlug"/);
    assert.match(uploadClient, /formData\.append\("recordId"/);
    assert.match(fieldInput, /\{ moduleSlug, recordId, fieldName: field\.name \}/);
    assert.match(form, /moduleSlug=\{effectiveModuleSlug\}/);
    assert.match(form, /recordId=\{effectiveRecordId\}/);
    assert.doesNotMatch(uploadClient, /String\(data\?\.error/);
    assert.doesNotMatch(uploadClient, /formData\.append\("folder"/);
  });

  it("requires user-scoped signed-url and delete paths", () => {
    const upload = source("apps/web/app/api/upload/route.ts");
    const uploadUrl = source("apps/web/app/api/upload-url/route.ts");

    assert.match(upload, /allowedBuckets\(\)\.has\(bucket\)/);
    assert.match(upload, /!isPathInUserScope\(path, ctx\.user\.id\)/);
    assert.match(uploadUrl, /body\.bucket !== privateBucket\(\)/);
    assert.match(uploadUrl, /!isPathInUserScope\(body\.path, ctx\.user\.id\)/);
    assert.match(uploadUrl, /createSignedUrl\(body\.path, body\.expiresIn\)/);
  });

  it("fails visibly when production rate limiting has no external backend and returns 429 when limited", () => {
    const rateLimit = source("apps/web/lib/security/rateLimit.ts");
    const upload = source("apps/web/app/api/upload/route.ts");
    const workflows = source("apps/web/app/api/workflows/run/route.ts");

    assert.match(rateLimit, /NODE_ENV.*production/);
    assert.match(rateLimit, /RATE_LIMIT_REDIS_URL \|\| process\.env\.UPSTASH_REDIS_REST_URL/);
    assert.match(rateLimit, /ALLOW_IN_MEMORY_RATE_LIMIT !== "1"/);
    assert.match(rateLimit, /throw new Error\("Rate limiting storage is not configured"\)/);
    assert.match(rateLimit, /throw rateLimited/);
    assert.match(upload, /enforceRateLimit\(\{ key: `upload:\$\{ip\}`/);
    assert.match(upload, /enforceRateLimit\(\{ key: `upload:\$\{ctx\.user\.id\}`/);
    assert.match(workflows, /enforceRateLimit\(\{ key: `workflow:\$\{ip\}`/);
    assert.match(workflows, /Idempotency-Key/);
  });

  it("returns sanitized API errors with request ids and redacted logs", () => {
    const handler = source("apps/web/lib/auth/handleApiError.ts");

    assert.match(handler, /requestId/);
    assert.match(handler, /safeMessage/);
    assert.match(handler, /Retry-After/);
    assert.match(handler, /REDACT_PATTERNS/);
    assert.match(handler, /authorization/);
    assert.match(handler, /cookie/);
    assert.match(handler, /service_role/);
    assert.doesNotMatch(handler, /errorStack/);
  });

  it("aligns module read authorization with Spanish role permissions and 401/403 semantics", () => {
    const permissions = source("apps/web/lib/auth/requirePermission.ts");
    const modulePermission = source("apps/web/lib/auth/requireModulePermission.ts");
    const currentUser = source("apps/web/lib/auth/getCurrentUser.ts");
    const listRoute = source("apps/web/app/api/list/route.ts");
    const dpListRoute = source("apps/web/app/api/dp/list/route.ts");
    const proxy = source("apps/web/proxy.ts");

    assert.match(permissions, /ACTION_PERMISSION_MAP/);
    assert.match(permissions, /read:\s*"ver"/);
    assert.match(permissions, /create:\s*"crear"/);
    assert.match(permissions, /update:\s*"actualizar"/);
    assert.match(permissions, /delete:\s*"eliminar"/);
    assert.match(permissions, /normalizePermissionAction\(actionRaw\)/);
    assert.match(permissions, /modulePerms\["\*"\] === true \|\| modulePerms\[action\] === true/);
    assert.match(permissions, /rpc\("can"/);
    assert.match(permissions, /modulo:\s*moduleName/);
    assert.match(permissions, /accion:\s*action/);
    assert.match(permissions, /permissionMatched = await canByDatabasePolicy/);
    assert.match(modulePermission, /normalizePermissionAction\(action\)/);

    assert.match(listRoute, /requireModulePermission\(moduleSlug,\s*"ver"\)/);
    assert.match(listRoute, /handleApiError\(error,\s*requestId,\s*\{ route: "\/api\/list"/);
    assert.doesNotMatch(listRoute, /catch \(error[\s\S]*status:\s*500[\s\S]*\)/);

    assert.match(dpListRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"ver"\)/);
    assert.match(dpListRoute, /handleApiError\(error,\s*requestId,\s*\{ route: "\/api\/dp\/list"/);

    assert.match(permissions, /requireUser\(\)/);
    assert.match(currentUser, /throw unauthorized\(\)/);
    assert.match(permissions, /throw forbidden\(\)/);
    assert.match(currentUser, /\.select\("uid, email, role_id, role"\)/);
    assert.doesNotMatch(currentUser, /\.select\("id, uid, email, role_id, role"\)/);
    assert.match(currentUser, /\.eq\("uid", user\.id\)/);
    assert.match(currentUser, /if \(profile\.role_id\)/);
    assert.match(currentUser, /\.from\("rol"\)/);
    assert.match(currentUser, /\.eq\("id", profile\.role_id\)/);
    assert.doesNotMatch(currentUser, /\.eq\("slug", profile\.role\)/);
    assert.match(proxy, /isApiPath\(pathname\)/);
    assert.match(proxy, /NextResponse\.json\(/);
    assert.match(proxy, /status:\s*401/);
  });

  it("keeps PDF generation isolated behind auth, resource allowlists, size limits, and concurrency limits", () => {
    const pdfService = source("pdf-service/server.js");
    const pdfRoute = source("apps/web/app/api/pdf/generate/route.ts");

    assert.match(pdfService, /timingSafeEqual/);
    assert.match(pdfService, /PDF_ALLOWED_RESOURCE_HOSTS/);
    assert.match(pdfService, /MAX_HTML_BYTES/);
    assert.match(pdfService, /MAX_CONCURRENT_JOBS/);
    assert.match(pdfService, /isPrivateIp/);
    assert.match(pdfService, /\["https:"\]\.includes\(parsed\.protocol\)/);
    assert.match(pdfService, /javaScriptEnabled: process\.env\.PDF_ENABLE_JAVASCRIPT === "1"/);
    assert.match(pdfRoute, /PDF_SERVICE_SECRET/);
    assert.match(pdfRoute, /requireModulePermission\("pdf_templates", "exportar"\)/);
    assert.match(pdfRoute, /enforceRateLimit/);
  });

  it("documents and migrates audit events as append-only server-side evidence", () => {
    const writer = source("apps/web/lib/audit/writeAuditEvent.ts");
    const migration = source("supabase/migrations/202607270001_create_audit_events.sql");
    const docs = source("docs/security/security-audit-remediation.md");

    assert.match(writer, /supabaseAdmin/);
    assert.match(writer, /audit_events/);
    assert.match(writer, /sanitizeAuditMetadata/);
    assert.match(writer, /SENSITIVE_KEY_PATTERN/);
    assert.match(writer, /module: args\.module \?\? inferModule\(args\.action\)/);
    assert.match(migration, /enable row level security/i);
    assert.match(migration, /module text null/);
    assert.match(migration, /request_id text not null/);
    assert.match(migration, /revoke all on public\.audit_events from anon/);
    assert.match(migration, /revoke all on public\.audit_events from authenticated/);
    assert.match(migration, /grant select, insert on public\.audit_events to service_role/);
    assert.doesNotMatch(migration, /using \(true\)/i);
    assert.doesNotMatch(migration, /with check \(true\)/i);
    assert.match(docs, /audit_events/);
    assert.match(docs, /metadata table/i);
  });
});
