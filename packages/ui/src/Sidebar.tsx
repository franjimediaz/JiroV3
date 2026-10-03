"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { SidebarItem, SidebarModuleSelection } from "./types";
import { isBranchActive, isExactActive } from "./utils";
import { filterSidebarTree, getSelectableModules, selectSidebarModule, getStandaloneItems, getActiveSidebarIds } from "./sidebarTree";
import { ActionMenu } from "./ActionMenu";

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
  moduleSelection,
  onModuleChange,
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
  moduleSelection?: SidebarModuleSelection | null;
  onModuleChange?: (selection: SidebarModuleSelection) => void;
}) {
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const [localSelection, setLocalSelection] = useState<SidebarModuleSelection | null>(null);
  const selection = moduleSelection ?? localSelection;
  const visibleItems = useMemo(() => filterSidebarTree(items, canView), [items, canView]);
  const modules = useMemo(() => getSelectableModules(visibleItems), [visibleItems]);
  const selectedModule = useMemo(() => selectSidebarModule(visibleItems, pathname, selection), [visibleItems, pathname, selection]);
  const standaloneItems = useMemo(() => getStandaloneItems(visibleItems), [visibleItems]);
  const changeModule = onModuleChange ?? setLocalSelection;

  useEffect(() => {
    if (selectedModule && (selection?.id !== selectedModule.id || selection?.pathname !== pathname)) {
      changeModule({ id: selectedModule.id, pathname });
    }
  }, [selectedModule, selection, pathname, changeModule]);

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

  const activeSet = useMemo(() => getActiveSidebarIds(visibleItems, pathname), [visibleItems, pathname]);

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
    <>
    {modules.length > 0 && <div className={`sidebar-module-selector ${miniMode && variant === "fixed" ? "is-mini" : ""}`}>
      <ActionMenu
        key={`${pathname}:${selectedModule?.id}:${variant === "drawer" ? isOpen : "fixed"}`}
        align="start"
        ariaLabel={`Módulo: ${selectedModule?.nombre || "Seleccionar"}`}
        triggerTitle={selectedModule?.nombre}
        triggerClassName="sidebar-module-trigger"
        menuClassName="sidebar-module-menu"
        trigger={<>
          <i className={`bi ${selectedModule?.icon || "bi-folder"}`} aria-hidden="true" />
          {!(miniMode && variant === "fixed") && <>
            <span className="sidebar-module-name">{selectedModule?.nombre}</span>
            <i className="bi bi-chevron-down" aria-hidden="true" />
          </>}
        </>}
        items={modules.map((entry) => ({
          label: entry.nombre,
          title: entry.moduleLabel,
          icon: entry.icon ? <i className={`bi ${entry.icon}`} aria-hidden="true" /> : undefined,
          onClick: () => changeModule({ id: entry.id, pathname }),
        }))}
      />
    </div>}
    <NavTree
      nodes={selectedModule?.hijos || []}
      openSet={openSet}
      toggleNode={toggleNode}
      activeSet={activeSet}
      miniMode={miniMode && variant === "fixed"}
      onNavigate={variant === "drawer" ? onClose : undefined}
    />
    {standaloneItems.length > 0 && <div className="sidebar-common-links">
      {modules.length > 0 && <div className={miniMode && variant === "fixed" ? "visually-hidden" : "sidebar-common-title"}>Accesos generales</div>}
      <NavTree nodes={standaloneItems} openSet={openSet} toggleNode={toggleNode} activeSet={activeSet}
        miniMode={miniMode && variant === "fixed"} onNavigate={variant === "drawer" ? onClose : undefined} />
    </div>}
    </>
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
        {tree}
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

  const icon = <i aria-hidden="true" className={`bi ${node.icon || (isFolder ? "bi-folder" : "bi-table")} sidebar-item-icon ${miniMode ? "" : "me-2"}`} />;
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
            aria-label={node.nombre}
            aria-expanded={expanded}
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

  if (!node.route || node.route === "#") {
    return (
      <li className="nav-item">
        <span className={`${itemClass} disabled`} style={indent} aria-disabled="true" title="Acceso no disponible">
          {icon}
          {label}
        </span>
      </li>
    );
  }

  return (
    <li className="nav-item">
      <a
        href={node.route}
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
  const signoutForm = useRef<HTMLFormElement | null>(null);

  return (
    <div className={`border-top p-3 sidebar-user ${miniMode ? "is-mini" : ""}`}>
      <form ref={signoutForm} action="/api/auth/signout" method="post" hidden />
      <ActionMenu
        align="start"
        ariaLabel="Mi cuenta"
        triggerTitle="Mi cuenta"
        triggerClassName={`btn w-100 d-flex align-items-center gap-2 sidebar-user-btn ${miniMode ? "is-mini" : ""}`}
        trigger={<>
          <i className="bi bi-person-circle fs-5" aria-hidden="true" />
          {!miniMode && <span className="small sidebar-item-label">Mi cuenta</span>}
        </>}
        items={[
          { label: "Mi perfil", disabled: true, title: "Perfil no disponible", icon: <i className="bi bi-person" aria-hidden="true" /> },
          { label: "Salir", variant: "danger", title: "Salir", icon: <i className="bi bi-box-arrow-right" aria-hidden="true" />,
            onClick: () => signoutForm.current?.requestSubmit() },
        ]}
      />
    </div>
  );
}

export default Sidebar;
