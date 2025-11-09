"use client";

import { usePathname } from "next/navigation";

import SidebarServer from "./SidebarServer";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Oculta el sidebar en login (puedes añadir más rutas si quieres)
  const hideSidebar = pathname === "/login" || pathname?.startsWith("/register");

  return (
    <>
      {!hideSidebar && (
        <>
          {/* Sidebar fijo en escritorio */}
          <div className="col-lg-2 d-none d-lg-block p-0">

            <SidebarServer variant="fixed" />
          </div>

          {/* Sidebar móvil */}

          <SidebarServer variant="offcanvas" offcanvasId="sidebarOffcanvas" />
        </>
      )}

      {/* Contenido principal */}
      <main className={`p-3 p-lg-4 ${hideSidebar ? "col-12" : "col-12 col-lg-10"}`}>
        <div className="bg-white rounded shadow-sm p-3 p-lg-4">{children}</div>
        {!hideSidebar && (
          <footer className="text-center mt-4 mb-2 text-muted small">
            © {new Date().getFullYear()} JiRo v2 · Next.js + Supabase
          </footer>
        )}
      </main>
    </>
  );
}
