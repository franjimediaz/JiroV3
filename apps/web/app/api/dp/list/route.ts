import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CANDIDATE_MODULE_TABLES = ["modulos", "modulos_config"];
const CANDIDATE_TABLE_FIELDS = ["table", "tabla", "table_name", "resource", "tabla_real","slug"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const moduleSlug = searchParams.get("moduleSlug") || "";
  const q = searchParams.get("q") || "";
  const limit = Number(searchParams.get("limit") || "30");
  const displayField = searchParams.get("displayField") || "name";

  if (!moduleSlug) {
    return NextResponse.json({ error: "moduleSlug requerido" }, { status: 400 });
  }

  const supabase = await createClient();

  // 1) Encontrar tabla real a partir del módulo
  let tableName: string | null = null;
  let lastErr: any = null;

  for (const modulesTable of CANDIDATE_MODULE_TABLES) {
    for (const tableField of CANDIDATE_TABLE_FIELDS) {
      const { data, error } = await supabase
        .from(modulesTable)
        .select(`${tableField}`)
        .eq("slug", moduleSlug)
        .maybeSingle();

      if (error) {
        lastErr = error;
        continue;
      }

      const candidate = (data as any)?.[tableField];
      if (typeof candidate === "string" && candidate.trim()) {
        tableName = candidate.trim();
        break;
      }
    }
    if (tableName) break;
  }

  if (!tableName) {
    return NextResponse.json(
      {
        error: {
          message: `No se pudo resolver la tabla del módulo '${moduleSlug}'. Revisa en Supabase si existe una tabla 'modulos'/'modulos_config' con columnas tipo: ${CANDIDATE_TABLE_FIELDS.join(
            ", "
          )}.`,
          lastErr,
        },
      },
      { status: 400 }
    );
  }
  // Normaliza/sanitiza nombre de tabla
tableName = String(tableName).trim();

// Si viene con schema (public.customers), quítalo
tableName = tableName.replace(/^public\./i, "");

// Si viene entre comillas, quítalas
tableName = tableName.replace(/^"+|"+$/g, "");

// Seguridad: solo permitir nombres simples
if (!/^[a-z0-9_]+$/i.test(tableName)) {
  return NextResponse.json(
    { error: `Nombre de tabla inválido tras normalizar: '${tableName}'` },
    { status: 400 }
  );
}

// DEBUG temporal (para ver exactamente qué llega)
console.log("[dp/list] resolved tableName:", JSON.stringify(tableName));

  // 2) Consultar registros de la tabla real
  let query = supabase.from(tableName).select("*").limit(limit);

  if (q.trim()) {
    query = query.ilike(displayField, `%${q.trim()}%`);
  }

  const { data, error } = await query;
    console.log("[dp/list] moduleSlug:", moduleSlug, "=> tableName:", tableName);
  if (error) {
    return NextResponse.json({tableName, error }, { status: 500 });
  }

  return NextResponse.json({tableName, data });
  
}

