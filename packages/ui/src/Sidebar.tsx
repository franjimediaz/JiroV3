"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { SidebarItem } from "./types";
import { isActive, isBranchActive,isExactActive } from "./utils";

export type SidebarVariant = "fixed" | "offcanvas";

export function Sidebar({
  items,
  title = "Navegación",
  variant = "fixed",
  offcanvasId = "sidebarOffcanvas",
}: {
  items: SidebarItem[];
  title?: string;
  variant?: SidebarVariant;
  offcanvasId?: string;
  icon?: string;
}) {
  const pathname = usePathname();

  // 1) Calculamos qué nodos deben estar abiertos por contener la ruta activa
  const activeSet = useMemo(() => {
    const set = new Set<string>();
    const visit = (n: SidebarItem): boolean => {
      const here = isActive(pathname, n.route);
      const childActive = (n.hijos ?? []).some(visit);
      if (here || childActive) set.add(n.id);
      return here || childActive;
    };
    items.forEach(visit);
    return set;
  }, [items, pathname]);

  // 2) Estado real de expansión (lo usamos para el dropdown)
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());

  // Inicializamos/actualizamos openSet cuando cambia la ruta o los items
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
    />
  );

  if (variant === "offcanvas") {
    return (
      <div
        className="offcanvas offcanvas-start"
        tabIndex={-1}
        id={offcanvasId}
        aria-labelledby={`${offcanvasId}-label`}
      >
        <div className="offcanvas-header">
          <h5 className="offcanvas-title" id={`${offcanvasId}-label`}>
            {title}
          </h5>
          <button
            type="button"
            className="btn-close"
            data-bs-dismiss="offcanvas"
            aria-label="Close"
          />
        </div>
        <div className="offcanvas-body">
          <NavTree
            nodes={items}
            openSet={openSet}
            toggleNode={toggleNode}
            activeSet={activeSet}
            offcanvasDismiss
          />
        </div>
      </div>
    );
  }

  // fixed
  return (
    <aside className="bg-body-primary border-end h-100 ">
      <div className="p-4 sidebar-sticky ">
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
}: {
  nodes: SidebarItem[];
  openSet: Set<string>;
  toggleNode: (id: string) => void;
  activeSet: Set<string>;
  offcanvasDismiss?: boolean;
}) {
  return (
    <ul className="nav nav-pills flex-column gap-2">
      {nodes.map((n) => (
        <NavItem
          key={n.id}
          node={n}
          openSet={openSet}
          toggleNode={toggleNode}
          activeSet={activeSet}
          offcanvasDismiss={offcanvasDismiss}
          level={0}
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
}: {
  node: SidebarItem;
  openSet: Set<string>;
  toggleNode: (id: string) => void;
  activeSet: Set<string>;
  offcanvasDismiss: boolean;
  level: number;
}) {
  
  const pathname = usePathname();
  const hasChildren = (node.hijos?.length ?? 0) > 0;
  const exact = isExactActive(pathname, node.route);
  const branch = isBranchActive(pathname, node.route);
  const isNodeActive = isActive(pathname, node.route);
  const itemClass = [
  "nav-link",
  exact ? "active bg-secondary" : "text-body-secondary",
].join(" ");

const isOpen = branch;
  const expanded = openSet.has(node.id);
  
  const indent = { paddingLeft: `${level * 12}px` };

  if (hasChildren) {
    return (
      <li className="nav-item">
        <div>
          <button
            className="btn btn-sm  text-start w-100 text-decoration-none d-flex align-items-center justify-content-between"
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

          <div className={`collapse ${expanded ? "show" : ""}`}>
            <ul className="nav flex-column ms-1">
              {node.route && (
                <li className="nav-item">
                  <a
                    href={node.route}
                    className={itemClass}
                    style={{ paddingLeft: `${(level + 1) * 12}px` }}
                    {...(offcanvasDismiss ? {
                      "data-bs-dismiss": "offcanvas",
                    } : {})}
                  >
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
                />
              ))}
            </ul>
          </div>
        </div>
      </li>
    );
  }

  // hoja
  return (
    <li className="nav-item">
      <a
        href={node.route ?? "#"}
        className={itemClass}
        style={indent}
        {...(offcanvasDismiss ? { "data-bs-dismiss": "offcanvas" } : {})}
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
