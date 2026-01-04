import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"; // ajusta si tu path difiere

const ALLOWED_AGG_OPS = new Set(["sum", "avg", "min", "max", "count"]);
const ALLOWED_WHERE_OPS = new Set(["=", "!=", ">", "<", ">=", "<=", "in"]);

type WhereCond = { field: string; op: string; value: any };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    console.log("[/api/aggregate] body:", body);

    const sourceTable = body?.sourceTable;
    const field = body?.field;
    const op = String(body?.op || "").toLowerCase();
    const where: WhereCond[] = Array.isArray(body?.where) ? body.where : [];

    if (!sourceTable || !field || !op) {
      return NextResponse.json(
        { ok: false, detail: "sourceTable/field/op requeridos" },
        { status: 400 }
      );
    }
    if (!ALLOWED_AGG_OPS.has(op)) {
      return NextResponse.json(
        { ok: false, detail: `op inválido: ${op}` },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Traemos solo el campo necesario
    let query = supabase.from(sourceTable).select(field);

    // AND filters
    for (const c of where) {
      const wField = c?.field;
      const wOp = String(c?.op || "").toLowerCase();
      const wVal = c?.value;

      if (!wField || !ALLOWED_WHERE_OPS.has(wOp)) continue;

      if (wOp === "=") query = query.eq(wField, wVal);
      else if (wOp === "!=") query = query.neq(wField, wVal);
      else if (wOp === ">") query = query.gt(wField, wVal);
      else if (wOp === "<") query = query.lt(wField, wVal);
      else if (wOp === ">=") query = query.gte(wField, wVal);
      else if (wOp === "<=") query = query.lte(wField, wVal);
      else if (wOp === "in") query = query.in(wField, Array.isArray(wVal) ? wVal : []);
    }

    const { data, error } = await query;

    // 👇 ESTE es el error real (antes se te quedaba oculto)
    if (error) {
      console.error("[/api/aggregate] supabase error:", error);
      return NextResponse.json(
        { ok: false, detail: error.message, hint: (error as any).hint, code: (error as any).code },
        { status: 500 }
      );
    }

    const rows = Array.isArray(data) ? data : [];

    let value = 0;

    if (op === "count") {
      value = rows.length;
    } else {
      const nums = rows
        .map((r: any) => Number(r?.[field] ?? 0))
        .filter((n) => Number.isFinite(n));

      if (op === "sum") value = nums.reduce((a, b) => a + b, 0);
      else if (op === "avg") value = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      else if (op === "min") value = nums.length ? Math.min(...nums) : 0;
      else if (op === "max") value = nums.length ? Math.max(...nums) : 0;
    }

    return NextResponse.json({ ok: true, value });
  } catch (e: any) {
    console.error("[/api/aggregate] crash:", e);
    return NextResponse.json(
      { ok: false, detail: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
