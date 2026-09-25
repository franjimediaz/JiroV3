export const AUDIT_EVENTS_TABLE = "audit_events";

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "record.create": "Crear registro",
  "record.update": "Modificar registro",
  "record.delete": "Eliminar registro",
  "file.upload": "Subir archivo",
  "users.create": "Crear usuario",
  "users.roles.update": "Cambiar rol",
  "workflows.run": "Ejecutar workflow",
};

export type AuditTrailActor = {
  uid: string;
  name?: string | null;
  email?: string | null;
};

export type AuditTrailModuleLabel = {
  nombre?: string | null;
  ui?: { titleSingular?: string | null } | null;
  schema?: { ui?: { titleSingular?: string | null } | null } | null;
};

export function isAuditEventsTable(table: unknown) {
  return String(table || "").trim() === AUDIT_EVENTS_TABLE;
}

export function formatAuditActionLabel(action: unknown) {
  const key = String(action || "").trim();
  return AUDIT_ACTION_LABELS[key] || key;
}

export function formatAuditSuccessLabel(success: unknown) {
  return success === true ? "Exito" : success === false ? "Fallo" : "Sin estado";
}

export function formatAuditActorLabel(actorUserId: unknown, actor?: AuditTrailActor | null) {
  if (!actorUserId) return "Sistema";
  if (!actor) return "Usuario desconocido";
  return String(actor.name || actor.email || actor.uid || "Usuario desconocido");
}

export function formatAuditModuleLabel(moduleSlug: unknown, modulesBySlug?: Record<string, AuditTrailModuleLabel>) {
  const slug = String(moduleSlug || "").trim();
  if (!slug) return "";
  const mod = modulesBySlug?.[slug];
  return String(mod?.nombre || mod?.ui?.titleSingular || mod?.schema?.ui?.titleSingular || slug);
}

export function formatAuditResourceLabel(row: Record<string, unknown>) {
  const type = String(row.resource_type || row.module || "").trim();
  const id = String(row.resource_id || "").trim();
  if (type && id) return `${type} #${id}`;
  return type || id;
}

export function formatAuditMetadataPreview(metadata: unknown, maxLength = 140) {
  if (metadata === null || metadata === undefined || metadata === "") return "";
  let text: string;
  if (typeof metadata === "string") {
    text = metadata;
  } else {
    try {
      text = JSON.stringify(metadata);
    } catch {
      text = String(metadata);
    }
  }
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

export function decorateAuditTrailRows(
  rows: Array<Record<string, unknown>>,
  options?: {
    actorsByUid?: Map<string, AuditTrailActor> | Record<string, AuditTrailActor>;
    modulesBySlug?: Record<string, AuditTrailModuleLabel>;
  },
) {
  const actorLookup = options?.actorsByUid;
  const findActor = (uid: string) =>
    actorLookup instanceof Map ? actorLookup.get(uid) : actorLookup?.[uid];

  return rows.map((row) => {
    const actorUserId = row.actor_user_id ? String(row.actor_user_id) : "";
    const actor = actorUserId ? findActor(actorUserId) : null;
    const action = String(row.action || "");
    const moduleSlug = String(row.module || "");

    return {
      ...row,
      actor_label: formatAuditActorLabel(actorUserId, actor),
      actor_email: actor?.email ?? null,
      actor_uid: actorUserId || null,
      module_label: formatAuditModuleLabel(moduleSlug, options?.modulesBySlug),
      action_label: formatAuditActionLabel(action),
      success_label: formatAuditSuccessLabel(row.success),
      resource_label: formatAuditResourceLabel(row),
      metadata_preview: formatAuditMetadataPreview(row.metadata),
    };
  });
}
