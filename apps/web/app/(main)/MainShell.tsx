"use client";

import { useCallback, useEffect, useState } from "react";
import type { SidebarItem, SidebarModuleSelection } from "@repo/ui";
import { SidebarWithPerms } from "./SidebarWithPerms";

import { RecordBreadcrumbProvider, RecordBreadcrumbTrail } from "@/lib/RecordBreadcrumb";

const SIDEBAR_MINI_STORAGE_KEY = "jiro.sidebar.mini";
const SIDEBAR_MODULE_STORAGE_KEY = "jiro.sidebar.module";

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
  const [moduleSelection, setModuleSelection] = useState<SidebarModuleSelection | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_MINI_STORAGE_KEY);
      if (saved === "1") setSidebarMini(true);
      const moduleId = window.localStorage.getItem(SIDEBAR_MODULE_STORAGE_KEY);
      if (moduleId) setModuleSelection({ id: moduleId, pathname: "" });
    } catch {
      // noop
    } finally {
      setDesktopReady(true);
    }
  }, []);

  const selectModule = useCallback((selection: SidebarModuleSelection) => {
    setModuleSelection(selection);
    try {
      window.localStorage.setItem(SIDEBAR_MODULE_STORAGE_KEY, selection.id);
    } catch { /* Navigation still works when storage is unavailable. */ }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sidebar-drawer-open", sidebarOpen);
    return () => document.body.classList.remove("sidebar-drawer-open");
  }, [sidebarOpen]);

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
    <RecordBreadcrumbProvider>
      <nav className="navbar navbar-dark bg-dark py-0">
        <div className="container-fluid flex-nowrap gap-2">
          <button
            className="btn btn-outline-light d-lg-none"
            type="button"
            aria-label="Abrir menu"
            aria-expanded={sidebarOpen}
            aria-controls="mobile-sidebar-drawer"
            onClick={(event) => {
              event.stopPropagation();
              setSidebarOpen(true);
            }}
          >
            ☰
          </button>

          <a className="navbar-brand ms-lg-2 d-flex align-items-center" href="/">
            <img
              src="/mylogo2.png"
              alt="JiRo v3"
              height="90"
              style={{ objectFit: "contain", width: "auto" }}
              className="d-inline-block align-text-top"
            />
          </a>
          <RecordBreadcrumbTrail />
        </div>
      </nav>

        <div className="main-shell-layout layout-min-vh">
          <div className={`main-shell-sidebar d-none d-lg-block ${desktopReady && sidebarMini ? "is-mini" : ""}`}>
            <SidebarWithPerms
              items={items}
              variant="fixed"
              moduleSelection={moduleSelection}
              onModuleChange={selectModule}
              miniMode={desktopReady && sidebarMini}
              onToggleMini={toggleSidebarMini}
            />
          </div>

          <SidebarWithPerms
            items={items}
            variant="drawer"
            moduleSelection={moduleSelection}
            onModuleChange={selectModule}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            title=""
          />

          <main className="main-shell-content flex-grow-1">
            {children}
            <footer className="text-center mt-auto pt-3 text-muted small">
              © {new Date().getFullYear()} JiRo v3
            </footer>
          </main>
        </div>
    </RecordBreadcrumbProvider>
  );
}
