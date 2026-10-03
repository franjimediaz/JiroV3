"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { AdvancedFilterBuilder, FilterExpressionSummary, ModalConfirm, getModuleColorVariables, dataProvider } from "@repo/ui";
import { advancedSearchFields, emptyAdvancedFilter, type AdvancedFilterGroup, type ListViewProps, type ListViewExportPayload, type ModuleSchema } from "@repo/types";
import { usePerms } from "./perms";

type ResultView = Pick<ListViewProps, "data" | "loading" | "pagination" | "sorting" | "onExport" | "exportLoading">;

function readSearch(): { filter: AdvancedFilterGroup; error?: string } {
  const raw = new URLSearchParams(window.location.search).get("filters");
  if (!raw) return { filter: emptyAdvancedFilter() };
  try {
    if (raw.length > 20000) throw Error();
    const value = JSON.parse(raw);
    let nodes = 0;
    const validate = (input: unknown, depth: number): boolean => {
      if (++nodes > 100 || depth > 4 || !input || typeof input !== "object" || Array.isArray(input)) return false;
      const node = input as Record<string, unknown>;
      return node.kind === "group" ? (node.logic === "AND" || node.logic === "OR") && Array.isArray(node.items) && node.items.every(child => validate(child, depth + 1)) :
        node.kind === "condition" && typeof node.field === "string" && typeof node.op === "string" && (node.relation === undefined || typeof node.relation === "string");
    };
    if (value.kind !== "group" || !validate(value, 1)) throw Error();
    return { filter: value };
  } catch { return { filter: emptyAdvancedFilter(), error: "La búsqueda de la URL no es válida. Corrige las condiciones antes de buscar." }; }
}

