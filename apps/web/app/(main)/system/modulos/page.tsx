// /apps/web/app/system/modulos/page.tsx
import { createClient } from "@/lib/supabase/server";
import { RequirePerms } from "@/lib/perms";
import PageClient from "./PageClient";
import type { ModuloNode, ModuloRow } from "@repo/types";



async function fetchModulosTree(): Promise<ModuloNode[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("modulos")
    .select("id,parent_id,nombre,slug,tipo,orden,activo,props")
    .order("parent_id", { ascending: true })
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error cargando módulos:", error);
    return [];
  }

  const rows = (data ?? []) as ModuloRow[];

  // Construir árbol
  const byId = new Map<string, ModuloNode>();
  const roots: ModuloNode[] = [];

  for (const r of rows) byId.set(r.id, { ...r, children: [] });
  for (const n of byId.values()) {
    if (n.parent_id && byId.has(n.parent_id)) {
      byId.get(n.parent_id)!.children.push(n);
    } else {
      roots.push(n);
    }
  }

  const sortLevel = (nodes: ModuloNode[]) => {
    nodes.sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre));
    nodes.forEach((c) => sortLevel(c.children));
  };
  sortLevel(roots);

  return roots;
}

export default async function ModulosAdminPage() {
  const tree = await fetchModulosTree();

  return (
    <RequirePerms modulo="modulos" accion="ver">
      <main className="container-fluid p-4">
        <header className="header mb-4 d-flex align-items-center justify-content-between">
          <div>
            <h1 className="titlem">Editor de Módulos</h1>
            <p className="subtitle">Configuración de módulos y tablas</p>
          </div>
        </header>

        <section className="treeSection">
          <PageClient nodes={tree} />
        </section>
      </main>
    </RequirePerms>
  );
}
