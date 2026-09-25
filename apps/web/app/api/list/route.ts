// app/api/list/route.ts
import { NextResponse } from "next/server";
import type { QueryFilter } from "@repo/types";
import {
  applyQueryFilters,
  buildModuleDefaultFilterRuntimeContext,
  filterRowsWithDefaultFilters,
  resolveDefaultFiltersForQuery,
} from "@/lib/moduleDefaultFilters";
import { badRequest } from "@/lib/auth/apiError";
import { handleApiError } from "@/lib/auth/handleApiError";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";
import { resolveModuleConfig, resolveModuleIndex } from "@/lib/modules/resolveModuleConfig";
import { applyAuditTrailDefaultOrder, enrichAuditTrailRows } from "@/lib/audit/auditTrailRows";

type ListFilter = QueryFilter;
type ListSort = { field: string; dir: "asc" | "desc"; direction?: "asc" | "desc" };

type ListBody = {
  moduleSlug: string;
  table?: string;
  filters?: ListFilter[];
  sort?: ListSort[];
  limit?: number;
  offset?: number;
};

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let moduleSlug = "";

  try {
    const body = (await req.json()) as ListBody;
    moduleSlug = String(body?.moduleSlug || "").trim();
    const legacyTable = String(body?.table || "").trim();
    const limitRaw = body?.limit;
    const offsetRaw = body?.offset;

    if (!moduleSlug) {
      throw badRequest("moduleSlug es requerido");
    }

    const permissionCtx = await requireModulePermission(moduleSlug, "ver");
    const resolved = await resolveModuleConfig(moduleSlug);
    if (!resolved.table) {
      throw badRequest(`El modulo "${moduleSlug}" no tiene props.db.table`);
    }
    if (legacyTable && legacyTable !== resolved.table && legacyTable !== resolved.slug) {
      throw badRequest(`Tabla legacy no permitida: ${legacyTable}`);
    }

    let queryClient: any = permissionCtx.supabase;
    if (resolved.readMode === "server") {
      await requireModulePermission(resolved.permissionsKey, "ver");
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      queryClient = supabaseAdmin;
    }

    const runtimeContext = await buildModuleDefaultFilterRuntimeContext(permissionCtx.supabase);
    const defaultFilters = resolveDefaultFiltersForQuery(resolved.schema?.db?.defaultFilters, runtimeContext);

    let q = queryClient.from(resolved.table).select("*");
    if (defaultFilters.canQueryDirectly) {
      q = applyQueryFilters(q, defaultFilters.filters as QueryFilter[]);
    }

    const bodyFilters = Array.isArray(body?.filters) ? body.filters : [];
    if (bodyFilters.length > 0) {
      q = applyQueryFilters(q, bodyFilters);
    }

    const sort = Array.isArray(body?.sort) ? body.sort : [];
    if (sort.length === 0) {
      q = applyAuditTrailDefaultOrder(resolved.table, q);
    }
    for (const s of sort) {
      if (!s || typeof s !== "object") continue;
      const field = String((s as any).field || "").trim();
      const dir = (s as any).dir === "desc" || (s as any).direction === "desc" ? "desc" : "asc";
      if (!field) continue;
      q = q.order(field, { ascending: dir === "asc" });
    }

    const limit = Number.isFinite(limitRaw as any) ? Math.max(1, Math.min(200, Number(limitRaw))) : 50;
    const offset = Number.isFinite(offsetRaw as any) ? Math.max(0, Number(offsetRaw)) : 0;
    q = q.range(offset, offset + limit - 1);

    const { data, error } = await q;
    if (error) {
      console.error("POST /api/list query error", { tableName: resolved.table, error });
      return NextResponse.json(
        { ok: false, detail: "Error listando datos", code: error.code },
        { status: 500 },
      );
    }

    const rows = defaultFilters.canQueryDirectly ? data ?? [] : filterRowsWithDefaultFilters(data ?? [], defaultFilters.group);
    const moduleIndex = resolved.table === "audit_events" ? await resolveModuleIndex() : undefined;
    const displayRows = await enrichAuditTrailRows(resolved.table, rows, { modulesBySlug: moduleIndex?.modulesBySlug });
    return NextResponse.json({ ok: true, data: displayRows });
  } catch (error) {
    return handleApiError(error, requestId, { route: "/api/list", method: "POST", moduleSlug });
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: false, detail: "Usa POST con JSON: { moduleSlug, filters, sort, limit, offset }" },
    { status: 405 },
  );
}
