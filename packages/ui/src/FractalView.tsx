"use client";
import { useMemo, useState, type CSSProperties } from "react";
import { getEffectiveModuleCapabilities, getFractalConfig, validateFractalConfig } from "@repo/types";
import type { ListViewProps } from "@repo/types";
import { ActionMenu } from "./ActionMenu";
import { getModuleColorVariables } from "./utils/colorContrast";
import { buildFractalForest, flattenFractal, fractalText } from "./fractalModel";
import styles from "./FractalView.module.css";

export function FractalView({ schema, data, loading, error, onRetry, title, onCreate, onViewRow, onEditRow, onDeleteRow,
  onExport, onImport, onSearch, exportLoading, importLoading, toolbar = {} }: ListViewProps & { error?: string; onRetry?: () => void }) {
  const config = getFractalConfig(schema);
  const capabilities = getEffectiveModuleCapabilities(schema);
  const primaryKey = schema.db.primaryKey || "id";
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const forest = useMemo(() => buildFractalForest(data, primaryKey, config.parentField || ""), [data, primaryKey, config.parentField]);
  const fields = [...new Set([config.titleField || primaryKey, ...(config.visibleFields || [])])];
  const search = capabilities.allowSearch ? query : "";
  const visible = flattenFractal(forest, expanded, search, fields);
  const exportNodes = flattenFractal(forest, new Set(forest.nodes.keys()), search, fields);
  const problem = error || validateFractalConfig(schema);
  const toggle = (id: string) => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <section className={`Orymexa-list-view ${styles.view}`} style={getModuleColorVariables(schema.ui?.color) as CSSProperties} aria-label="Fractal" aria-busy={!!loading}>
    <div className={`card-header ${styles.toolbar}`}>
      <strong>{title || schema.ui?.titlePlural || schema.db.table} · Fractal</strong>
      {toolbar.create !== false && capabilities.allowCreate && onCreate && <button type="button" className="btn Orymexa-list-action" onClick={onCreate}>Crear</button>}
      {toolbar.search !== false && capabilities.allowSearch && onSearch && <button type="button" className="btn Orymexa-list-action" onClick={onSearch}>Búsqueda avanzada</button>}
      {toolbar.export !== false && capabilities.allowExport && onExport && <button type="button" className="btn Orymexa-list-action" disabled={exportLoading || loading || !!problem} onClick={() => void onExport({ columns: [], rows: [], rawRows: exportNodes.map(({ node }) => node.row) })}>Exportar</button>}
      {toolbar.import !== false && capabilities.allowImport && onImport && <button type="button" className="btn Orymexa-list-action" disabled={importLoading} onClick={() => void onImport()}>Importar</button>}
    </div>
    <div className={`p-2 ${styles.toolbar}`}>
      {capabilities.allowSearch && <input className={`form-control ${styles.search}`} type="search" aria-label="Buscar nodos" placeholder="Buscar nodos…" value={query} onChange={event => setQuery(event.target.value)} />}
      <button type="button" className="btn btn-outline-secondary" disabled={!!search} onClick={() => setExpanded(new Set(forest.nodes.keys()))}>Expandir todo</button>
      <button type="button" className="btn btn-outline-secondary" disabled={!!search} onClick={() => setExpanded(new Set())}>Contraer todo</button>
    </div>
    {loading ? <p role="status" className="p-3">Cargando registros…</p> : problem ? <div role="alert" className="p-3 text-danger">{problem}{onRetry && <button type="button" className="btn btn-outline-secondary" onClick={onRetry}>Reintentar</button>}</div> : <>
      {!!(forest.cycles + forest.orphans + forest.duplicates + forest.invalid) && <p role="status" className="px-3 small text-muted">Jerarquía ajustada: {forest.cycles} ciclos, {forest.orphans} padres fuera del lote, {forest.duplicates} duplicados omitidos y {forest.invalid} registros sin clave omitidos.</p>}
      <p className="px-3 small text-muted">{forest.nodes.size} registros cargados. La jerarquía se limita al mismo lote que Lista.</p>
      {!visible.length && <p role="status" className="p-3">No hay registros para mostrar.</p>}
      <ul className={styles.nodes} aria-label="Jerarquía de registros">
        {visible.map(({ node, depth }) => {
          const label = fractalText(node.row[config.titleField || primaryKey]) || node.id;
          return <li key={node.id} className={styles.node} style={{ "--depth": depth } as CSSProperties}>
            {node.children.length > 0 && <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={`${expanded.has(node.id) || search ? "Contraer" : "Expandir"} ${label}`} aria-expanded={!!search || expanded.has(node.id)} disabled={!!search} onClick={() => toggle(node.id)}>{expanded.has(node.id) || search ? "−" : "+"}</button>}
            <div className={styles.body}>
              {onViewRow ? <button type="button" className={`btn btn-link p-0 ${styles.title}`} onClick={() => onViewRow(node.row)}>{label}</button> : <strong className={styles.title}>{label}</strong>}
              <span className="visually-hidden">Nivel {depth + 1}</span>
              <dl className={styles.fields}>{config.visibleFields?.filter(name => name !== config.titleField).map(name => <div key={name}><dt>{schema.fields.find(field => field.name === name)?.label || name}</dt><dd>{fractalText(node.row[name]) || "—"}</dd></div>)}</dl>
            </div>
            <ActionMenu ariaLabel={`Acciones de ${label}`} items={[
              onViewRow && { label: "Ver", onClick: () => onViewRow(node.row) },
              capabilities.allowEdit && onEditRow && { label: "Editar", onClick: () => onEditRow(node.row) },
              capabilities.allowDelete && onDeleteRow && { label: "Eliminar", variant: "danger", onClick: () => onDeleteRow(node.row) },
            ]} />
          </li>;
        })}
      </ul>
    </>}
  </section>;
}
