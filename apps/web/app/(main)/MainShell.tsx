"use client";

import { useEffect, useState } from "react";
import type { SidebarItem } from "@repo/ui";
import { SidebarWithPerms } from "./SidebarWithPerms";

const SIDEBAR_MINI_STORAGE_KEY = "jiro.sidebar.mini";

export default function MainShell({
  items,
  children,
}: {
  items: SidebarItem[];
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMini, setSidebarMini] = useState(false);
  const [desktopReady, setDesktopReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_MINI_STORAGE_KEY);
      if (saved === "1") setSidebarMini(true);
    } catch {
      // noop
    } finally {
      setDesktopReady(true);
    }
  }, []);

  const toggleSidebarMini = () => {
    setSidebarMini((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_MINI_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // noop
      }
      return next;
    });
  };

  return (
    <>
      <nav className="navbar navbar-dark bg-dark py-0">
        <div className="container-fluid">
          <button
            className="btn btn-outline-light d-lg-none"
            type="button"
            aria-label="Abrir menu"
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
        <div className="main-shell-layout">
          <div className={`main-shell-sidebar d-none d-lg-block ${desktopReady && sidebarMini ? "is-mini" : ""}`}>
            <SidebarWithPerms
              items={items}
              variant="fixed"
              miniMode={desktopReady && sidebarMini}
              onToggleMini={toggleSidebarMini}
            />
          </div>

          <SidebarWithPerms
            items={items}
            variant="drawer"
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            title="Navegacion"
          />

          <main className="main-shell-content flex-grow-1 p-3 p-lg-4">
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
