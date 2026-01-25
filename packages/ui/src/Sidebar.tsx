"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { SidebarItem } from "./types";
import { isActive, isBranchActive,isExactActive } from "./utils";

export type SidebarVariant = "fixed" | "drawer";

export function Sidebar({
  items,
  title = "Navegación",
  variant = "fixed",
  isOpen = false,
  onClose,
  canView, // ✅ NUEVO: se inyecta desde fuera
}: {
  items: SidebarItem[];
  title?: string;
  variant?: SidebarVariant;
  isOpen?: boolean
  onClose?: () => void;
  icon?: string;
  canView?: (slug: string) => boolean; // true si puede VER ese slug
}) {
  
  const pathname = usePathname();
    // ✅ cerrar con ESC en drawer
  useEffect(() => {
    if (variant !== "drawer" || !isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, isOpen, onClose]);

  // ✅ cerrar al navegar
  useEffect(() => {
    if (variant === "drawer" && isOpen) onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);


  // 1) Calculamos qué nodos deben estar abiertos por contener la ruta activa
  // ✅ Respeta permisos y sidebar=true (promueve hijos)
  const activeSet = useMemo(() => {
    const set = new Set<string>();
    

    const visit = (n: SidebarItem): boolean => {
      // ✅ Permisos: si no puede ver, no cuenta para activos ni expansión
      const hasChildren = (n.hijos?.length ?? 0) > 0;

  const isFolder =
    n.tipo === "carpeta" ||
    (hasChildren && (!n.route || n.route.trim() === ""));

  // ✅ Permisos SOLO para tablas/subtablas
  if (!isFolder) {
    if (canView && !canView(n.slug)) return false;
  }

  // ✅ sidebar=true => el nodo no cuenta, pero visitar hijos
  if (n.sidebar === true) {
    return (n.hijos ?? []).some(visit);
  }

  const here = n.route ? isActive(pathname, n.route) : false;
  const childActive = (n.hijos ?? []).some(visit);

  if (here || childActive) set.add(n.id);
  return here || childActive;
};

    items.forEach(visit);
    return set;
  }, [items, pathname, canView]);

  // 2) Estado real de expansión
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOpenSet(new Set(activeSet));
  }, [activeSet]);

  const toggleNode = (id: string) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tree = (
    <NavTree
      nodes={items}
      openSet={openSet}
      toggleNode={toggleNode}
      activeSet={activeSet}
      canView={canView} // ✅ pásalo a NavTree/NavItem
    />
  );

  if (variant === "drawer") {
      return (
      <>
        {/* Overlay */}
        <div
          className={`sidebarOverlay ${isOpen ? "show" : ""}`}
          onClick={() => onClose?.()}
        />

        {/* Panel */}
        <aside className={`sidebarDrawer ${isOpen ? "open" : ""}`}>
          <div className="sidebarDrawerHeader">
            <h5 className="m-0">{title}</h5>

            <button
              type="button"
              className="btnClose"
              onClick={() => onClose?.()}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="sidebarDrawerBody">
            <NavTree
              nodes={items}
              openSet={openSet}
              toggleNode={toggleNode}
              activeSet={activeSet}
              canView={canView}
              onNavigate={onClose} // ✅ cierra al clicar en link
            />
          </div>

          <div className="sidebarDrawerFooter">
            <SidebarUser />
          </div>
        </aside>
      </>
    );
  }

  // fixed
  return (
    <aside className="bg-body-primary border-end h-100">
      <div className="p-4 sidebar-sticky">
        <h6 className="text-uppercase text-dark mb-3">{title}</h6>
        {tree}
      </div>
      <SidebarUser />
    </aside>
  );
}



function NavTree({
  nodes,
  openSet,
  toggleNode,
  activeSet,
  offcanvasDismiss = false,
  canView,
  onNavigate,
}: {
  nodes: SidebarItem[];
  openSet: Set<string>;
  toggleNode: (id: string) => void;
  activeSet: Set<string>;
  offcanvasDismiss?: boolean;
  canView?: (slug: string) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <ul className="nav flex-column">
      {nodes.map((n) => (
        <NavItem
          key={n.id}
          node={n}
          openSet={openSet}
          toggleNode={toggleNode}
          activeSet={activeSet}
          offcanvasDismiss={offcanvasDismiss}
          level={0}
          canView={canView}
        />
      ))}
    </ul>
  );
}




