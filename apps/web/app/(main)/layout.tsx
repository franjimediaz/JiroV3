import type { Metadata } from "next";
import localFont from "next/font/local";
import Providers from "../providers";
import { createClient } from "@/lib/supabase/server";
import { PermisosProvider } from "@/lib/perms";
import type { SidebarItem } from "@repo/ui";
import "../globals.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import { Sidebar } from "@repo/ui"; // cliente puro

const geistSans = localFont({
  src: "../fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "../fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "JiRo Web",
  description: "JiRo v2 Web Application",
};

type ModuloRow = {
  id: string;
  nombre: string;
  route: string | null;
  activo: boolean;
  orden: number | null;
  parent_id: string | null;
  props?: { ui?: { icon?: string } };
};

function buildTree(rows: ModuloRow[]): SidebarItem[] {
  const byId = new Map<string, SidebarItem>();
  const roots: SidebarItem[] = [];

  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      nombre: r.nombre,
      route: r.route || `/${r.id}`,
      hijos: [],
      icon: r.props?.ui?.icon ?? undefined,
    });
  }

  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_id && byId.has(r.parent_id)) {
      byId.get(r.parent_id)!.hijos!.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (arr: SidebarItem[]) => {
    arr.sort((a, b) => a.nombre.localeCompare(b.nombre));
    arr.forEach((n) => n.hijos && sortTree(n.hijos));
  };

  sortTree(roots);
  return roots;
}

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch de módulos en SERVER (aquí sí puedes usar next/headers vía createClient)
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modulos")
    .select("id,nombre,route,activo,orden,parent_id,props")
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  const items: SidebarItem[] = error ? [] : buildTree((data ?? []) as ModuloRow[]);

  return (
    <PermisosProvider>
    <div className={`${geistSans.variable} ${geistMono.variable}`}>
      <Providers>
        {/* NAV SUPERIOR */}
        <nav className="navbar navbar-dark bg-dark">
          <div className="container-fluid">
            <button
              className="btn btn-outline-light d-lg-none"
              type="button"
              data-bs-toggle="offcanvas"
              data-bs-target="#sidebarOffcanvas"
              aria-controls="sidebarOffcanvas"
            >
            
            </button>
            
            <a className="navbar-brand ms-lg-2 d-flex align-items-center" href="/">
                <img
                  src="/mylogo2.png"
                  alt="JiRo v2"
                  height="90"
                  style={{ objectFit: "contain", width: "auto" }}
                  
                  className="d-inline-block align-text-top"
                />
              </a>
          </div>
        </nav>

        {/* LAYOUT con sidebar */}
        <div className="container-fluid layout-min-vh">
          <div className="row">
            {/* Sidebar fijo (desktop) */}
            <div className="col-lg-2 d-none d-lg-block p-0">
              {/* client component, pero se puede renderizar desde server */}

              <Sidebar items={items} variant="fixed"  />
            </div>

            {/* Offcanvas (móvil) */}
            <Sidebar
              items={items}
              variant="offcanvas"
              offcanvasId="sidebarOffcanvas"
              
            />

            {/* Contenido */}
            <main className="col-12 col-lg-10 p-3 p-lg-4">
              <div className="bg-white rounded shadow-sm p-3 p-lg-4">{children}</div>
              <footer className="text-center mt-4 mb-2 text-muted small">
                © {new Date().getFullYear()} JiRo v2 · Next.js + Supabase
              </footer>
            </main>
          </div>
        </div>
      </Providers>
    </div>
    </PermisosProvider>
  );
}
