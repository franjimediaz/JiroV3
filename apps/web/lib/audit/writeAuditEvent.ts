import { supabaseAdmin } from "@/lib/supabase/admin";

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN = /authorization|cookie|password|token|secret|service_role|api[_-]?key|supabase_service_role/i;

function inferModule(action: string) {
  const [moduleName] = action.split(".");
  return moduleName?.trim() || null;
}

function sanitizeAuditMetadata(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return SENSITIVE_KEY_PATTERN.test(value) ? REDACTED : value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeAuditMetadata);

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeAuditMetadata(nested);
  }
  return out;
}

export async function writeAuditEvent(args: {
  actorUserId?: string | null;
  tenantId?: string | null;
  module?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  requestId: string;
  success: boolean;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { error } = await supabaseAdmin.from("audit_events").insert({
      actor_user_id: args.actorUserId ?? null,
      tenant_id: args.tenantId ?? null,
      module: args.module ?? inferModule(args.action),
      action: args.action,
      resource_type: args.resourceType ?? null,
      resource_id: args.resourceId ?? null,
      request_id: args.requestId,
      success: args.success,
      metadata: sanitizeAuditMetadata(args.metadata ?? {}),
    });

    if (error && error.code !== "42P01") {
      console.error("audit_event_failed", { requestId: args.requestId, action: args.action, code: error.code });
    }
  } catch {
    console.error("audit_event_failed", { requestId: args.requestId, action: args.action });
  }
}
