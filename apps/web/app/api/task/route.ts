
// app/api/task/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const proyectoId = searchParams.get("proyectoId");
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!proyectoId) return NextResponse.json({ ok: false, detail: "proyectoId requerido" }, { status: 400 });

  await requireModulePermission("task", "ver");
  const supabase = await createClient();

  let q = supabase
    .from("task")
    
    .select(`
      id,title,obraId,from,dateto,service,responsible,
      services:service ( id, title, color ),
      users:responsible ( uid, name )
    `)
    .eq("obraId", proyectoId)
    .order("from", { ascending: true });

  if (start && end) q = q.lte("from", end).gte("dateto", start);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, detail: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data: data ?? [] });
}
