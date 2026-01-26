import { createClient } from "@/lib/supabase/server";

type ResolveArgs = {
  sourceTable: string; // ej: "presupuestos" o la tabla real
  recordId: string;
  // para MVP, allow related resolvers por clave
  related?: Array<{
    key: string;           // nombre en ctx.related[key]
    table: string;         // tabla relacionada
    fkField: string;       // campo que apunta al record principal: presupuestoId, obraId...
  }>;
};

export async function resolvePdfContext(args: ResolveArgs) {
  const supabase = await createClient();

  // 1) Registro principal
  const { data: record, error: e1 } = await supabase
    .from(args.sourceTable)
    .select("*")
    .eq("id", args.recordId)
    .maybeSingle();

  if (e1) throw new Error(`resolvePdfContext: error record: ${e1.message}`);
  if (!record) throw new Error(`resolvePdfContext: record no encontrado (${args.sourceTable} id=${args.recordId})`);

  // 2) Relaciones (opcional)
  const related: Record<string, any[]> = {};
  for (const r of args.related || []) {
    const { data, error } = await supabase
      .from(r.table)
      .select("*")
      .eq(r.fkField, args.recordId);

    if (error) throw new Error(`resolvePdfContext: error related ${r.key}: ${error.message}`);
    related[r.key] = Array.isArray(data) ? data : [];
  }

  // 3) Branding (si tienes tabla)
  // Ajusta el nombre si tu tabla es otra
  const { data: branding } = await supabase
    .from("branding")
    .select("*")
    .limit(1)
    .maybeSingle();

  return {
    record,
    related,
    branding: branding || {},
    now: new Date().toISOString(),
  };
}
