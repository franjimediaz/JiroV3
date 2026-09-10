import { supabaseAdmin } from "@/lib/supabase/admin";

export async function writeAuditEvent(args: {
  actorUserId?: string | null;
  tenantId?: string | null;
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
      action: args.action,
      resource_type: args.resourceType ?? null,
      resource_id: args.resourceId ?? null,
      request_id: args.requestId,
      success: args.success,
      metadata: args.metadata ?? {},
    });

    if (error && error.code !== "42P01") {
      console.error("audit_event_failed", { requestId: args.requestId, action: args.action, code: error.code });
    }
  } catch {
    console.error("audit_event_failed", { requestId: args.requestId, action: args.action });
  }
}
