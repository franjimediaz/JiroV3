import type { Metadata } from "next";
import localFont from "next/font/local";
import Providers from "../providers";
import { createClient } from "@/lib/supabase/server";
import { PermisosProvider } from "@/lib/perms";
import type { SidebarItem } from "@repo/ui";
import "../globals.css";
import MainShell from "./MainShell";

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
        <MainShell items={items}>{children}</MainShell>
      </Providers>
    </div>
  </PermisosProvider>
);
}
