// app/ui/SidebarServer.tsx
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@repo/ui";
import type { SidebarItem } from "@repo/ui";

type ModuloRow = {
  id: string;
  nombre: string;
  slug: string;
  route: string | null;
  activo: boolean;
  orden: number | null;
  parent_id: string | null;
  props: any; // puede venir objeto o string JSON
};

function safeParseProps(raw: any): any {
  try {
    if (!raw) return {};
    if (typeof raw === "string") return JSON.parse(raw);
    if (typeof raw === "object") return raw;
    return {};
  } catch {
    return {};
  }
}

function pickIcon(props: any): string | undefined {
  const p = safeParseProps(props);
  return p?.ui?.icon || p?.icon || undefined;
}

function buildTree(rows: ModuloRow[]): SidebarItem[] {
  const nodesById = new Map<string, SidebarItem>();
  const roots: SidebarItem[] = [];

  // 1) Crear nodos
  for (const r of rows) {
    nodesById.set(r.id, {
      id: r.id,
      slug: r.slug,
      nombre: r.nombre,
      route: r.route || "", // si tu Sidebar tolera "", mejor que null
      icon: pickIcon(r.props),
      orden: r.orden ?? null,
      hijos: [],
    } as any);
  }

  // 2) Colgar hijos
  for (const r of rows) {
    const node = nodesById.get(r.id)!;
    if (r.parent_id && nodesById.has(r.parent_id)) {
      nodesById.get(r.parent_id)!.hijos!.push(node);
    } else {
      roots.push(node);
    }
  }

  // 3) Ordenar: orden -> nombre
  const cmp = (a: any, b: any) => {
    const ao = a.orden ?? Number.POSITIVE_INFINITY;
    const bo = b.orden ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    return String(a.nombre).localeCompare(String(b.nombre));
  };

  const sortTree = (arr: SidebarItem[]) => {
    arr.sort(cmp);
    arr.forEach((n) => n.hijos && sortTree(n.hijos));
  };
  sortTree(roots);

  return roots;
}

export default async function SidebarServer({
  variant = "fixed",
  
  onlyActive = true,
}: {
  variant?: "fixed" | "drawer";
  
  onlyActive?: boolean;
}) {
  const supabase = await createClient();

  let q = supabase
    .from("modulos")
    .select("id,nombre,slug,route,activo,orden,parent_id,props")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (onlyActive) q = q.eq("activo", true);

  const { data, error } = await q;

  if (error) {
    return (
      <div className="p-3 text-danger small">
        Error cargando módulos: {error.message}
      </div>
    );
  }

  const rows = (data ?? []) as ModuloRow[];
  const items = buildTree(rows);

  return <Sidebar items={items} variant={variant} />;
}
