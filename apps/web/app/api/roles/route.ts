import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rol")
    .select("id, title, slug")
    .order("title", { ascending: true });

  if (error) {
    console.error("GET /api/roles error", error);
    return NextResponse.json(
      { ok: false, detail: "Error cargando roles" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}
