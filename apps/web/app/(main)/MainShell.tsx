"use client";

import { useState } from "react";
import type { SidebarItem } from "@repo/ui";
import { SidebarWithPerms } from "./SidebarWithPerms";

export default function MainShell({
  items,
  children,
}: {
  items: SidebarItem[];
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <nav className="navbar navbar-dark bg-dark py-0">
        <div className="container-fluid">
          {/* ✅ ahora abre con React */}
          <button
            className="btn btn-outline-light d-lg-none"
            type="button"
            aria-label="Abrir menú"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
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

      <div className="container-fluid layout-min-vh">
        <div className="row">
          {/* Desktop */}
          <div className="col-lg-2 d-none d-lg-block p-0">
            <SidebarWithPerms items={items} variant="fixed" />
          </div>

          {/* Móvil Drawer */}
          <SidebarWithPerms
            items={items}
            variant="drawer"
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            title="Navegación"
          />

          <main className="col-12 col-lg-10 p-3 p-lg-4">
            <div className="bg-white rounded shadow-sm p-3 p-lg-4">{children}</div>
            <footer className="text-center mt-4 mb-2 text-muted small">
              © {new Date().getFullYear()} JiRo v2 · Next.js + Supabase
            </footer>
          </main>
        </div>
      </div>
    </>
  );
}
