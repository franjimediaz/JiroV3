"use client";

import { useCallback, useEffect, useState } from "react";
import type { SidebarItem, SidebarModuleSelection } from "@repo/ui";
import { SidebarWithPerms } from "./SidebarWithPerms";

import {
  RecordBreadcrumbProvider,
  RecordBreadcrumbTrail,
} from "@/lib/RecordBreadcrumb";

const SIDEBAR_MINI_STORAGE_KEY = "Orymexa.sidebar.mini";
const SIDEBAR_MODULE_STORAGE_KEY = "Orymexa.sidebar.module";

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
  const [moduleSelection, setModuleSelection] =
    useState<SidebarModuleSelection | null>(null);

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
    } catch {
      /* Navigation still works when storage is unavailable. */
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sidebar-drawer-open", sidebarOpen);
    return () => document.body.classList.remove("sidebar-drawer-open");
  }, [sidebarOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 769px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setSidebarOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
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
    <RecordBreadcrumbProvider>
      <div className="main-shell-layout">
        <div
          className={`main-shell-sidebar ${desktopReady && sidebarMini ? "is-mini" : ""}`}
        >
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

        <div className="main-shell-right">
          <nav className="main-shell-topbar navbar navbar-dark bg-background py-0">
            <div className="container-fluid flex-nowrap gap-2">
              <button
                className="btn btn-outline-dark main-shell-menu-toggle"
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

              <RecordBreadcrumbTrail />
            </div>
          </nav>

          <main className="main-shell-content flex-grow-1">
            {children}
            <footer className="text-center mt-auto pt-3 text-muted small">
              © {new Date().getFullYear()} Orymexa v3
            </footer>
          </main>
        </div>
      </div>
    </RecordBreadcrumbProvider>
  );
}
