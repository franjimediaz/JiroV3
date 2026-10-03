// app/api/list/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { QueryFilter } from "@repo/types";
import {
  applyQueryFilters,
  buildModuleDefaultFilterRuntimeContext,
  filterRowsWithDefaultFilters,
  resolveDefaultFiltersForQuery,
} from "@/lib/moduleDefaultFilters";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";
import { handleApiError } from "@/lib/auth/handleApiError";
import { compileAdvancedFilters, defaultFilterExpression, filterIdentifier } from "@/lib/advancedFilters";
import { badRequest, forbidden } from "@/lib/auth/apiError";
import { getEffectiveModuleCapabilities } from "@repo/types";

type ListFilter = QueryFilter;
type ListSort = { field: string; dir: "asc" | "desc" };

type ListBody = {
  moduleSlug: string;
  filters?: ListFilter[];
  sort?: ListSort[];
  limit?: number;
  offset?: number;
  advancedFilters?: unknown;
  purpose?: "export";
};

function parseProps(props: any) {
  if (!props) return null;
  if (typeof props === "string") {
    try {
      return JSON.parse(props);
    } catch {
      return null;
    }
  }
  return props;
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let moduleSlug = "";

  try {
    const supabase = await createClient();

    const body = (await req.json()) as ListBody;
    moduleSlug = String(body?.moduleSlug || "").trim();
    const limitRaw = body?.limit;
    const offsetRaw = body?.offset;

    if (!moduleSlug) {
      return NextResponse.json({ ok: false, detail: "moduleSlug es requerido" }, { status: 400 });
    }

    await requireModulePermission(moduleSlug, "ver");

    const { data: modRow, error: modErr } = await supabase
      .from("modulos")
      .select("id, slug, props")
      .eq("slug", moduleSlug)
      .maybeSingle();

    if (modErr) {
      console.error("POST /api/list modulos error", modErr);
      return NextResponse.json(
        { ok: false, detail: "Error resolviendo módulo", code: modErr.code },
        { status: 500 }
      );
    }

    if (!modRow) {
      return NextResponse.json(
        { ok: false, detail: `No existe módulo con slug "${moduleSlug}"` },
        { status: 404 }
      );
    }

    const props = parseProps((modRow as any).props);
    const tableName = String(props?.db?.table || "").trim() || moduleSlug;
    if (!tableName) {
      return NextResponse.json(
        { ok: false, detail: `El módulo "${moduleSlug}" no tiene props.db.table` },
        { status: 400 }
      );
    }

    const runtimeContext = await buildModuleDefaultFilterRuntimeContext(supabase);
    const defaultFilters = resolveDefaultFiltersForQuery(props?.db?.defaultFilters, runtimeContext);

    const advanced = body.advancedFilters !== undefined;
    if (advanced && (!props?.db?.table || !Array.isArray(props.fields))) throw badRequest("El módulo no tiene un schema de datos válido");
    if (body.purpose === "export") {
      await requireModulePermission(moduleSlug, "exportar");
      if (!getEffectiveModuleCapabilities(props).allowExport) throw forbidden("La exportación está deshabilitada en este módulo");
    }
    const compiled = advanced ? await compileAdvancedFilters(body.advancedFilters, props, runtimeContext) : undefined;
    if (advanced) {
      filterIdentifier(tableName);
      if (body.filters?.length) throw badRequest("Usa el constructor avanzado para las condiciones de búsqueda");
      if (limitRaw !== undefined && (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 200)) throw badRequest("Tamaño de página no válido");
      if (offsetRaw !== undefined && (!Number.isSafeInteger(offsetRaw) || offsetRaw < 0)) throw badRequest("Página no válida");
    }
    let q = advanced
      ? supabase.from(tableName).select(["*", ...compiled!.embeds.map(embed => embed.select)].join(","), { count: "exact" })
      : supabase.from(tableName).select("*");
    if (compiled) {
      for (const embed of compiled.embeds) q = q.or(embed.expression, { referencedTable: embed.alias });
      const expressions = [compiled.expression, defaultFilterExpression(defaultFilters.group, props)].filter(Boolean);
      if (expressions.length) q = q.or(`and(${expressions.join(",")})`);
    } else if (defaultFilters.canQueryDirectly) {
      q = applyQueryFilters(q, defaultFilters.filters as QueryFilter[]);
    }

    const bodyFilters = Array.isArray(body?.filters) ? body.filters : [];
    if (bodyFilters.length > 0) {
      q = applyQueryFilters(q, bodyFilters);
    }

    const sort = Array.isArray(body?.sort) ? body.sort : [];
    for (const s of sort) {
      if (!s || typeof s !== "object") continue;
      const field = String((s as any).field || "").trim();
      const dir = (s as any).dir === "desc" || (s as any).direction === "desc" ? "desc" : "asc";
      if (!field) continue;
      if (advanced && !props.fields?.some((f: any) => f.name === field && !f.virtual)) throw badRequest("Campo de ordenación no permitido");
      if (advanced) filterIdentifier(field);
      q = q.order(field, { ascending: dir === "asc" });
    }
    if (advanced) q = q.order(filterIdentifier(props.db.primaryKey || "id"), { ascending: true });

    const limit = Number.isFinite(limitRaw as any) ? Math.max(1, Math.min(200, Number(limitRaw))) : 50;
    const offset = Number.isFinite(offsetRaw as any) ? Math.max(0, Number(offsetRaw)) : 0;
    q = q.range(offset, offset + limit - 1);

    let { data, error, count } = await q;
    // With count=exact, an offset beyond the last row returns 416/PGRST103,
    // not an empty page. Recover the count so the caller can correct its page
    // after rows disappear, without changing the predicates or returning page 1.
    if (advanced && offset > 0 && error?.code === "PGRST103") {
      const recovered = await q.range(0, 0);
      data = [];
      error = recovered.error;
      count = recovered.count;
    }
    if (error) {
      if (advanced && error.code === "PGRST200")
        throw badRequest("La relación del schema no coincide con una clave foránea reconocida por PostgREST. Revisa la tabla destino, la columna de origen y la caché del schema.");
      if (advanced && error.code === "PGRST201")
        throw badRequest("PostgREST encuentra varias relaciones para el campo configurado. No se puede seleccionar una clave foránea de forma inequívoca.");
      console.error("POST /api/list query error", { tableName, error });
      return NextResponse.json(
        { ok: false, detail: "Error listando datos", code: error.code },
        { status: 500 }
      );
    }

    const rows = advanced || defaultFilters.canQueryDirectly ? data ?? [] : filterRowsWithDefaultFilters(data ?? [], defaultFilters.group);
    return NextResponse.json({ ok: true, data: rows, ...(advanced ? { count: count ?? 0 } : {}) });
  } catch (error) {
    return handleApiError(error, requestId, { route: "/api/list", method: "POST", moduleSlug });
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: false, detail: "Usa POST con JSON: { moduleSlug, filters, sort, limit, offset }" },
    { status: 405 }
  );
}
