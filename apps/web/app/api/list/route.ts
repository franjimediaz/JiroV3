// app/api/list/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ListFilterOp = "=" | "!=" | ">" | "<" | "in" | "contains";
type ListFilter = { field: string; op: ListFilterOp; value: any };
type ListSort = { field: string; dir: "asc" | "desc" };

type ListBody = {
  moduleSlug: string; // slug en tabla "modulos"
  filters?: ListFilter[];
  sort?: ListSort[];
  limit?: number;
  offset?: number;
};

// Si tu tabla modulos guarda props como jsonb o string:
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
      return NextResponse.json(
        { ok: false, detail: "moduleSlug es requerido" },
        { status: 400 }
      );
    }

    // 1) Resolver módulo → props.db.table
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
    console.log("[/api/list] props.db=", props?.db);
    const tableName = String(props?.db?.slug || "").trim() || moduleSlug;
        
    if (!tableName) {
        
      return NextResponse.json(
        { ok: false, detail: `El módulo "${moduleSlug}" no tiene props.db.table` },
        { status: 400 }
        
      );
      
    }
    console.log("[/api/list] moduleSlug=", moduleSlug, "tableName=", tableName);

    // 2) Construir query base
    let q = supabase.from(tableName).select("*");

    // 3) Aplicar filtros
    const filters = Array.isArray(body?.filters) ? body.filters : [];
    for (const f of filters) {
      if (!f || typeof f !== "object") continue;

      const field = String((f as any).field || "").trim();
      const op = (f as any).op as ListFilterOp;
      const value = (f as any).value;

      if (!field) continue;

      if (op === "=") q = q.eq(field, value);
      else if (op === "!=") q = q.neq(field, value);
      else if (op === ">") q = q.gt(field, value);
      else if (op === "<") q = q.lt(field, value);
      else if (op === "in") {
        // Supabase espera array
        const arr = Array.isArray(value) ? value : [value];
        q = q.in(field, arr);
      } else if (op === "contains") {
        // Para texto: ilike %value%
        if (value === null || value === undefined) continue;
        q = q.ilike(field, `%${String(value)}%`);
      } else {
        // op desconocido → ignorar
        continue;
      }
    }

    // 4) Aplicar sort
    const sort = Array.isArray(body?.sort) ? body.sort : [];
    for (const s of sort) {
      if (!s || typeof s !== "object") continue;
      const field = String((s as any).field || "").trim();
      const dir = (s as any).dir === "desc" ? "desc" : "asc";
      if (!field) continue;
      q = q.order(field, { ascending: dir === "asc" });
    }

    // 5) Paginación
    const limit = Number.isFinite(limitRaw as any)
      ? Math.max(1, Math.min(200, Number(limitRaw)))
      : 50;

    const offset = Number.isFinite(offsetRaw as any) ? Math.max(0, Number(offsetRaw)) : 0;

    // Supabase range es inclusivo en ambos extremos
    q = q.range(offset, offset + limit - 1);

    // 6) Ejecutar
    const { data, error } = await q;

    if (error) {
      console.error("POST /api/list query error", { tableName, error });
      return NextResponse.json(
        { ok: false, detail: "Error listando datos", code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    console.error("POST /api/list fatal", e);
    return NextResponse.json(
      { ok: false, detail: e?.message || "Error inesperado" },
      { status: 500 }
    );
  }
}

// (Opcional) si alguien llama con GET por error
export async function GET() {
  return NextResponse.json(
    { ok: false, detail: "Usa POST con JSON: { moduleSlug, filters, sort, limit, offset }" },
    { status: 405 }
  );
}
