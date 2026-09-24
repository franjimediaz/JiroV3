# Security Audit Remediation

## Scope

Static hardening pass for JiRoV3 focused on API authentication, authorization, Supabase Storage, user administration, workflow execution, PDF generation, rate limiting, security headers, errors and audit logging.

## Inventory

| Endpoint | Risk | Original issue | Remediation |
| --- | --- | --- | --- |
| `POST /api/upload` | Critical | Anonymous upload, client-controlled folder/MIME policy, `supabaseAdmin` before auth | Requires user permission, server bucket/path, magic-byte checks, size limits, rate limit, audit |
| `DELETE /api/upload` | Critical | Client-controlled bucket/path, no ownership check | Requires delete permission, bucket allowlist, user-scoped path, audit |
| `POST /api/upload-url` | Critical | Client-controlled bucket/path/expires, signed URLs for any object | Requires read permission, private bucket only, max 300s, user-scoped path |
| `POST /api/users/create` | Critical | Uses `service_role` before authorization, accepts arbitrary `role_id` | Requires `users.create`, validates role existence, blocks privileged role assignment without wildcard |
| `POST /api/admin/users/role` | High | No central permission, can update roles directly | Requires `users.roles.update`, validates target and role, blocks self-change and privileged assignment |
| `POST /api/workflows/run` | High | No auth/authorization/idempotency | Requires global and workflow-specific permissions, validates key against registry, rate limits, idempotency cache |
| `GET/POST /api/pdf/*` | High | Missing explicit backend permission | Requires `pdf_templates` permissions before template/context access |
| `pdf-service /generate` | High | Direct secret compare, no concurrency/network controls, technical errors exposed | Timing-safe auth, body/HTML limits, concurrency, timeout, JS off by default, route interception |
| Generic module APIs | Medium | Inconsistent auth/permission and server-controlled field handling | Adds module permission checks and rejects security-sensitive client fields |

## RLS Report

No versioned Supabase schema or migrations existed locally under `supabase/` before this change. Because table columns, tenant columns and existing policies cannot be verified statically, no broad RLS policies were invented. A new non-destructive migration creates `public.audit_events` with RLS enabled and client-deny policies.

Required follow-up: export current database schema/policies from Supabase and review tables for RLS, `using (true)`, `with check (true)`, grants to `anon/authenticated`, `security definer` functions and `storage.objects` policies.

## Variables

| Variable | Service | Required |
| --- | --- | --- |
| `RATE_LIMIT_REDIS_URL` or `UPSTASH_REDIS_REST_URL` | web | Production recommended |
| `ALLOW_IN_MEMORY_RATE_LIMIT=1` | web | Development fallback only |
| `FILES_CREATE_PERMISSION` | web | Optional, default `files.create` |
| `FILES_DELETE_PERMISSION` | web | Optional, default `files.delete` |
| `FILES_READ_PERMISSION` | web | Optional, default `files.read` |
| `RESERVED_ROLE_SLUGS` | web | Optional |
| `REQUIRE_WORKFLOW_IDEMPOTENCY_KEY` | web | Optional |
| `PDF_ALLOWED_RESOURCE_HOSTS` | pdf-service | Required if templates load remote assets |
| `PDF_DISABLE_CHROMIUM_SANDBOX` | pdf-service | Optional emergency fallback |
| `PDF_ENABLE_JAVASCRIPT` | pdf-service | Optional, keep disabled unless documented |

## Dependency Audit

`pnpm audit --prod` was run on 2026-09-10 and reported 149 production vulnerabilities: 9 critical, 60 high, 68 moderate and 12 low.

Release blockers:

- `next` is installed directly in `apps/web` (`^16.1.1`) and `apps/docs` (`^16.0.0`). Current advisories include critical unauthenticated RCE issues affecting installed `16.0.0`/`16.1.1`; upgrade both apps to at least `16.3.3` and rerun the full build/test matrix.
- `basic-ftp@5.1.0` is pulled by `apps/web > puppeteer-core > @puppeteer/browsers > proxy-agent > pac-proxy-agent > get-uri`. The advisory is critical for path traversal in `downloadToDir()` and is patched in `>=5.2.0`; upgrade the Puppeteer/browser dependency chain or add a package-manager override after compatibility testing.

Other high-priority production findings include vulnerable `@tiptap/core`, `lodash` via `react-quill`, `sanitize-html` transitive parser dependencies, `sharp`/image-processing dependencies from Next, and `body-parser` via `pdf-service > express`. These should be treated as follow-up security work before production release, with lockfile updates committed separately from this hardening pass.

## Residual Risk

Storage ownership is inferred from server-generated paths because no file metadata table exists in the repo. Role hierarchy is inferred from wildcard permissions and reserved slugs because no hierarchy column exists locally. Full RLS correctness cannot be guaranteed without the live schema and current Supabase policies.

## Rollback

Revert this branch and, if applied, drop `public.audit_events` only after confirming audit retention requirements. No destructive data migrations are included.