export function AdvancedSearchView({ schema, moduleSlug, modulesBySlug, onExport, children, revision }: {
  schema: ModuleSchema; moduleSlug: string; modulesBySlug?: Record<string, {schema?: ModuleSchema; nombre?: string}>;
  onExport?: (payload: ListViewExportPayload) => void | Promise<void>;
  children: (result: ResultView) => ReactNode;
  revision: number;
}) {
  const { hasPermiso } = usePerms();
  const [draft, setDraft] = useState<AdvancedFilterGroup>(emptyAdvancedFilter);
  const [modalDraft, setModalDraft] = useState<AdvancedFilterGroup | null>(null);
  const palette = getModuleColorVariables(schema.ui?.color);
  const [applied, setApplied] = useState<AdvancedFilterGroup | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<{field: string; direction: "asc" | "desc"} | null>(null);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const fields = useMemo(() => {
    const related: Record<string, ModuleSchema> = {};
    for (const [slug, module] of Object.entries(modulesBySlug || {})) {
      if (hasPermiso(slug, "ver") && module.schema) related[slug] = module.schema;
    }
    return advancedSearchFields(schema, related).filter(option => option.field.type !== "selectorTabla" || hasPermiso(option.field.ref.moduleSlug, "ver"));
  }, [schema, modulesBySlug, hasPermiso]);

  useEffect(() => {
    const restore = () => { const restored = readSearch(); setDraft(restored.filter); setModalDraft(null); setApplied(null); setData([]); setTotal(0); setError(restored.error || null); };
    restore(); window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    const id = ++generation.current;
    let active = true;
    if (!applied) { setLoading(false); return; }
    setLoading(true); setError(null);
    void dataProvider.list!({ moduleSlug, advancedFilters: applied, sort: sort ? [sort] : [], limit: pageSize, offset: (page - 1) * pageSize })
      .then(result => {
        if (!active || generation.current !== id) return;
        const count = result.count || 0;
        if (page > 1 && (page - 1) * pageSize >= count) { setPage(Math.max(1, Math.ceil(count / pageSize))); return; }
        setData(result.data); setTotal(count);
      }).catch(cause => { if (active && generation.current === id) { setError(cause.message || "No se pudo buscar"); setData([]); setTotal(0); } })
      .finally(() => { if (active && generation.current === id) setLoading(false); });
    return () => { active = false; };
  }, [applied, page, pageSize, sort, moduleSlug, revision]);

  const persist = (value: AdvancedFilterGroup) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "search");
    if (value.items.length) url.searchParams.set("filters", JSON.stringify(value));
    else url.searchParams.delete("filters");
    window.history.replaceState(null, "", url);
  };
  const exportResults = onExport ? async (payload: ListViewExportPayload) => {
    if (exporting || loading) return;
    if (!applied) { await onExport({...payload, rawRows: []}); return; }
    setExporting(true); setError(null);
    try {
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; ; ) {
        const result = await dataProvider.list!({moduleSlug, advancedFilters: applied, sort: sort ? [sort] : [], limit: 200, offset, purpose: "export"});
        rows.push(...result.data); offset += result.data.length;
        if (!result.data.length || offset >= (result.count || 0)) break;
      }
      await onExport({...payload, rawRows: rows});
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo exportar"); }
    finally { setExporting(false); }
  } : undefined;

  return <div className="jiro-advanced-search d-flex flex-column gap-3" style={palette as CSSProperties}>
    <section className="border rounded bg-white text-dark p-3" aria-label="Búsqueda avanzada">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h1 className="h5 mb-0">{modulesBySlug?.[moduleSlug]?.nombre || schema.db.name || schema.db.table} · Búsqueda avanzada</h1>
        <a className="btn jiro-form-primary" href={`/m/${encodeURIComponent(moduleSlug)}`}>Volver al listado</a>
      </div>
      {!fields.length && <p>No hay campos habilitados para filtro.</p>}
      <div className="jiro-query-card mb-3">
        <h2 className="jiro-query-header h6 mb-0">Consulta</h2>
        <div className="p-3">
          <FilterExpressionSummary filter={draft} fields={fields} />
          <button type="button" className="btn jiro-form-primary mt-3" disabled={!fields.length}
            onClick={() => setModalDraft(structuredClone(draft))}>
            {draft.items.length ? "Editar consulta" : "Crear consulta"}
          </button>
        </div>
      </div>
      <ModalConfirm open={modalDraft !== null} configuration title="Construir consulta" confirmText="Aplicar" cancelText="Cancelar"
        moduleColor={palette["--module-color"]} onCancel={() => setModalDraft(null)} onConfirm={() => {
          if (!modalDraft) return;
          setDraft(modalDraft); persist(modalDraft); setModalDraft(null);
        }}>
        <div className="jiro-advanced-search">
          <p className="small">Aplicar guarda la consulta. Pulsa Buscar en la vista principal para ejecutarla.</p>
          {modalDraft && <AdvancedFilterBuilder fields={fields} value={modalDraft} onChange={setModalDraft} />}
        </div>
      </ModalConfirm>
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={() => {
          generation.current++; setDraft(emptyAdvancedFilter()); setApplied(null); setData([]); setTotal(0); setError(null); setPage(1); persist(emptyAdvancedFilter());
        }}>Limpiar</button>
        <button type="button" className="btn jiro-form-primary" disabled={loading || !fields.length} onClick={() => {
          setPage(1); setApplied(structuredClone(draft)); persist(draft);
        }}>{loading ? "Buscando…" : "Buscar"}</button>
      </div>
      <p className="small text-muted mt-2 mb-0">Las condiciones se conservan en la URL. Pulsa Buscar para ejecutarlas.</p>
      {error && <div role="alert" className="alert alert-danger mt-3 mb-0">{error}</div>}
    </section>
    <section className="bg-white text-dark" aria-label="Resultados">
      <h2 className="h6">Resultados {exporting && <span role="status">· Exportando…</span>}</h2>
      {children({data, loading, pagination: {page, pageSize, total, onChange: (nextPage, size) => {setPage(nextPage); setPageSize(size);}},
        sorting: {...sort, onChange: (field, direction) => {setSort({field, direction}); setPage(1);}},
        onExport: exportResults, exportLoading: exporting || loading})}
    </section>
  </div>;
}

