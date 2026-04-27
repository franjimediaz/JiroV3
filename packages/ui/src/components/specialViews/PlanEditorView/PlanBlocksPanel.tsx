"use client";

import { useMemo, useState } from "react";
import styles from "./PlanEditorView.module.css";
import type { PlanBlockDefinition } from "./planTypes";

type Props = {
  blocks: PlanBlockDefinition[];
  loading?: boolean;
  error?: string | null;
  configured?: boolean;
  selectedBlockId?: string;
  readOnly?: boolean;
  onSelect: (block: PlanBlockDefinition | null) => void;
};

export default function PlanBlocksPanel({ blocks, loading, error, configured, selectedBlockId, readOnly, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const categories = useMemo(() => Array.from(new Set(blocks.map((item) => item.category).filter(Boolean) as string[])), [blocks]);
  const filtered = blocks.filter((item) => {
    const text = `${item.label} ${item.description || ""}`.toLowerCase();
    return (!search.trim() || text.includes(search.trim().toLowerCase())) && (!category || item.category === category);
  });

  return (
    <aside className={styles.panel} data-plan-editor-ignore-hotkeys="true">
      <h3 className={styles.panelTitle}>Bloques</h3>
      {!configured ? <div className={styles.hint}>Configura blocksSource para cargar bloques compuestos.</div> : null}
      {error ? <div className={styles.errorText}>{error}</div> : null}
      <div className={styles.settingsGrid}>
        <input className={styles.input} value={search} placeholder="Buscar" disabled={!configured} onChange={(event) => setSearch(event.target.value)} />
        <select className={styles.input} value={category} disabled={!configured || !categories.length} onChange={(event) => setCategory(event.target.value)}>
          <option value="">Todos</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      {loading ? <div className={styles.hint}>Cargando bloques...</div> : null}
      <div className={styles.vertexList}>
        {filtered.map((block) => (
          <button
            key={block.id}
            type="button"
            className={`${styles.assetButton} ${selectedBlockId === block.id ? styles.assetButtonActive : ""}`}
            disabled={readOnly}
            onClick={() => onSelect(selectedBlockId === block.id ? null : block)}
          >
            <strong>{block.icon ? `${block.icon} ` : ""}{block.label}</strong>
            {block.description ? <span>{block.description}</span> : null}
          </button>
        ))}
      </div>
    </aside>
  );
}
