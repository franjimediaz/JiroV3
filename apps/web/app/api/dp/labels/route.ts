import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const table = String(body?.table || "");
    const labelField = String(body?.labelField || "nombre");
    const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];

    if (!table || ids.length === 0) {
      return NextResponse.json({ ok: true, map: {} });
    }

    const supabase = await createClient();

    // Seguridad mínima: evita inyecciones raras por nombre de tabla
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
      return NextResponse.json({ ok: false, error: "Tabla inválida" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(labelField)) {
      return NextResponse.json({ ok: false, error: "labelField inválido" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(table)
      .select(`id,${labelField}`)
      .in("id", ids);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    const map: Record<string, string> = {};
    for (const row of data || []) {
      const id = String((row as any).id);
      const label = (row as any)[labelField];
      map[id] = label == null ? id : String(label);
    }

    return NextResponse.json({ ok: true, map });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
