import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveModuleConfig } from "@/lib/modules/resolveModuleConfig";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const moduleSlug = searchParams.get("moduleSlug") || "";
  const q = searchParams.get("q") || "";
  const limit = Math.min(Number(searchParams.get("limit") || "30"), 100);
  const displayField = searchParams.get("displayField") || "name";

  if (!moduleSlug) {
    return NextResponse.json({ error: "moduleSlug requerido" }, { status: 400 });
  }

  const resolved = await resolveModuleConfig(moduleSlug);
  if (!resolved.table) {
    return NextResponse.json({ error: "Este modulo no es un modulo de datos" }, { status: 400 });
  }
  const declaredFields = new Set((resolved.schema.fields || []).map((field) => field.name));
  const selectedDisplayField = declaredFields.has(displayField) ? displayField : resolved.displayField || "id";

  if (!declaredFields.has(selectedDisplayField) && selectedDisplayField !== resolved.primaryKey && selectedDisplayField !== "id") {
    return NextResponse.json(
      { error: `displayField no declarado en schema: ${displayField}` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  let query = supabase.from(resolved.table).select("*").limit(limit);

  if (q.trim()) {
    query = query.ilike(selectedDisplayField, `%${q.trim()}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ tableName: resolved.table, error }, { status: 500 });
  }

  return NextResponse.json({ tableName: resolved.table, moduleSlug: resolved.slug, data });
}
