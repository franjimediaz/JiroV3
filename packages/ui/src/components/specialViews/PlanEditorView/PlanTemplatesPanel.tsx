"use client";

import { useMemo, useState } from "react";
import styles from "./PlanEditorView.module.css";
import type { PlanTemplateDefinition } from "./planTypes";

type Props = {
  templates: PlanTemplateDefinition[];
  loading?: boolean;
  error?: string | null;
  configured?: boolean;
  readOnly?: boolean;
  hasContent?: boolean;
  onApply: (template: PlanTemplateDefinition) => void;
};

export default function PlanTemplatesPanel({ templates, loading, error, configured, readOnly, hasContent, onApply }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const categories = useMemo(() => Array.from(new Set(templates.map((item) => item.category).filter(Boolean) as string[])), [templates]);
  const filtered = templates.filter((item) => {
    const text = `${item.label} ${item.description || ""}`.toLowerCase();
    return (!search.trim() || text.includes(search.trim().toLowerCase())) && (!category || item.category === category);
  });

  return (
    <aside className={styles.panel}>
      <h3 className={styles.panelTitle}>Plantillas</h3>
      {!configured ? <div className={styles.hint}>Configura templatesSource para cargar plantillas reutilizables.</div> : null}
      {error ? <div className={styles.errorText}>{error}</div> : null}
      <div className={styles.settingsGrid}>
        <input className={styles.input} value={search} placeholder="Buscar" disabled={!configured} onChange={(event) => setSearch(event.target.value)} />
        <select className={styles.input} value={category} disabled={!configured || !categories.length} onChange={(event) => setCategory(event.target.value)}>
          <option value="">Todas</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      {loading ? <div className={styles.hint}>Cargando plantillas...</div> : null}
      <div className={styles.vertexList}>
        {filtered.map((template) => (
          <button
            key={template.id}
            type="button"
            className={styles.assetButton}
            disabled={readOnly}
            onClick={() => {
              if (hasContent && typeof window !== "undefined" && !window.confirm("El plano actual tiene contenido. ¿Aplicar la plantilla?")) return;
              onApply(template);
            }}
          >
            <strong>{template.label}</strong>
            {template.description ? <span>{template.description}</span> : null}
          </button>
        ))}
      </div>
    </aside>
  );
}
