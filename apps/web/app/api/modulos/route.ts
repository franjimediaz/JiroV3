import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ModuloDbRow = {
  id: string;
  title: string;
  slug: string;
  tipo: string;
  parent_id: string | null;
  orden: number | null;
  props: any; // jsonb en Supabase
};

type ModuloNode = ModuloDbRow & { hijos: ModuloNode[] };

export async function GET(req: Request) {
  const supabase = await createClient();
  const url = new URL(req.url);
  const flat = url.searchParams.get("flat") === "1";

  const { data, error } = await supabase
    .from("modulos") // 👈 nombre de tu tabla
    .select("id, nombre, slug, tipo, parent_id, orden, props")
    .order("orden", { ascending: true });

  if (error) {
    console.error("GET /api/modulos error", error);
    return NextResponse.json(
      { ok: false, detail: "Error cargando módulos", code: error.code },
      { status: 500 }
    );
  }

  const parsed: ModuloDbRow[] = (data ?? []).map((m: any) => ({
    ...m,
    props: typeof m.props === "string" ? JSON.parse(m.props) : m.props,
  }));

  if (flat) {
    return NextResponse.json({ ok: true, data: parsed });
  }

  const tree = buildTree(parsed);
  return NextResponse.json({ ok: true, data: tree });
}

// 👇 Versión sin Map, usando un objeto normal (Record) → sin error TS
function buildTree(items: ModuloDbRow[]): ModuloNode[] {
  const byId: Record<string, ModuloNode> = {};

  // Crear nodos
  for (const item of items) {
    byId[item.id] = { ...item, hijos: [] };
  }

  const roots: ModuloNode[] = [];

  // Enlazar padres/hijos
  for (const item of items) {
    const node = byId[item.id];
    if (item.parent_id && byId[item.parent_id]) {
      byId[item.parent_id].hijos.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
