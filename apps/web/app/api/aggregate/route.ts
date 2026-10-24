import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveModuleConfig } from "@/lib/modules/resolveModuleConfig";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";
import { handleApiError } from "@/lib/auth/handleApiError";
import { getFieldRefValue, normalizeFieldRef, type FieldRefLike, type QueryFilter } from "@repo/types";
import { applyFieldRefFilters, buildFieldRefSelect } from "@/lib/fields/fieldRefQuery";
import { resolveFieldRefs } from "@/lib/fields/resolveFieldRef";

const ALLOWED_AGG_OPS = new Set(["sum", "avg", "min", "max", "count"]);
const ALLOWED_WHERE_OPS = new Set(["=", "!=", ">", "<", ">=", "<=", "in"]);

type WhereCond = { field: FieldRefLike; op: string; value: any };

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let moduleSlugForLog = "";

  try {
    const body = await req.json().catch(() => ({}));
    const moduleSlug = String(body?.moduleSlug || "").trim();
    const legacySourceTable = String(body?.sourceTable || body?.table || "").trim();
    const field = normalizeFieldRef(body?.field);
    const op = String(body?.op || "").toLowerCase();
    const where: WhereCond[] = Array.isArray(body?.where) ? body.where : [];
    moduleSlugForLog = moduleSlug || legacySourceTable;

    if ((!moduleSlug && !legacySourceTable) || !field.field || !op) {
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
    await requireModulePermission(resolved.permissionsKey, "ver");

    const validWhere = where.filter((condition) => normalizeFieldRef(condition?.field).field && ALLOWED_WHERE_OPS.has(String(condition?.op || "").toLowerCase()));
    const refs = [field, ...validWhere.map(condition => condition.field)];
    const resolvedRefs = await resolveFieldRefs(resolved.slug, refs);
    const valueRef = resolvedRefs[0]!;
    if (op !== "count" && !["number", "money", "percent"].includes(valueRef.fieldSchema.type) && ["sum", "avg"].includes(op)) {
      return NextResponse.json({ ok: false, detail: "La agregacion requiere un campo numerico" }, { status: 400 });
    }

    const supabase = await createClient();
    const relationSelect = buildFieldRefSelect(op === "count" ? [] : [valueRef], resolvedRefs.slice(1));
    const directValue = !valueRef.relations.length && op !== "count" ? valueRef.field : resolved.primaryKey;
    let query = supabase.from(resolved.table).select([directValue, ...relationSelect].join(","));
    const queryFilters: QueryFilter[] = validWhere.map(condition => ({
      field: condition.field,
      op: condition.op as QueryFilter["op"],
      value: condition.value,
    }));
    query = applyFieldRefFilters(query, queryFilters, resolvedRefs.slice(1));

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
      const nums = rows.map((row: any) => Number(getFieldRefValue(row, field) ?? 0)).filter((num) => Number.isFinite(num));
      if (op === "sum") value = nums.reduce((a, b) => a + b, 0);
      else if (op === "avg") value = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      else if (op === "min") value = nums.length ? Math.min(...nums) : 0;
      else if (op === "max") value = nums.length ? Math.max(...nums) : 0;
    }

    return NextResponse.json({ ok: true, value, legacyTableAccepted: !!legacySourceTable && !moduleSlug });
  } catch (e: any) {
    return handleApiError(e, requestId, { route: "/api/aggregate", method: "POST", moduleSlug: moduleSlugForLog });
  }
}
