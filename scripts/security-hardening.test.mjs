import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = (path) => readFileSync(join(root, path), "utf8");
const countMatches = (text, pattern) => Array.from(text.matchAll(pattern)).length;

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
    const dpLabelsRoute = source("apps/web/app/api/dp/labels/route.ts");
    const createRoute = source("apps/web/app/api/create/route.ts");
    const updateRoute = source("apps/web/app/api/update/route.ts");
    const deleteRoute = source("apps/web/app/api/delete/route.ts");
    const aggregateRoute = source("apps/web/app/api/aggregate/route.ts");
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

    assert.match(dpLabelsRoute, /resolveModuleConfig\(moduleKey\)/);
    assert.match(dpLabelsRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"ver"\)/);
    assert.match(dpLabelsRoute, /handleApiError\(error,\s*requestId,\s*\{ route: "\/api\/dp\/labels"/);
    assert.doesNotMatch(dpLabelsRoute, /catch \(error[\s\S]*status:\s*500[\s\S]*\)/);
    assert.doesNotMatch(dpLabelsRoute, /supabaseAdmin|service_role/i);
    assert.doesNotMatch(dpLabelsRoute, /\.from\(table\)/);

    assert.match(createRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"crear"\)/);
    assert.match(createRoute, /handleApiError\(e,\s*requestId,\s*\{ route: "\/api\/create"/);
    assert.doesNotMatch(createRoute, /catch \(e[\s\S]*status:\s*500[\s\S]*\)/);

    assert.match(updateRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"actualizar"\)/);
    assert.match(updateRoute, /handleApiError\(e,\s*requestId,\s*\{ route: "\/api\/update"/);

    assert.match(deleteRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"eliminar"\)/);
    assert.match(deleteRoute, /handleApiError\(e,\s*requestId,\s*\{ route: "\/api\/delete"/);

    assert.match(aggregateRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"ver"\)/);
    assert.match(aggregateRoute, /handleApiError\(e,\s*requestId,\s*\{ route: "\/api\/aggregate"/);
    assert.doesNotMatch(aggregateRoute, /catch \(e[\s\S]*status:\s*500[\s\S]*\)/);

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

  it("keeps role authorization smoke contracts stable for generic APIs and relations", () => {
    const permissions = source("apps/web/lib/auth/requirePermission.ts");
    const upload = source("apps/web/app/api/upload/route.ts");
    const uploadUrl = source("apps/web/app/api/upload-url/route.ts");
    const listRoute = source("apps/web/app/api/list/route.ts");
    const dpListRoute = source("apps/web/app/api/dp/list/route.ts");
    const dpLabelsRoute = source("apps/web/app/api/dp/labels/route.ts");
    const createRoute = source("apps/web/app/api/create/route.ts");
    const updateRoute = source("apps/web/app/api/update/route.ts");
    const deleteRoute = source("apps/web/app/api/delete/route.ts");
    const aggregateRoute = source("apps/web/app/api/aggregate/route.ts");
    const relationDisplay = source("packages/ui/src/utils/relationDisplay.tsx");
    const currentUser = source("apps/web/lib/auth/getCurrentUser.ts");

    assert.match(permissions, /create:\s*"crear"/);
    assert.match(permissions, /update:\s*"actualizar"/);
    assert.match(permissions, /delete:\s*"eliminar"/);

    assert.match(listRoute, /requireModulePermission\(moduleSlug,\s*"ver"\)/);
    assert.match(dpListRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"ver"\)/);
    assert.match(dpLabelsRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"ver"\)/);
    assert.match(dpLabelsRoute, /if \(!moduleKey\)/);
    assert.match(dpLabelsRoute, /throw badRequest\("moduleSlug es requerido"\)/);
    assert.match(dpLabelsRoute, /legacyTable && legacyTable !== resolved\.table && legacyTable !== resolved\.slug/);
    assert.match(dpLabelsRoute, /\.from\(resolved\.table\)/);
    assert.match(aggregateRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"ver"\)/);
    assert.match(createRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"crear"\)/);
    assert.match(updateRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"actualizar"\)/);
    assert.match(deleteRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"eliminar"\)/);

    assert.match(upload, /if \(!moduleSlug\) throw badRequest\("moduleSlug es requerido"\)/);
    assert.match(upload, /const uploadAction = recordId \? "actualizar" : "crear"/);
    assert.match(upload, /requireModulePermission\(moduleSlug,\s*uploadAction\)/);
    assert.match(uploadUrl, /requirePermission\(configuredPermission\("FILES_READ_PERMISSION", "files\.read"\)\)/);

    assert.match(relationDisplay, /catch \(error\)/);
    assert.match(relationDisplay, /statusPatch\[getRelationCacheKey\(bucket\.config,\s*id\)\] = "failed"/);
    assert.doesNotMatch(relationDisplay, /throw error/);

    assert.doesNotMatch(currentUser, /usuarios_roles/);
    assert.doesNotMatch(permissions, /usuarios_roles/);
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
    const policy = source("packages/types/auditPolicy.ts");
    const webPolicy = source("apps/web/lib/audit/shouldAuditEvent.ts");
    const migration = source("supabase/migrations/202607270001_create_audit_events.sql");
    const docs = source("docs/security/security-audit-remediation.md");

    assert.match(writer, /supabaseAdmin/);
    assert.match(writer, /audit_events/);
    assert.match(writer, /sanitizeAuditMetadata/);
    assert.match(writer, /SENSITIVE_KEY_PATTERN/);
    assert.match(writer, /module: args\.module \?\? inferModule\(args\.action\)/);
    assert.match(policy, /CONFIGURABLE_AUDIT_EVENTS/);
    assert.match(policy, /DEFAULT_MODULE_AUDIT_EVENTS/);
    assert.match(policy, /MANDATORY_AUDIT_EVENTS/);
    assert.match(policy, /DEFAULT_MODULE_AUDIT_EVENTS[\s\S]*"record\.create"[\s\S]*"record\.update"[\s\S]*"record\.delete"[\s\S]*"file\.upload"/);
    assert.match(policy, /"record\.read"/);
    assert.match(policy, /"file\.upload"/);
    assert.match(policy, /"users\.create"/);
    assert.match(policy, /"users\.roles\.update"/);
    assert.match(policy, /"workflows\.run"/);
    assert.match(webPolicy, /from "@repo\/types"/);
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

  it("audits sensitive backend operations without letting audit failures drive the main response", () => {
    const writer = source("apps/web/lib/audit/writeAuditEvent.ts");
    const upload = source("apps/web/app/api/upload/route.ts");
    const uploadUrl = source("apps/web/app/api/upload-url/route.ts");
    const userCreate = source("apps/web/app/api/users/create/route.ts");
    const roleUpdate = source("apps/web/app/api/admin/users/role/route.ts");
    const workflows = source("apps/web/app/api/workflows/run/route.ts");
    const createRoute = source("apps/web/app/api/create/route.ts");
    const updateRoute = source("apps/web/app/api/update/route.ts");
    const deleteRoute = source("apps/web/app/api/delete/route.ts");
    const formClient = source("apps/web/lib/FormClient.tsx");
    const listClient = source("apps/web/lib/ListPageClient.tsx");
    const modulosAction = source("apps/web/actions/modulos.ts");

    assert.match(writer, /catch\s*(?:\([^)]*\))?\s*\{/);
    assert.doesNotMatch(writer, /throw error/);

    assert.match(upload, /action:\s*"file\.upload"[\s\S]*success:\s*true/);
    assert.match(upload, /action:\s*"file\.upload"[\s\S]*success:\s*false/);
    assert.match(uploadUrl, /action:\s*"file\.signed_url"[\s\S]*success:\s*true/);
    assert.match(uploadUrl, /action:\s*"file\.signed_url"[\s\S]*success:\s*false/);
    assert.match(userCreate, /action:\s*"users\.create"[\s\S]*success:\s*true/);
    assert.match(userCreate, /action:\s*"users\.create"[\s\S]*success:\s*false/);
    assert.match(roleUpdate, /action:\s*"users\.roles\.update"[\s\S]*success:\s*true/);
    assert.match(roleUpdate, /action:\s*"users\.roles\.update"[\s\S]*success:\s*false/);
    assert.match(workflows, /action:\s*"workflows\.run"[\s\S]*success:\s*true/);
    assert.match(workflows, /action:\s*"workflows\.run"[\s\S]*success:\s*false/);

    assert.match(createRoute, /shouldAuditEvent\(resolved\.schema,\s*"record\.create"\)/);
    assert.match(updateRoute, /shouldAuditEvent\(resolved\.schema,\s*"record\.update"\)/);
    assert.match(deleteRoute, /shouldAuditEvent\(resolved\.schema,\s*"record\.delete"\)/);
    assert.match(upload, /shouldAuditEvent\(resolved\.schema,\s*"file\.upload"\)/);
    assert.match(createRoute, /if \(shouldAudit\) await writeAuditEvent\(\{[\s\S]*success:\s*true/);
    assert.match(createRoute, /if \(shouldAudit\) await writeAuditEvent\(\{[\s\S]*success:\s*false/);
    assert.match(updateRoute, /if \(shouldAudit\) await writeAuditEvent\(\{[\s\S]*success:\s*true/);
    assert.match(updateRoute, /if \(shouldAudit\) await writeAuditEvent\(\{[\s\S]*success:\s*false/);
    assert.match(deleteRoute, /if \(shouldAudit\) await writeAuditEvent\(\{[\s\S]*success:\s*true/);
    assert.match(deleteRoute, /if \(shouldAudit\) await writeAuditEvent\(\{[\s\S]*success:\s*false/);
    assert.match(upload, /if \(shouldAuditUpload\) await writeAuditEvent\(\{[\s\S]*success:\s*true/);
    assert.match(upload, /if \(shouldAuditUpload\) await writeAuditEvent\(\{[\s\S]*success:\s*false/);

    assert.match(createRoute, /action:\s*"record\.create"[\s\S]*success:\s*true/);
    assert.match(createRoute, /action:\s*"record\.create"[\s\S]*success:\s*false/);
    assert.match(updateRoute, /action:\s*"record\.update"[\s\S]*success:\s*true/);
    assert.match(updateRoute, /action:\s*"record\.update"[\s\S]*success:\s*false/);
    assert.match(deleteRoute, /action:\s*"record\.delete"[\s\S]*success:\s*true/);
    assert.match(deleteRoute, /action:\s*"record\.delete"[\s\S]*success:\s*false/);
    assert.equal(countMatches(createRoute, /action:\s*"record\.create"/g), 2);
    assert.equal(countMatches(updateRoute, /action:\s*"record\.update"/g), 2);
    assert.equal(countMatches(deleteRoute, /action:\s*"record\.delete"/g), 2);
    assert.equal(countMatches(upload, /action:\s*"file\.upload"/g), 2);
    assert.match(modulosAction, /action:\s*`module\.\$\{operation\}`/);
    assert.match(modulosAction, /success,\s*metadata:/);

    assert.match(createRoute, /requestId,\s*success:\s*true/);
    assert.match(createRoute, /requestId,\s*success:\s*false/);
    assert.match(updateRoute, /requestId,\s*success:\s*true/);
    assert.match(deleteRoute, /requestId,\s*success:\s*false/);
    assert.match(createRoute, /fieldNames:\s*auditFieldNames/);
    assert.match(updateRoute, /fieldNames:\s*auditFieldNames/);
    assert.doesNotMatch(createRoute, /metadata:\s*\{[\s\S]*payload/);
    assert.doesNotMatch(updateRoute, /metadata:\s*\{[\s\S]*payload/);
    assert.doesNotMatch(deleteRoute, /metadata:\s*\{[\s\S]*payload/);
    assert.match(modulosAction, /fieldNames:\s*FIELD_NAMES/);

    assert.match(formClient, /postMutation\("\/api\/create"/);
    assert.match(formClient, /postMutation\("\/api\/update"/);
    assert.match(listClient, /fetch\("\/api\/delete"/);
  });

  it("exposes module audit policy controls without overwriting other module props", () => {
    const moduleForm = source("packages/ui/src/ModuloForm/ModuloForm.tsx");
    const policy = source("packages/types/auditPolicy.ts");
    const auditPolicyTest = source("scripts/audit-policy.test.mjs");

    assert.match(moduleForm, /MODULE_AUDIT_EVENT_OPTIONS/);
    assert.match(moduleForm, /getEffectiveModuleAuditConfig\(propsObj\)/);
    assert.match(moduleForm, /applyModuleAuditConfigToProps\(propsObj,\s*nextConfig\)/);
    assert.match(moduleForm, /id: "audit", label: "Auditoría"/);
    assert.match(moduleForm, /<Section title="Auditoría">/);
    assert.match(moduleForm, /Activar auditoría/);
    assert.match(moduleForm, /Eventos auditados/);
    assert.match(moduleForm, /Registrar lecturas puede generar un gran volumen de eventos/);
    assert.match(moduleForm, /Las acciones administrativas críticas se auditan siempre/);
    assert.doesNotMatch(moduleForm, /users\.create|users\.roles\.update|workflows\.run/);

    assert.match(policy, /MODULE_AUDIT_EVENT_OPTIONS[\s\S]*Crear registros/);
    assert.match(policy, /MODULE_AUDIT_EVENT_OPTIONS[\s\S]*Modificar registros/);
    assert.match(policy, /MODULE_AUDIT_EVENT_OPTIONS[\s\S]*Eliminar registros/);
    assert.match(policy, /MODULE_AUDIT_EVENT_OPTIONS[\s\S]*Consultar registros/);
    assert.match(policy, /MODULE_AUDIT_EVENT_OPTIONS[\s\S]*Subir archivos/);
    assert.match(auditPolicyTest, /updates only props\.audit and preserves the rest of props/);
  });

  it("applies module capabilities to the active module UI and generic mutation APIs", () => {
    const moduleForm = source("packages/ui/src/ModuloForm/ModuloForm.tsx");
    const listView = source("packages/ui/src/ListView.tsx");
    const listClient = source("apps/web/lib/ListPageClient.tsx");
    const formClient = source("apps/web/lib/FormClient.tsx");
    const createRoute = source("apps/web/app/api/create/route.ts");
    const updateRoute = source("apps/web/app/api/update/route.ts");
    const deleteRoute = source("apps/web/app/api/delete/route.ts");
    const policy = source("packages/types/moduleCapabilities.ts");
    const capabilityTest = source("scripts/module-capabilities.test.mjs");

    assert.match(moduleForm, /MODULE_CAPABILITY_OPTIONS/);
    assert.match(moduleForm, /<h4[^>]*>Operaciones permitidas<\/h4>/);
    assert.match(moduleForm, /Estas opciones definen que funciones ofrece el modulo/);
    assert.match(moduleForm, /applyModuleCapabilitiesToProps\(propsObj/);
    assert.match(listView, /getEffectiveModuleCapabilities\(normalizedSchema\)/);
    assert.match(listView, /capabilities\.allowSearch && filterFields\.length > 0/);

    assert.match(listClient, /isModuleActionAvailable\(schema,\s*"crear"/);
    assert.match(listClient, /isModuleActionAvailable\(schema,\s*"actualizar"/);
    assert.match(listClient, /isModuleActionAvailable\(schema,\s*"eliminar"/);
    assert.match(listClient, /isModuleActionAvailable\(schema,\s*"exportar"/);
    assert.match(listClient, /isModuleActionAvailable\(schema,\s*"importar"/);
    assert.match(listClient, /onCreate=\{canCreate \? handleCreate : undefined\}/);
    assert.match(listClient, /onExport=\{canExport \? handleExport : undefined\}/);
    assert.match(listClient, /onImport=\{canImport \? handleImport : undefined\}/);

    assert.match(formClient, /capabilities\.allowEdit/);
    assert.match(createRoute, /moduleCapabilityEnabled\(resolved\.schema,\s*"allowCreate"\)/);
    assert.match(updateRoute, /moduleCapabilityEnabled\(resolved\.schema,\s*"allowEdit"\)/);
    assert.match(deleteRoute, /moduleCapabilityEnabled\(resolved\.schema,\s*"allowDelete"\)/);
    assert.match(createRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"crear"\)[\s\S]*moduleCapabilityEnabled/);
    assert.match(updateRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"actualizar"\)[\s\S]*moduleCapabilityEnabled/);
    assert.match(deleteRoute, /requireModulePermission\(resolved\.permissionsKey,\s*"eliminar"\)[\s\S]*moduleCapabilityEnabled/);

    assert.match(policy, /DEFAULT_MODULE_CAPABILITIES[\s\S]*allowCreate:\s*true/);
    assert.match(policy, /MODULE_CAPABILITY_BY_ACTION[\s\S]*exportar:\s*"allowExport"/);
    assert.match(policy, /isModuleActionAvailable/);
    assert.match(capabilityTest, /allowExport: true[\s\S]*"exportar", true\), true/);
    assert.match(capabilityTest, /allowImport: false[\s\S]*"importar", true\), false/);
    assert.match(capabilityTest, /updates only props\.capabilities and preserves other module props/);
  });
});
