"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { SidebarItem } from "./types";
import { isActive, isBranchActive, isExactActive } from "./utils";

export type SidebarVariant = "fixed" | "drawer";

export function Sidebar({
  items,
  title = "Navegacion",
  variant = "fixed",
  isOpen = false,
  onClose,
  miniMode = false,
  onToggleMini,
  canView,
}: {
  items: SidebarItem[];
  title?: string;
  variant?: SidebarVariant;
  isOpen?: boolean;
  onClose?: () => void;
  miniMode?: boolean;
  onToggleMini?: () => void;
  icon?: string;
  canView?: (slug: string) => boolean;
}) {
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    if (variant !== "drawer" || !isOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, isOpen, onClose]);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;

    if (variant !== "drawer" || !isOpen) return;
    if (previousPathname === pathname) return;

    onClose?.();
  }, [variant, isOpen, onClose, pathname]);

  const activeSet = useMemo(() => {
    const set = new Set<string>();

    const visit = (node: SidebarItem): boolean => {
      const hasChildren = (node.hijos?.length ?? 0) > 0;
      const isFolder = node.tipo === "carpeta" || (hasChildren && (!node.route || node.route.trim() === ""));

      if (!isFolder && canView && !canView(node.slug)) return false;

      if (node.sidebar === true && node.tipo !== "carpeta") {
        return (node.hijos ?? []).some(visit);
      }

      const here = node.route ? isActive(pathname, node.route) : false;
      const childActive = (node.hijos ?? []).some(visit);

      if (here || childActive) set.add(node.id);
      return here || childActive;
    };

    items.forEach(visit);
    return set;
  }, [items, pathname, canView]);

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
      canView={canView}
      miniMode={miniMode && variant === "fixed"}
      onNavigate={variant === "drawer" ? onClose : undefined}
    />
  );

  if (variant === "drawer") {
    return (
      <>
        <div
          className={`sidebarOverlay ${isOpen ? "show" : ""}`}
          onClick={() => onClose?.()}
          aria-hidden="true"
        />

        <aside
          id="mobile-sidebar-drawer"
          className={`sidebarDrawer ${isOpen ? "open" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          aria-hidden={!isOpen}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sidebarDrawerHeader">
            <h5 className="m-0">{title}</h5>
            <button type="button" className="btnClose" onClick={() => onClose?.()} aria-label="Cerrar">
              ✕
            </button>
          </div>

          <div className="sidebarDrawerBody">{tree}</div>
          <div className="sidebarDrawerFooter">
            <SidebarUser />
          </div>
        </aside>
      </>
    );
  }

  return (
    <aside className={`sidebar-desktop border-end h-100 ${miniMode ? "is-mini" : ""}`}>
      <div className={`p-4 sidebar-sticky ${miniMode ? "is-mini" : ""}`}>
        <div className="sidebar-topbar">
          <h6 className={`sidebar-title ${miniMode ? "is-mini" : ""}`}>{title}</h6>
          {onToggleMini ? (
            <button
              type="button"
              className={`sidebar-pin-btn ${miniMode ? "is-mini" : ""}`}
              onClick={onToggleMini}
              aria-label={miniMode ? "Expandir sidebar" : "Compactar sidebar"}
              title={miniMode ? "Expandir sidebar" : "Compactar sidebar"}
            >
              <i className={`bi ${miniMode ? "bi-pin-angle-fill" : "bi-pin-angle"}`} />
            </button>
          ) : null}
        </div>
        {miniMode ? null : tree}
      </div>
      <SidebarUser miniMode={miniMode} />
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
  miniMode = false,
}: {
  nodes: SidebarItem[];
  openSet: Set<string>;
  toggleNode: (id: string) => void;
  activeSet: Set<string>;
  offcanvasDismiss?: boolean;
  canView?: (slug: string) => boolean;
  onNavigate?: () => void;
  miniMode?: boolean;
}) {
  return (
    <ul className="nav flex-column">
      {nodes.map((node) => (
        <NavItem
          key={node.id}
          node={node}
          openSet={openSet}
          toggleNode={toggleNode}
          activeSet={activeSet}
          offcanvasDismiss={offcanvasDismiss}
          level={0}
          canView={canView}
          miniMode={miniMode}
          onNavigate={onNavigate}
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
  canView,
  miniMode = false,
  onNavigate,
}: {
  node: SidebarItem;
  openSet: Set<string>;
  toggleNode: (id: string) => void;
  activeSet: Set<string>;
  offcanvasDismiss: boolean;
  level: number;
  canView?: (slug: string) => boolean;
  miniMode?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const hasChildren = (node.hijos?.length ?? 0) > 0;
  const isFolder = node.tipo === "carpeta" || (hasChildren && (!node.route || node.route.trim() === ""));

  if (!isFolder && canView && !canView(node.slug)) return null;

  if (node.sidebar === true && node.tipo !== "carpeta") {
    if (!hasChildren) return null;
    return (
      <>
        {node.hijos!.map((child) => (
          <NavItem
            key={child.id}
            node={child}
            openSet={openSet}
            toggleNode={toggleNode}
            activeSet={activeSet}
            offcanvasDismiss={offcanvasDismiss}
            level={level}
            canView={canView}
            miniMode={miniMode}
            onNavigate={onNavigate}
          />
        ))}
      </>
    );
  }

  const indent = { paddingLeft: `${level * 12}px` };
  const exact = node.route ? isExactActive(pathname, node.route) : false;
  const branch = node.route ? isBranchActive(pathname, node.route) : false;
  const expanded = openSet.has(node.id) || branch || activeSet.has(node.id);
  const itemClass = ["nav-link", exact ? "active text-success" : "text-body-secondary", "sidebar-nav-link", miniMode ? "is-mini" : ""]
    .filter(Boolean)
    .join(" ");

  const icon = node.icon ? <i className={`bi ${node.icon} sidebar-item-icon ${miniMode ? "is-hidden" : "me-2"}`} /> : null;
  const label = <span className={`sidebar-item-label ${miniMode ? "is-hidden" : ""}`}>{node.nombre}</span>;

  if (hasChildren) {
    const canRenderSelfLink = !isFolder && !!node.route;

    return (
      <li className="nav-item">
        <div>
          <button
            className={`btn btn-sm text-start w-100 text-decoration-none d-flex align-items-center justify-content-between sidebar-folder-btn ${miniMode ? "is-mini" : ""}`}
            style={indent}
            type="button"
            onClick={() => toggleNode(node.id)}
            title={node.nombre}
          >
            <span className="d-flex align-items-center sidebar-item-main">
              {icon}
              {label}
            </span>
            <i className={`bi ${expanded ? "bi-chevron-down" : "bi-chevron-right"} sidebar-item-chevron ${miniMode ? "is-hidden" : ""}`} />
          </button>

          <div className={`sidebarCollapse ${expanded ? "show" : ""}`}>
            <ul className={`nav flex-column ${miniMode ? "sidebar-subnav-mini" : "ms-1"}`}>
              {canRenderSelfLink ? (
                <li className="nav-item">
                  <a
                    href={node.route!}
                    className={itemClass}
                    style={{ paddingLeft: `${(level + 1) * 12}px` }}
                    title={node.nombre}
                    onClick={() => onNavigate?.()}
                    {...(offcanvasDismiss ? { "data-bs-dismiss": "offcanvas" as const } : {})}
                  >
                    {icon}
                    {label}
                  </a>
                </li>
              ) : null}

              {node.hijos!.map((child) => (
                <NavItem
                  key={child.id}
                  node={child}
                  openSet={openSet}
                  toggleNode={toggleNode}
                  activeSet={activeSet}
                  offcanvasDismiss={offcanvasDismiss}
                  level={level + 1}
                  canView={canView}
                  miniMode={miniMode}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          </div>
        </div>
      </li>
    );
  }

  if (node.tipo === "carpeta") return null;

  return (
    <li className="nav-item">
      <a
        href={node.route ?? "#"}
        className={itemClass}
        style={indent}
        title={node.nombre}
        onClick={() => onNavigate?.()}
        {...(offcanvasDismiss ? { "data-bs-dismiss": "offcanvas" as const } : {})}
      >
        {icon}
        {label}
      </a>
    </li>
  );
}

function SidebarUser({ miniMode = false }: { miniMode?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border-top p-3 position-relative sidebar-user ${miniMode ? "is-mini" : ""}`}>
      <button
        type="button"
        className={`btn w-100 d-flex align-items-center justify-content-between sidebar-user-btn ${miniMode ? "is-mini" : ""}`}
        onClick={() => setOpen((value) => !value)}
        title="Mi cuenta"
      >
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-person-circle fs-5" />
          <span className={`small sidebar-item-label ${miniMode ? "is-hidden" : ""}`}>Mi cuenta</span>
        </div>
      </button>

      {open ? (
        <div
          className="position-absolute bg-white border rounded shadow-sm"
          style={{
            bottom: "100%",
            left: miniMode ? 8 : 16,
            right: 16,
            marginBottom: 8,
            zIndex: 1000,
          }}
        >
          <ul className="list-unstyled mb-0">
            <li>
              <a href="/mi-perfil" className="dropdown-item d-flex align-items-center gap-2" title="Mi perfil">
                <i className="bi bi-person" />
                <span className={`${miniMode ? "visually-hidden" : ""}`}>Mi perfil</span>
                {miniMode ? <span className="small">Perfil</span> : null}
              </a>
            </li>
            <li>
              <form action="/auth/signout" method="post" className="m-0">
                <button className="dropdown-item d-flex align-items-center gap-2 text-danger" type="submit" title="Salir">
                  <i className="bi bi-box-arrow-right" />
                  <span className={`${miniMode ? "visually-hidden" : ""}`}>Salir</span>
                  {miniMode ? <span className="small">Salir</span> : null}
                </button>
              </form>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default Sidebar;
