// /apps/web/app/system/modulos/ModulosTree.tsx
"use client";

import { useState } from "react";
import type { ModuloNode } from "./page";
import styles from "./modulos.module.css";
import Link from "next/link";

type Props = { nodes: ModuloNode[] };

function NodeRow({ node }: { node: ModuloNode }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  const tipoBadge: Record<ModuloNode["tipo"], string> = {
    carpeta: "Carpeta",
    tabla: "Tabla",
    subtabla: "Subtabla",
    vista: "Vista",
  };

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
          {!node.activo && <span className={styles.inactive}>Inactivo</span>}
        </div>

        <div className={styles.nodeMeta}>
          <span className={styles.metaItem}>Orden: {node.orden}</span>
          <Link href={`/system/modulos/${node.id}`} style={{ textDecoration: "underline" }}>
            Ver
          </Link>
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
