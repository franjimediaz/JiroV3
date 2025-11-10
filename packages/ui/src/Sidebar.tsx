"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import type { SidebarItem } from "./types";
import { isActive } from "./utils";

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

  // Expandir grupos que contienen la ruta activa
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
          <NavTree nodes={items} activeSet={activeSet} offcanvasDismiss />
        </div>
      </div>
    );
  }

  // fixed
  return (
    <aside className="bg-body-primary border-end h-100">
      <div className="p-4 sidebar-sticky">
        <h6 className="text-uppercase text-dark mb-3">{title}</h6>
        <NavTree nodes={items} activeSet={activeSet} />
      </div>
    </aside>
  );
}

function NavTree({
  nodes,
  activeSet,
  offcanvasDismiss = false,
}: {
  nodes: SidebarItem[];
  activeSet: Set<string>;
  offcanvasDismiss?: boolean;
}) {
  return (
    <ul className="nav nav-pills flex-column gap-2">
      {nodes.map((n) => (
        <NavItem
          key={n.id}
          node={n}
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
  activeSet,
  offcanvasDismiss,
  level,
}: {
  node: SidebarItem;
  activeSet: Set<string>;
  offcanvasDismiss: boolean;
  level: number;
}) {
  const pathname = usePathname();
  const hasChildren = (node.hijos?.length ?? 0) > 0;
  const isNodeActive = isActive(pathname, node.route);
  const expanded = activeSet.has(node.id);
  const collapseId = `collapse-${node.id}`;
  const itemClass = ["nav-link", isNodeActive ? "active" : "text-body-secondary"].join(" ");
  const indent = { paddingLeft: `${level * 12}px` };

  return (
    <li className="nav-item">
      {hasChildren ? (
        <div>
          <button
            className="btn btn-sm btn-secondary text-start w-100 text-decoration-none"
            style={indent}
            type="button"
            data-bs-toggle="collapse"
            data-bs-target={`#${collapseId}`}
            aria-expanded={expanded ? "true" : "false"}
            aria-controls={collapseId}
          >
            <i className={"bi " + node.icon}>   {node.nombre}</i>
            
          </button>

          <div className={`collapse ${expanded ? "show" : ""}`} id={collapseId}>
            <ul className="nav flex-column ms-1">
              {node.route && (
                <li className="nav-item">
                  <a
                    href={node.route}
                    className={itemClass}
                    style={{ paddingLeft: `${(level + 1) * 12}px` }}
                    {...(offcanvasDismiss ? { "data-bs-dismiss": "offcanvas" } : {})}
                    
                  >
                    
                    {node.nombre}
                  </a>
                </li>
              )}
              {node.hijos!.map((h) => (
                <NavItem
                  key={h.id}
                  node={h}
                  activeSet={activeSet}
                  offcanvasDismiss={offcanvasDismiss}
                  level={level + 1}
                />
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <a
          href={node.route ?? "#"}
          className={itemClass}
          style={indent}
          {...(offcanvasDismiss ? { "data-bs-dismiss": "offcanvas" } : {})}
        >
          <i className={"bi " + node.icon}></i>{node.nombre}
          
        </a>
      )}
    </li>
  );
}

export default Sidebar;
