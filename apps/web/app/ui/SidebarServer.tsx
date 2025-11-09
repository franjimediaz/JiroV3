// app/ui/SidebarServer.tsx
import { createClient } from "@/lib/supabase/server";
import { Sidebar, SidebarItem } from "@repo/ui";

type ModuloRow = {
  id: string;
  nombre: string;
  route: string | null;
  activo: boolean;
  orden: number | null;
  parent_id: string | null;
};

function buildTree(rows: ModuloRow[]): SidebarItem[] {
  const nodesById = new Map<string, SidebarItem>();
  const roots: SidebarItem[] = [];

  for (const r of rows) {
    nodesById.set(r.id, { id: r.id, nombre: r.nombre, route: r.route ?? undefined, hijos: [] });
  }

  for (const r of rows) {
    const node = nodesById.get(r.id)!;
    if (r.parent_id && nodesById.has(r.parent_id)) {
      nodesById.get(r.parent_id)!.hijos!.push(node);
    } else {
      roots.push(node);
    }
  }

  // ordenar hijos por orden -> nombre
  const sortTree = (arr: SidebarItem[]) => {
    arr.sort((a, b) => a.nombre.localeCompare(b.nombre));
    arr.forEach((n) => n.hijos && sortTree(n.hijos));
  };
  sortTree(roots);

  return roots;
}

export default async function SidebarServer({
  variant = "fixed",
  offcanvasId = "sidebarOffcanvas",
}: {
  variant?: "fixed" | "offcanvas";
  offcanvasId?: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modulos")
    .select("id,nombre,route,activo,orden,parent_id")
    //.eq("activo", true)
    .order("orden", { ascending: true });
    

  if (error) {
    return (
      <div className="p-3 text-danger small">Error cargando módulos: {error.message}</div>
    );
  }

  const rows = (data ?? []) as ModuloRow[];
  const items = buildTree(rows);

  return <Sidebar items={items} variant={variant} offcanvasId={offcanvasId} />;
}
