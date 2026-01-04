import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const proyectoId = searchParams.get("proyectoId");
  const start = searchParams.get("start"); // ISO string
  const end = searchParams.get("end");     // ISO string

  if (!proyectoId) {
    return NextResponse.json({ ok: false, detail: "proyectoId requerido" }, { status: 400 });
  }

  const supabase = await createClient();

  let q = supabase
    .from("task") // ajusta si tu tabla se llama distinto
    .select("id,title,obraId,from,dateto,service,total")
    .eq("obraId", proyectoId)
    .order("from", { ascending: true });

  // ✅ filtro por solape con rango
  // tarea si: from <= end AND dateto >= start
  if (start && end) {
    q = q.lte("from", end).gte("dateto", start);
  }

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ ok: false, detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: data ?? [] });
}
