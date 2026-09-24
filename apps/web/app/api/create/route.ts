import { NextResponse } from "next/server";
import { resolveModuleConfig } from "@/lib/modules/resolveModuleConfig";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";
import { handleApiError } from "@/lib/auth/handleApiError";
import { ApiError, badRequest } from "@/lib/auth/apiError";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { shouldAuditEvent } from "@/lib/audit/shouldAuditEvent";

type Body = {
  moduleSlug?: string;
  table?: string;
  data?: Record<string, any>;
};

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let moduleSlugForLog = "";
  let actorUserId: string | null = null;
  let auditModule: string | null = null;
  let auditResourceType: string | null = null;
  let auditResourceId: string | null = null;
  let auditFieldNames: string[] = [];
  let shouldAudit = shouldAuditEvent(null, "record.create");

  try {
    const body = (await req.json()) as Body;
    const moduleSlug = body.moduleSlug?.trim();
    const legacyTable = body.table?.trim();
    const payload = body.data;
    moduleSlugForLog = moduleSlug || legacyTable || "";

    if (!moduleSlug && !legacyTable) {
      throw badRequest("Falta 'moduleSlug'");
    }
    if (!payload || typeof payload !== "object") {
      throw badRequest("Falta 'data' (object)");
    }

    const resolved = await resolveModuleConfig(moduleSlug || legacyTable || "");
    shouldAudit = shouldAuditEvent(resolved.schema, "record.create");
    auditModule = resolved.permissionsKey;
    auditResourceType = resolved.slug;
    if (!resolved.table) {
      throw badRequest("Este modulo no es un modulo de datos");
    }
    if (legacyTable && legacyTable !== resolved.table && legacyTable !== resolved.slug) {
      throw badRequest(`Tabla legacy no permitida: ${legacyTable}`);
    }

    const ctx = await requireModulePermission(resolved.permissionsKey, "crear");
    const { supabase } = ctx;
    actorUserId = ctx.user.id;

    const allowedFields = new Set(
      (resolved.schema.fields || [])
        .filter((field) => field.virtual !== true)
        .map((field) => field.name)
    );
    const unknownFields = Object.keys(payload).filter(
      (key) => !allowedFields.has(key) && key !== resolved.primaryKey && key !== "id"
    );
    const serverControlledFields = [
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
    const controlledFields = Object.keys(payload).filter((key) => serverControlledFields.includes(key));
    auditFieldNames = Object.keys(payload).sort();
    if (unknownFields.length > 0) {
      throw badRequest(`Campos no declarados en schema: ${unknownFields.join(", ")}`);
    }
    if (controlledFields.length > 0) {
      throw badRequest(`Campos controlados por servidor no permitidos: ${controlledFields.join(", ")}`);
    }

    const { data: created, error } = await supabase
      .from(resolved.table)
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      throw badRequest(error.message);
    }

    auditResourceId = String(created?.[resolved.primaryKey] ?? created?.id ?? "");
    if (shouldAudit) await writeAuditEvent({
      actorUserId,
      module: auditModule,
      action: "record.create",
      resourceType: auditResourceType || resolved.slug,
      resourceId: auditResourceId,
      requestId,
      success: true,
      metadata: {
        operation: "create",
        moduleSlug: resolved.slug,
        table: resolved.table,
        fieldNames: auditFieldNames,
      },
    });

    return NextResponse.json({
      ok: true,
      id: created?.[resolved.primaryKey] ?? created?.id,
      record: created,
      legacyTableAccepted: !!legacyTable && !moduleSlug,
    });
  } catch (e: any) {
    if (shouldAudit) await writeAuditEvent({
      actorUserId,
      module: auditModule || moduleSlugForLog || null,
      action: "record.create",
      resourceType: auditResourceType || moduleSlugForLog || undefined,
      resourceId: auditResourceId,
      requestId,
      success: false,
      metadata: {
        operation: "create",
        moduleSlug: moduleSlugForLog || auditModule,
        fieldNames: auditFieldNames,
        errorCode: e instanceof ApiError ? e.code : "INTERNAL",
      },
    });
    return handleApiError(e, requestId, { route: "/api/create", method: "POST", moduleSlug: moduleSlugForLog });
  }
}
