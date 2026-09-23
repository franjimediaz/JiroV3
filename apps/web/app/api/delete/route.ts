import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { ApiError, badRequest } from "@/lib/auth/apiError";
import { handleApiError } from "@/lib/auth/handleApiError";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";
import { resolveModuleConfig } from "@/lib/modules/resolveModuleConfig";

type Body = {
  moduleSlug?: string;
  table?: string;
  id?: string;
};

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let moduleSlugForLog = "";
  let actorUserId: string | null = null;
  let auditModule: string | null = null;
  let auditResourceType: string | null = null;
  let auditResourceId: string | null = null;

  try {
    const body = (await req.json()) as Body;
    const moduleSlug = body.moduleSlug?.trim();
    const legacyTable = body.table?.trim();
    const recordId = body.id ? String(body.id).trim() : "";
    moduleSlugForLog = moduleSlug || legacyTable || "";
    auditResourceId = recordId || null;

    if (!moduleSlug && !legacyTable) {
      throw badRequest("Falta 'moduleSlug'");
    }
    if (!recordId) {
      throw badRequest("Falta 'id'");
    }

    const resolved = await resolveModuleConfig(moduleSlug || legacyTable || "");
    auditModule = resolved.permissionsKey;
    auditResourceType = resolved.slug;

    if (!resolved.table) {
      throw badRequest("Este modulo no es un modulo de datos");
    }
    if (legacyTable && legacyTable !== resolved.table && legacyTable !== resolved.slug) {
      throw badRequest(`Tabla legacy no permitida: ${legacyTable}`);
    }

    const ctx = await requireModulePermission(resolved.permissionsKey, "eliminar");
    actorUserId = ctx.user.id;

    const { error } = await ctx.supabase
      .from(resolved.table)
      .delete()
      .eq(resolved.primaryKey, recordId);

    if (error) {
      throw badRequest(error.message);
    }

    await writeAuditEvent({
      actorUserId,
      module: auditModule,
      action: "record.delete",
      resourceType: auditResourceType || resolved.slug,
      resourceId: recordId,
      requestId,
      success: true,
      metadata: {
        operation: "delete",
        moduleSlug: resolved.slug,
        table: resolved.table,
      },
    });

    return NextResponse.json({ ok: true, id: recordId });
  } catch (e: any) {
    await writeAuditEvent({
      actorUserId,
      module: auditModule || moduleSlugForLog || null,
      action: "record.delete",
      resourceType: auditResourceType || moduleSlugForLog || undefined,
      resourceId: auditResourceId,
      requestId,
      success: false,
      metadata: {
        operation: "delete",
        moduleSlug: moduleSlugForLog || auditModule,
        errorCode: e instanceof ApiError ? e.code : "INTERNAL",
      },
    });
    return handleApiError(e, requestId, { route: "/api/delete", method: "POST", moduleSlug: moduleSlugForLog });
  }
}
