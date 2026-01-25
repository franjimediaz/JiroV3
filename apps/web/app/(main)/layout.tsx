import type { Metadata } from "next";
import localFont from "next/font/local";
import Providers from "../providers";
import { createClient } from "@/lib/supabase/server";
import { PermisosProvider } from "@/lib/perms";
import type { SidebarItem } from "@repo/ui";
import "../globals.css";

import { SidebarWithPerms } from "./SidebarWithPerms"; // ✅ nuevo wrapper client

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
  slug?: string | null;
  tipo?: "carpeta" | "tabla" | "subtabla";
  props?: {
    ui?: {
      icon?: string;
      sidebar?: boolean;
      
    };
  };
};

function buildTree(rows: ModuloRow[]): SidebarItem[] {
  const byId = new Map<string, SidebarItem>();
  const roots: SidebarItem[] = [];

  for (const r of rows) {
    const route = r.route ?? undefined;

    byId.set(r.id, {
      id: r.id,
      nombre: r.nombre,
      slug: r.slug ?? r.id,
      tipo: (r.tipo as any) ?? (route ? "tabla" : "carpeta"),
      sidebar: r.props?.ui?.sidebar ?? false,
      route,
      hijos: [],
      icon: r.props?.ui?.icon ?? undefined,
      // 👇 opcional si quieres ordenar mejor (si SidebarItem lo permite)
      orden: r.orden ?? 9999,
    } as any);
  }

  for (const r of rows) {
    const node = byId.get(r.id)!;

    const parentId = r.parent_id && r.parent_id.trim() !== "" ? r.parent_id : null;

    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.hijos!.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (arr: SidebarItem[]) => {
    arr.sort((a: any, b: any) => {
      const ao = a.orden ?? 9999;
      const bo = b.orden ?? 9999;
      if (ao !== bo) return ao - bo;
      return a.nombre.localeCompare(b.nombre);
    });
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modulos")
    .select("id,nombre,route,activo,orden,parent_id,slug,props,tipo") // ✅ añade slug si existe
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  const items: SidebarItem[] = error ? [] : buildTree((data ?? []) as ModuloRow[]);

  return (
    <PermisosProvider>
      <div className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>
          <nav className="navbar navbar-dark bg-dark">
            <div className="container-fluid">
              <button
                className="btn btn-outline-light d-lg-none"
                type="button"
                data-bs-toggle="offcanvas"
                data-bs-target="#sidebarOffcanvas"
                aria-controls="sidebarOffcanvas"
              ></button>

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

          <div className="container-fluid layout-min-vh">
            <div className="row">
              <div className="col-lg-2 d-none d-lg-block p-0">
                {/* ✅ ahora pasa permisos vía wrapper client */}
                <SidebarWithPerms items={items} variant="fixed" />
              </div>

              {/* Offcanvas (móvil) */}
              <SidebarWithPerms
                items={items}
                variant="drawer"
                offcanvasId="sidebarOffcanvas"
              />

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
