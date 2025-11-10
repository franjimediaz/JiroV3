// /apps/web/app/system/modulos/ModulosTree.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { ModuloNode } from "./page";
import styles from "./modulos.module.css";
import Link from "next/link";

type Props = { nodes: ModuloNode[] };

function NodeRow({ node }: { node: ModuloNode }) {
  const [open, setOpen] = useState(true);
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
                <Link href={`/system/modulos/${node.id}`} className={styles.menuItem} role="menuitem">
                  <i className="bi bi-eye me-2" aria-hidden="true" /> Ver
                </Link>
                <Link href={`/system/modulos/${node.id}?edit=true`} className={styles.menuItem} role="menuitem">
                  <i className="bi bi-pencil me-2" aria-hidden="true" /> Editar
                </Link>
              </div>
            )}
          
          {/* Aquí podrías añadir acciones: Ver, Editar, Eliminar */}
        </div>
      </div>

      {hasChildren && open && (
        <ul className={styles.children}>
          {node.children.map((child) => (
            <NodeRow key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ModulosTree({ nodes }: Props) {
  return (
    <ul className={styles.tree}>
      {nodes.map((n) => (
        <NodeRow key={n.id} node={n} />
      ))}
    </ul>
  );
}
