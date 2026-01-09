// app/api/modules/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ModuleSchemaLike = {
  db?: {
    table?: string;
    primaryKey?: string;
    softDelete?: boolean;
  };
  ui?: any;
  fields?: any[];
};

function parseProps(raw: any): ModuleSchemaLike {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as ModuleSchemaLike;
    } catch {
      return {};
    }
  }
  return raw as ModuleSchemaLike;
}

export async function GET() {
  const supabase = await createClient();

  // Ajusta columnas si tu tabla tiene nombres distintos
  const { data, error } = await supabase
    .from("modulos")
    .select("slug, tipo, props, activo, orden");

  if (error) {
    return NextResponse.json(
      { error: error.message, details: (error as any)?.details, hint: (error as any)?.hint },
      { status: 500 }
    );
  }

  const modules = (data || []).map((m: any) => {
    const props = parseProps(m.props);

    return {
      slug: m.slug,
      tipo: m.tipo,
      activo: m.activo,
      orden: m.orden,
      db: {
        table: props?.db?.table ?? m.slug,       // fallback: slug como tabla
        primaryKey: props?.db?.primaryKey ?? "id",
        softDelete: props?.db?.softDelete ?? false,
      },
      // Si quieres exponer más cosas, descomenta:
      // ui: props?.ui,
      // fieldsCount: Array.isArray(props?.fields) ? props.fields.length : 0,
    };
  });

  // Evita caché (útil porque estás editando módulos dinámicamente)
  return NextResponse.json(modules, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
