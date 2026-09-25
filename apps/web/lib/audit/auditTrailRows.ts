import {
  decorateAuditTrailRows,
  isAuditEventsTable,
  type AuditTrailActor,
  type AuditTrailModuleLabel,
} from "@repo/types";

export async function enrichAuditTrailRows(
  table: unknown,
  rows: Array<Record<string, unknown>>,
  options?: { modulesBySlug?: Record<string, AuditTrailModuleLabel> },
) {
  if (!isAuditEventsTable(table) || rows.length === 0) return rows;

  const actorIds = Array.from(
    new Set(
      rows
        .map((row) => (row.actor_user_id ? String(row.actor_user_id) : ""))
        .filter(Boolean),
    ),
  );
  const actorsByUid = new Map<string, AuditTrailActor>();

  if (actorIds.length > 0) {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("uid,name,email")
      .in("uid", actorIds);

    if (!error) {
      for (const actor of data || []) {
        if (actor?.uid) actorsByUid.set(String(actor.uid), actor as AuditTrailActor);
      }
    } else if (process.env.NODE_ENV === "development") {
      console.warn("audit_trail_actor_lookup_failed", { code: error.code, message: error.message });
    }
  }

  return decorateAuditTrailRows(rows, { actorsByUid, modulesBySlug: options?.modulesBySlug });
}

export function applyAuditTrailDefaultOrder(table: unknown, query: any) {
  return isAuditEventsTable(table) ? query.order("created_at", { ascending: false }) : query;
}
