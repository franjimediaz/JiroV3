import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveModuleConfig } from "@/lib/modules/resolveModuleConfig";

const ALLOWED_AGG_OPS = new Set(["sum", "avg", "min", "max", "count"]);
const ALLOWED_WHERE_OPS = new Set(["=", "!=", ">", "<", ">=", "<=", "in"]);

type WhereCond = { field: string; op: string; value: any };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const moduleSlug = String(body?.moduleSlug || "").trim();
    const legacySourceTable = String(body?.sourceTable || body?.table || "").trim();
    const field = String(body?.field || "").trim();
    const op = String(body?.op || "").toLowerCase();
    const where: WhereCond[] = Array.isArray(body?.where) ? body.where : [];

    if ((!moduleSlug && !legacySourceTable) || !field || !op) {
      return NextResponse.json({ ok: false, detail: "moduleSlug/sourceTable, field y op requeridos" }, { status: 400 });
    }
    if (!ALLOWED_AGG_OPS.has(op)) {
      return NextResponse.json({ ok: false, detail: `op invalido: ${op}` }, { status: 400 });
    }

    const resolved = await resolveModuleConfig(moduleSlug || legacySourceTable);
    if (!resolved.table) {
      return NextResponse.json({ ok: false, detail: "Este modulo no es un modulo de datos" }, { status: 400 });
    }
    if (legacySourceTable && legacySourceTable !== resolved.table && legacySourceTable !== resolved.slug) {
      return NextResponse.json({ ok: false, detail: `sourceTable legacy no permitido: ${legacySourceTable}` }, { status: 400 });
    }

    const declaredFields = new Set((resolved.schema.fields || []).map((schemaField) => schemaField.name));
    if (op !== "count" && !declaredFields.has(field)) {
      return NextResponse.json({ ok: false, detail: `Campo no declarado en schema: ${field}` }, { status: 400 });
    }

    const validWhere = where.filter((condition) => {
      const whereField = String(condition?.field || "").trim();
      const whereOp = String(condition?.op || "").toLowerCase();
      return !!whereField && declaredFields.has(whereField) && ALLOWED_WHERE_OPS.has(whereOp);
    });

    const supabase = await createClient();
    let query = supabase.from(resolved.table).select(op === "count" ? resolved.primaryKey : field);

    for (const condition of validWhere) {
      const whereField = String(condition.field).trim();
      const whereOp = String(condition.op).toLowerCase();
      const whereValue = condition.value;

      if (whereOp === "=") query = query.eq(whereField, whereValue);
      else if (whereOp === "!=") query = query.neq(whereField, whereValue);
      else if (whereOp === ">") query = query.gt(whereField, whereValue);
      else if (whereOp === "<") query = query.lt(whereField, whereValue);
      else if (whereOp === ">=") query = query.gte(whereField, whereValue);
      else if (whereOp === "<=") query = query.lte(whereField, whereValue);
      else if (whereOp === "in") query = query.in(whereField, Array.isArray(whereValue) ? whereValue : []);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[/api/aggregate] supabase error:", error);
      return NextResponse.json({ ok: false, detail: error.message, hint: (error as any).hint, code: (error as any).code }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data : [];
    let value = 0;

    if (op === "count") {
      value = rows.length;
    } else {
      const nums = rows.map((row: any) => Number(row?.[field] ?? 0)).filter((num) => Number.isFinite(num));
      if (op === "sum") value = nums.reduce((a, b) => a + b, 0);
      else if (op === "avg") value = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      else if (op === "min") value = nums.length ? Math.min(...nums) : 0;
      else if (op === "max") value = nums.length ? Math.max(...nums) : 0;
    }

    return NextResponse.json({ ok: true, value, legacyTableAccepted: !!legacySourceTable && !moduleSlug });
  } catch (e: any) {
    console.error("[/api/aggregate] crash:", e);
    return NextResponse.json({ ok: false, detail: e?.message || "Error interno" }, { status: 500 });
  }
}
