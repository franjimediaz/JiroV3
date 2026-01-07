// /apps/web/app/system/modulos/ModulosTree.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type  {ModuloNode, OpenCreateModuleFn}  from "@repo/types";
import styles from "./modulos.module.css";
import { exportModuloSeed, seedToClipboardText } from "./exportModuloSeed";


function NodeRow({
  node,
  onOpenCreateModule,
}: {
  node: ModuloNode;
  onOpenCreateModule?: OpenCreateModuleFn;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  

  const tipoBadge: Record<ModuloNode["tipo"], string> = {
    carpeta: "Carpeta",
    tabla: "Tabla",
    subtabla: "Subtabla",
    vista: "Vista",
  };
  useEffect(() => {
  function onDocClick(e: MouseEvent) {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuOpen(false);
    }
  }
  document.addEventListener("click", onDocClick);
  return () => document.removeEventListener("click", onDocClick);
}, []);


async function handleCopySeed() {
      const seed = exportModuloSeed(node);
      const constName = `${(node?.slug ?? "modulo").replace(/[^a-zA-Z0-9_]/g, "_")}Seed`;
      const text = seedToClipboardText(seed, constName);
      await navigator.clipboard.writeText(text);
      alert("Seed copiada al portapapeles.");
      }

      function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function handleDownloadSeed() {
  const seed = exportModuloSeed(node);
  const constName = `${(node?.slug ?? "modulo").replace(/[^a-zA-Z0-9_]/g, "_")}Seed`;
  const text = seedToClipboardText(seed, constName);
  downloadText(`${constName}.ts`, text);
}

const actions = [
  {
    key: "view",
    label: "Ver",
    icon: "bi-eye",
    type: "link",
    href: `/system/modulos/${node.id}`,
  },
  {
    key: "edit",
    label: "Editar",
    icon: "bi-pencil",
    type: "link",
    href: `/system/modulos/${node.id}?edit=true`,
  },
  {
    key: "export",
    label: "Exportar seed",
    icon: "bi-download",
    type: "button",
    onClick: handleDownloadSeed,
  },
  {
    key: "copy",
    label: "Copiar seed",
    icon: "bi-copy",
    type: "button",
    onClick: handleCopySeed,
  },
];


  return (
    <li className={styles.node}>

      <div className={styles.nodeRow}>
        <button
          type="button"
          className={styles.toggle}
            onClick={() => hasChildren && setOpen((v) => !v)}
            aria-label={open ? "Contraer" : "Expandir"}
            aria-expanded={open}
            disabled={!hasChildren}
        >
          {hasChildren ? (open ? "▾" : "▸") : "•"}
        </button>

        <div className={styles.nodeMain}>
          <span className={styles.nodeName}>{node.nombre}</span>
          <span className={styles.nodeSlug}>/{node.slug}</span>
          <span className={`${styles.badge} ${styles[`badge_${node.tipo}`]}`}>
            
            {tipoBadge[node.tipo]}
          </span>
          <span className={`${styles.badge} ${styles[`badge_${node.orden}`]}`}>
              Orden: {node.orden}
            </span>
          {!node.activo && <span className={styles.inactive}>Inactivo</span>}
        </div>

        <div className={styles.nodeMeta} ref={menuRef}>

            <button
            type="button"
            className={styles.menuToggle}
            onClick={(ev) => { ev.stopPropagation(); setMenuOpen((s) => !s); }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Acciones"
            >
              <i className="bi bi-three-dots-vertical" aria-hidden="true" />
              <span className="visually-hidden">Abrir menú de acciones</span>
            </button>

          {menuOpen && (
              <div className={styles.menu} role="menu" aria-label="Acciones del módulo">
                <a href={`/system/modulos/${node.id}`} className={styles.menuItem} role="menuitem">
                  <i className="bi bi-eye me-2" aria-hidden="true" /> Ver
                </a>
                <a href={`/system/modulos/${node.id}?edit=true`} className={styles.menuItem} role="menuitem">
                  <i className="bi bi-pencil me-2" aria-hidden="true" /> Editar
                </a>
                <button type="button" className={styles.menuItemB} role="menuitem" onClick={handleDownloadSeed}>
                  <i className="bi bi-download me-2" aria-hidden="true" />Exportar seed
                </button>
                <button type="button" className={styles.menuItemB} role="menuitem" onClick={handleCopySeed}>
                  <i className="bi bi-copy me-2" aria-hidden="true" /> Copiar seed
                </button>
                <button  type="button" className={styles.menuItemB} role="menuitem" onClick={(ev) => {
                      ev.stopPropagation();
                      setMenuOpen(false);
                      onOpenCreateModule?.({ parentId: node.id, defaultTipo: "tabla" });
                    }}
                  >
                    <i className="bi bi-plus me-2" aria-hidden="true" /> Nueva tabla
                  </button>
                
              </div>
            )}

              
        </div>
      </div>

      {hasChildren && open && (
        <ul className={styles.children}>
          {node.children.map((child) => (
            <NodeRow key={child.id} node={child} onOpenCreateModule={onOpenCreateModule} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ModulosTree({  nodes,
  onCreateRoot,
  onOpenCreateModule,
  ...rest
}: {
  nodes: ModuloNode[];
  onCreateRoot?: () => void;
  onOpenCreateModule?: OpenCreateModuleFn;
}) {


  
  return (
    <div>
      <button type="button" className={styles.btn} onClick={() => onCreateRoot?.()}>
        <i className="bi bi-plus me-2" aria-hidden="true" /> Nuevo Módulo
      </button>
    <ul className={styles.tree}>
      {nodes.map((n) => (
        <NodeRow key={n.id} node={n} onOpenCreateModule={onOpenCreateModule}  />
      ))}
    </ul>
    </div>
    
  );
}