function NavItem({
  node,
  openSet,
  toggleNode,
  activeSet,
  offcanvasDismiss,
  level,
  canView, // ✅ inyectado desde el Sidebar (no hooks aquí)
}: {
  node: SidebarItem;
  openSet: Set<string>;
  toggleNode: (id: string) => void;
  activeSet: Set<string>;
  offcanvasDismiss: boolean;
  level: number;
  canView?: (slug: string) => boolean; // devuelve true si puede VER en sidebar
}) {


  const pathname = usePathname();

  

  //  Permisos: si no puede "ver", fuera
  
  const hasChildren = (node.hijos?.length ?? 0) > 0;

// ✅ Carpeta REAL: por tipo o por estructura (fallback)
const isFolder =
  node.tipo === "carpeta" ||
  (hasChildren && (!node.route || node.route.trim() === ""));

// ✅ Permisos SOLO para tablas/subtablas (no carpetas)
if (!isFolder) {
  if (canView && !canView(node.slug)) return null;
}

  // ✅ sidebar=true => NO se muestra el nodo, pero sus hijos sí (promovidos al mismo nivel)
  if (node.sidebar === true) {
  if (node.tipo === "carpeta") {
    // la carpeta no se oculta, ignora sidebar para carpetas
  } else {
    if (!hasChildren) return null;
    return (
      <>
        {node.hijos!.map((h) => (
          <NavItem
            key={h.id}
            node={h}
            openSet={openSet}
            toggleNode={toggleNode}
            activeSet={activeSet}
            offcanvasDismiss={offcanvasDismiss}
            level={level}
            canView={canView}
          />
        ))}
      </>
    );
  }
}

  const indent = { paddingLeft: `${level * 12}px` };

  const exact = node.route ? isExactActive(pathname, node.route) : false;
  const branch = node.route ? isBranchActive(pathname, node.route) : false;

  const itemClass = ["nav-link", exact ? "active text-success" : "text-body-secondary"].join(" ");

  const expanded = openSet.has(node.id) || branch;

  // ✅ NODO CON HIJOS
  if (hasChildren) {
    const isFolder = node.tipo === "carpeta";
    const canRenderSelfLink = !isFolder && !!node.route; // ✅ solo tablas/subtablas con ruta

    return (
      <li className="nav-item">
        <div>
          <button
            className="btn btn-sm text-start w-100 text-decoration-none d-flex align-items-center justify-content-between"
            style={indent}
            type="button"
            onClick={() => toggleNode(node.id)}
          >
            <span>
              {node.icon && <i className={"bi " + node.icon + " me-2"} />}
              {node.nombre}
            </span>
            <i className={`bi ${expanded ? "bi-chevron-down" : "bi-chevron-right"}`} />
          </button>

          <div className={`sidebarCollapse ${expanded ? "show" : ""}`}>
            <ul className="nav flex-column ms-1">
              {/* ✅ Si es carpeta: NO mostrar link a su ruta */}
              {canRenderSelfLink && (
                <li className="nav-item">
                  <a
                    href={node.route!}
                    className={itemClass}
                    style={{ paddingLeft: `${(level + 1) * 12}px` }}
                    {...(offcanvasDismiss ? { "data-bs-dismiss": "offcanvas" as const } : {})}
                  >
                    {node.icon && <i className={"bi " + node.icon + " me-2"} />}
                    {node.nombre}
                  </a>
                </li>
              )}

              {node.hijos!.map((h) => (
                <NavItem
                  key={h.id}
                  node={h}
                  openSet={openSet}
                  toggleNode={toggleNode}
                  activeSet={activeSet}
                  offcanvasDismiss={offcanvasDismiss}
                  level={level + 1}
                  canView={canView}
                />
              ))}
            </ul>
          </div>
        </div>
      </li>
    );
  }

  // ✅ HOJA: si por error llega una carpeta sin hijos, no la pintamos.
  if (node.tipo === "carpeta") return null;

  return (
    <li className="nav-item">
      <a
        href={node.route ?? "#"}
        className={itemClass}
        style={indent}
        {...(offcanvasDismiss ? { "data-bs-dismiss": "offcanvas" as const } : {})}
      >
        {node.icon && <i className={"bi " + node.icon + " me-2"} />}
        {node.nombre}
      </a>
    </li>
  );
}


function SidebarUser() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-top p-3 position-relative">
      <button
        type="button"
        className="btn w-100 d-flex align-items-center justify-content-between"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-person-circle fs-5" />
          <span className="small">Mi cuenta</span>
        </div>
        
      </button>

      {open && (
        <div
          className="position-absolute bg-white border rounded shadow-sm"
          style={{
            bottom: "100%",
            left: 16,
            right: 16,
            marginBottom: 8,
            zIndex: 1000,
          }}
        >
          <ul className="list-unstyled mb-0">
            <li>
              <a
                href="/mi-perfil"
                className="dropdown-item d-flex align-items-center gap-2"
              >
                <i className="bi bi-person" />
                Mi perfil
              </a>
            </li>
            <li>
                <form action="/auth/signout" method="post" className="m-0">
                <button className="dropdown-item d-flex align-items-center gap-2 text-danger" type="submit">
                  <i className="bi bi-box-arrow-right" />
                  Salir
                </button>
              </form>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}


export default Sidebar;
