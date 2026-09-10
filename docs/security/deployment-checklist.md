# Security Deployment Checklist

1. Take a database backup.
2. Rotate `SUPABASE_SERVICE_ROLE` and `PDF_SERVICE_SECRET`.
3. Configure web environment variables, especially production rate limiting.
4. Apply `supabase/migrations/202607270001_create_audit_events.sql`.
5. Review live RLS and Storage policies before enabling broad access.
6. Deploy `pdf-service` with only `PDF_SERVICE_SECRET` and explicit `PDF_ALLOWED_RESOURCE_HOSTS`.
7. Keep Chromium sandbox enabled unless infrastructure requires `PDF_DISABLE_CHROMIUM_SANDBOX=1`.
8. Deploy web.
9. Smoke test login, upload, signed URL, user create, role update, workflow run and PDF generation.
10. Monitor `audit_events`, API 401/403/429 rates and PDF service errors.
11. Roll back web and PDF service if privileged flows fail.
12. Restore backup only if a migration causes unexpected database impact.
