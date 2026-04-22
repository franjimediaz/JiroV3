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

type ListFilter = QueryFilter;
type ListSort = { field: string; dir: "asc" | "desc" };

type ListBody = {
  moduleSlug: string;
  filters?: ListFilter[];
  sort?: ListSort[];
  limit?: number;
  offset?: number;
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
  try {
    const supabase = await createClient();

    const body = (await req.json()) as ListBody;
    const moduleSlug = String(body?.moduleSlug || "").trim();
    const limitRaw = body?.limit;
    const offsetRaw = body?.offset;

    if (!moduleSlug) {
      return NextResponse.json({ ok: false, detail: "moduleSlug es requerido" }, { status: 400 });
    }

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

    let q = supabase.from(tableName).select("*");
    if (defaultFilters.canQueryDirectly) {
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
      q = q.order(field, { ascending: dir === "asc" });
    }

    const limit = Number.isFinite(limitRaw as any) ? Math.max(1, Math.min(200, Number(limitRaw))) : 50;
    const offset = Number.isFinite(offsetRaw as any) ? Math.max(0, Number(offsetRaw)) : 0;
    q = q.range(offset, offset + limit - 1);

    const { data, error } = await q;
    if (error) {
      console.error("POST /api/list query error", { tableName, error });
      return NextResponse.json(
        { ok: false, detail: "Error listando datos", code: error.code },
        { status: 500 }
      );
    }

    const rows = defaultFilters.canQueryDirectly ? data ?? [] : filterRowsWithDefaultFilters(data ?? [], defaultFilters.group);
    return NextResponse.json({ ok: true, data: rows });
  } catch (error: any) {
    console.error("POST /api/list fatal", error);
    return NextResponse.json(
      { ok: false, detail: error?.message || "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: false, detail: "Usa POST con JSON: { moduleSlug, filters, sort, limit, offset }" },
    { status: 405 }
  );
}
