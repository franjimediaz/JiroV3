import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { ApiError, badRequest } from "@/lib/auth/apiError";
import { handleApiError } from "@/lib/auth/handleApiError";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";
import { shouldAuditEvent } from "@/lib/audit/shouldAuditEvent";
import { resolveModuleConfig } from "@/lib/modules/resolveModuleConfig";

type Body = {
  moduleSlug?: string;
  table?: string;
  id?: string;
  data?: Record<string, any>;
};

const SERVER_CONTROLLED_FIELDS = [
  "tenant_id",
  "organization_id",
  "created_by",
  "updated_by",
  "owner_id",
  "role_id",
  "is_admin",
  "created_at",
  "updated_at",
];

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let moduleSlugForLog = "";
  let actorUserId: string | null = null;
  let auditModule: string | null = null;
  let auditResourceType: string | null = null;
  let auditResourceId: string | null = null;
  let auditFieldNames: string[] = [];
  let shouldAudit = shouldAuditEvent(null, "record.update");

  try {
    const body = (await req.json()) as Body;
    const moduleSlug = body.moduleSlug?.trim();
    const legacyTable = body.table?.trim();
    const recordId = body.id ? String(body.id).trim() : "";
    const payload = body.data;
    moduleSlugForLog = moduleSlug || legacyTable || "";
    auditResourceId = recordId || null;

    if (!moduleSlug && !legacyTable) {
      throw badRequest("Falta 'moduleSlug'");
    }
    if (!recordId) {
      throw badRequest("Falta 'id'");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw badRequest("Falta 'data' (object)");
    }

    const resolved = await resolveModuleConfig(moduleSlug || legacyTable || "");
    shouldAudit = shouldAuditEvent(resolved.schema, "record.update");
    auditModule = resolved.permissionsKey;
    auditResourceType = resolved.slug;

    if (!resolved.table) {
      throw badRequest("Este modulo no es un modulo de datos");
    }
    if (legacyTable && legacyTable !== resolved.table && legacyTable !== resolved.slug) {
      throw badRequest(`Tabla legacy no permitida: ${legacyTable}`);
    }

    const ctx = await requireModulePermission(resolved.permissionsKey, "actualizar");
    actorUserId = ctx.user.id;

    const allowedFields = new Set(
      (resolved.schema.fields || [])
        .filter((field) => field.virtual !== true)
        .map((field) => field.name)
    );
    auditFieldNames = Object.keys(payload).sort();
    const unknownFields = auditFieldNames.filter(
      (key) => !allowedFields.has(key) && key !== resolved.primaryKey && key !== "id"
    );
    const controlledFields = auditFieldNames.filter((key) => SERVER_CONTROLLED_FIELDS.includes(key));

    if (unknownFields.length > 0) {
      throw badRequest(`Campos no declarados en schema: ${unknownFields.join(", ")}`);
    }
    if (controlledFields.length > 0) {
      throw badRequest(`Campos controlados por servidor no permitidos: ${controlledFields.join(", ")}`);
    }

    const { error } = await ctx.supabase
      .from(resolved.table)
      .update(payload)
      .eq(resolved.primaryKey, recordId);

    if (error) {
      throw badRequest(error.message);
    }

    if (shouldAudit) await writeAuditEvent({
      actorUserId,
      module: auditModule,
      action: "record.update",
      resourceType: auditResourceType || resolved.slug,
      resourceId: recordId,
      requestId,
      success: true,
      metadata: {
        operation: "update",
        moduleSlug: resolved.slug,
        table: resolved.table,
        fieldNames: auditFieldNames,
      },
    });

    return NextResponse.json({ ok: true, id: recordId });
  } catch (e: any) {
    if (shouldAudit) await writeAuditEvent({
      actorUserId,
      module: auditModule || moduleSlugForLog || null,
      action: "record.update",
      resourceType: auditResourceType || moduleSlugForLog || undefined,
      resourceId: auditResourceId,
      requestId,
      success: false,
      metadata: {
        operation: "update",
        moduleSlug: moduleSlugForLog || auditModule,
        fieldNames: auditFieldNames,
        errorCode: e instanceof ApiError ? e.code : "INTERNAL",
      },
    });
    return handleApiError(e, requestId, { route: "/api/update", method: "POST", moduleSlug: moduleSlugForLog });
  }
}
