// /apps/web/app/system/modulos/page.tsx
import { seedModulosAction } from "@/actions/seed-modulos";
import { createClient } from "@/lib/supabase/server";
import ModulosTree from "./ModulosTree";
import styles from "./modulos.module.css";
import SeedButton from "./SeedButton";

type ModuloRow = {
  id: string;
  parent_id: string | null;
  nombre: string;
  slug: string;
  tipo: "carpeta" | "tabla" | "subtabla" | "vista";
  orden: number;
  activo: boolean;
  props: any;
};

export type ModuloNode = ModuloRow & { children: ModuloNode[] };

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

  // Construir árbol en memoria
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

  // Opcional: asegurar orden en cada nivel
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
    <main className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Editor de Módulos</h1>
          <p className={styles.subtitle}>Siembras la jerarquía y ves el árbol actual.</p>
        </div>
        <SeedButton />
      </header>
      <section className={styles.treeSection}>
        {tree.length === 0 ? (
          <div className={styles.empty}>
            <p>No hay módulos aún. Pulsa el botón para sembrarlos.</p>
          </div>
        ) : (
          <ModulosTree nodes={tree} />
        )}
      </section>
    </main>
  );
}