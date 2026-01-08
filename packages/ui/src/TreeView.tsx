"use client";
import React, { useEffect, useMemo, useState } from "react";

type ColumnType = "text" | "money" | "date" | "datetime" | "boolean" | "select";

export type TreeViewFilter =
  | { kind: "eq"; field: string; value?: any; valueFromParent?: string }
  | { kind: "in"; field: string; values?: any[]; valuesFromParent?: string };

export type TreeViewLookup = {
  field: string; // campo en filas (FK o valor)
  table: string; // tabla lookup
  valueField?: string; // default "id"
  labelField: string;
  iconField?: string;
  colorField?: string;
};

export type TreeViewLevel = {
  levelField: string; // ej "nivel"
  order?: "asc" | "desc";
  labelPrefix?: string; // ej "Nivel"
};

export type TreeViewConfig = {
  source: {
    table: string;
    select?: string[]; // si no, se deduce
    orderBy?: { field: string; ascending?: boolean };
    filters?: TreeViewFilter[];
  };

  grouping: {
    groupByField: string; // ej "service"
    groupTitleField?: string; // si groupByField ya es texto (no FK)
    level?: TreeViewLevel;
  };

  columns: Array<{
    field: string;
    label: string;
    type?: ColumnType;
    width?: string;
    options?: string[]; // para select si quieres
  }>;

  totals?: {
    enabled: boolean;
    sumField: string; // ej "total"
    currency?: string; // default "EUR"
    showGroupTotals?: boolean;
    showGrandTotal?: boolean;
  };

  lookups?: TreeViewLookup[];

  actions?: {
    enableDelete?: boolean;
    deleteTable?: string; // default source.table
  };

  ui?: {
    title?: string;
  };
};

export type TreeViewQuery = {
  table: string;
  select: string[];
  filters?: Array<
    | { op: "eq"; field: string; value: any }
    | { op: "in"; field: string; value: any[] }
  >;
  orderBy?: { field: string; ascending?: boolean };
};

export type LookupQuery = {
  table: string;
  valueField: string;
  ids: string[];
  select: string[];
};

export type TreeViewDataProvider = {
  list: (query: TreeViewQuery) => Promise<any[]>;
  lookup?: (query: LookupQuery) => Promise<any[]>;
  remove?: (table: string, id: string) => Promise<void>;
};

type LookupMeta = { label?: string; icon?: string; color?: string };

export type TreeViewProps = {
  config: TreeViewConfig;
  dataProvider: TreeViewDataProvider;
  parentRecord?: any;

  // acciones UI (la app decide qué hace: router.push, modal, etc.)
  onViewRow?: (row: any) => void;
  onEditRow?: (row: any) => void;

  // confirmación (si no lo pasas, usa window.confirm)
  confirmDelete?: (row: any) => Promise<boolean>;
};

function moneyFmt(currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency });
}

function formatDate(value: any, withTime: boolean) {
  if (value === null || value === undefined || value === "") return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  const opts: Intl.DateTimeFormatOptions = withTime
    ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "2-digit", day: "2-digit" };

  return new Intl.DateTimeFormat("es-ES", opts).format(d);
}

function renderValue(value: any, type: ColumnType = "text", currency?: string) {
  if (value === null || value === undefined || value === "") return "—";

  switch (type) {
    case "boolean":
      return value ? (
        <span className="badge bg-success-subtle text-success">Sí</span>
      ) : (
        <span className="badge bg-secondary-subtle text-muted">No</span>
      );

    case "money":
      return moneyFmt(currency).format(Number(value || 0));

    case "date":
      return formatDate(value, false);

    case "datetime":
      return formatDate(value, true);

    case "select":
      return String(value);

    default:
      return String(value);
  }
}

export default function TreeView({
  config,
  dataProvider,
  parentRecord,
  onViewRow,
  onEditRow,
  confirmDelete,
}: TreeViewProps) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [lookupCache, setLookupCache] = useState<Record<string, Record<string, LookupMeta>>>({});

  const currency = config.totals?.currency || "EUR";
  const sumField = config.totals?.sumField;

  const selectFields = useMemo(() => {
  const source = config?.source;
  const grouping = config?.grouping;

  // Si config no está listo, devolvemos un select mínimo seguro
  if (!source || !grouping || !grouping.groupByField) return ["id"];

  if (Array.isArray(source.select) && source.select.length) return source.select;

  const s = new Set<string>(["id", grouping.groupByField]);
  if (grouping.groupTitleField) s.add(grouping.groupTitleField);

  if (grouping.level?.levelField) s.add(grouping.level.levelField);

  for (const c of config.columns || []) s.add(c.field);

  if (config.totals?.enabled && config.totals.sumField) s.add(config.totals.sumField);

  return Array.from(s);
}, [config]);


  const resolvedFilters = useMemo(() => {
    const out: Array<{ op: "eq" | "in"; field: string; value: any }> = [];
    for (const f of config.source.filters || []) {
      if (f.kind === "eq") {
        const v = f.valueFromParent ? parentRecord?.[f.valueFromParent] : f.value;
        if (v !== undefined) out.push({ op: "eq", field: f.field, value: v });
      } else {
        const v = f.valuesFromParent ? parentRecord?.[f.valuesFromParent] : f.values;
        if (Array.isArray(v) && v.length) out.push({ op: "in", field: f.field, value: v });
      }
    }
    return out;
  }, [config.source.filters, parentRecord]);

  async function loadRows() {
    setLoading(true);
    setError(null);
    try {
      const data = await dataProvider.list({
        table: config.source.table,
        select: selectFields,
        filters: resolvedFilters,
        orderBy: config.source.orderBy,
      });

      setRows(data || []);

      if (!openGroupKey && (data?.length || 0) > 0) {
        const firstKey = String(data[0]?.[config.grouping.groupByField] ?? "");
        setOpenGroupKey(firstKey || null);
      }
    } catch (e: any) {
      setError(e?.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }

  async function loadLookups(currentRows: any[]) {
    const lookups = config.lookups || [];
    if (!lookups.length || !dataProvider.lookup) return;

    const next: Record<string, Record<string, LookupMeta>> = {};

    for (const l of lookups) {
      const valueField = l.valueField || "id";
      const ids = Array.from(
        new Set(
          currentRows
            .map((r) => r?.[l.field])
            .filter((x) => x !== null && x !== undefined && String(x) !== "")
            .map((x) => String(x))
        )
      );

      next[l.field] = {};
      if (!ids.length) continue;

      const select = [valueField, l.labelField, l.iconField, l.colorField].filter(Boolean) as string[];

      const data = await dataProvider.lookup({
        table: l.table,
        valueField,
        ids,
        select,
      });

      const map: Record<string, LookupMeta> = {};
      for (const item of data || []) {
        const key = String(item?.[valueField]);
        map[key] = {
          label: item?.[l.labelField],
          icon: l.iconField ? item?.[l.iconField] : undefined,
          color: l.colorField ? item?.[l.colorField] : undefined,
        };
      }

      next[l.field] = map;
    }

    setLookupCache(next);
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.source.table, JSON.stringify(selectFields), JSON.stringify(resolvedFilters), JSON.stringify(config.source.orderBy || {})]);

  useEffect(() => {
    if (rows.length) loadLookups(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const grouped = useMemo(() => {
    const groupBy = config.grouping.groupByField;
    const level = config.grouping.level;

    const groups = new Map<string, any[]>();
    for (const r of rows) {
      const k = String(r?.[groupBy] ?? "");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }

    const out = Array.from(groups.entries()).map(([key, items]) => {
      let levels: Array<{ levelKey: string; items: any[] }> | null = null;

      if (level?.levelField) {
        const lm = new Map<string, any[]>();
        for (const it of items) {
          const lk = String(it?.[level.levelField] ?? "—");
          if (!lm.has(lk)) lm.set(lk, []);
          lm.get(lk)!.push(it);
        }

        levels = Array.from(lm.entries())
          .sort((a, b) => {
            const na = Number(a[0]);
            const nb = Number(b[0]);
            const bothNum = !Number.isNaN(na) && !Number.isNaN(nb);
            if (bothNum) return (level.order === "desc" ? nb - na : na - nb);
            return (level.order === "desc" ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]));
          })
          .map(([levelKey, its]) => ({ levelKey, items: its }));
      }

      const total =
        config.totals?.enabled && sumField
          ? items.reduce((acc, it) => acc + Number(it?.[sumField] || 0), 0)
          : 0;

      return { key, items, levels, total };
    });

    // Ordenar grupos por label (si lookup) o key
    const groupLookup = (config.lookups || []).find((l) => l.field === groupBy);
    out.sort((a, b) => {
      const la = groupLookup ? (lookupCache?.[groupLookup.field]?.[a.key]?.label || a.key) : a.key;
      const lb = groupLookup ? (lookupCache?.[groupLookup.field]?.[b.key]?.label || b.key) : b.key;
      return String(la).localeCompare(String(lb));
    });

    return out;
  }, [rows, config, lookupCache, sumField]);

  const grandTotal = useMemo(() => {
    if (!config.totals?.enabled || !sumField) return 0;
    return rows.reduce((acc, r) => acc + Number(r?.[sumField] || 0), 0);
  }, [rows, config.totals?.enabled, sumField]);

  async function handleDelete(row: any) {
    if (!config.actions?.enableDelete) return;
    if (!dataProvider.remove) {
      setError("Delete no disponible: falta dataProvider.remove()");
      return;
    }

    const ok = confirmDelete
      ? await confirmDelete(row)
      : window.confirm(`¿Eliminar el registro "${row?.id}"?`);

    if (!ok) return;

    setError(null);
    try {
      const table = config.actions.deleteTable || config.source.table;
      await dataProvider.remove(table, row.id);
      await loadRows();
    } catch (e: any) {
      setError(e?.message || "No se pudo eliminar");
    }
  }

  const renderGroupHeader = (groupKey: string) => {
    const groupBy = config.grouping.groupByField;
    const groupLookup = (config.lookups || []).find((l) => l.field === groupBy);
    const meta = groupLookup ? lookupCache?.[groupLookup.field]?.[groupKey] : undefined;
    const label = meta?.label || groupKey || "—";

    return (
      <div className="fw-bold d-flex align-items-center gap-2">
        {meta?.icon && <i className={meta.icon} style={{ color: meta.color || "inherit" }} aria-hidden />}
        <span>{label}</span>
      </div>
    );
  };

  const renderTable = (items: any[]) => (
    <div style={{ overflowX: "auto" }}>
      <table className="table table-hover align-middle mb-0">
        <thead>
          <tr className="text-muted small">
            {config.columns.map((c) => (
              <th key={c.field} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
            {(onViewRow || onEditRow || config.actions?.enableDelete) && (
              <th className="text-end" style={{ width: "1%" }}>
                Acciones
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              {config.columns.map((c) => {
                // Si la columna es FK y hay lookup para ese field, renderiza label
                const lk = (config.lookups || []).find((l) => l.field === c.field);
                const raw = r?.[c.field];
                const meta = lk ? lookupCache?.[lk.field]?.[String(raw ?? "")] : undefined;
                const valueToRender = meta?.label ?? raw;

                return (
                  <td key={c.field} className="fw-semibold">
                    {renderValue(valueToRender, c.type || "text", currency)}
                  </td>
                );
              })}

              {(onViewRow || onEditRow || config.actions?.enableDelete) && (
                <td className="text-end text-nowrap">
                  {onViewRow && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary me-2"
                      onClick={() => onViewRow(r)}
                    >
                      <i className="bi bi-eye" /> Ver
                    </button>
                  )}
                  {onEditRow && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary me-2"
                      onClick={() => onEditRow(r)}
                    >
                      <i className="bi bi-pencil" /> Editar
                    </button>
                  )}
                  {config.actions?.enableDelete && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDelete(r)}
                    >
                      <i className="bi bi-trash" /> Eliminar
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="d-flex flex-column gap-3">
      {config.ui?.title && <div className="fw-semibold">{config.ui.title}</div>}

      {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}

      {loading ? (
        <div className="alert alert-secondary mb-0">Cargando árbol…</div>
      ) : grouped.length === 0 ? (
        <div className="alert alert-secondary mb-0">No hay registros.</div>
      ) : (
        <div className="accordion" id="acc-treeview">
          {grouped.map((g) => {
            const isOpen = openGroupKey === g.key;
            const badgeCount = g.items.length;

            return (
              <div className="accordion-item" key={g.key || "empty"}>
                <h2 className="accordion-header">
                  <button
                    type="button"
                    className={`accordion-button ${isOpen ? "" : "collapsed"}`}
                    onClick={() => setOpenGroupKey((prev) => (prev === g.key ? null : g.key))}
                  >
                    <div className="d-flex w-100 align-items-center justify-content-between">
                      {renderGroupHeader(g.key)}
                      <div className="ms-3 d-flex align-items-center gap-2">
                        <span className="badge text-bg-light">{badgeCount}</span>
                        {config.totals?.enabled && config.totals?.showGroupTotals && (
                          <span className="badge bg-dark">{moneyFmt(currency).format(g.total)}</span>
                        )}
                      </div>
                    </div>
                  </button>
                </h2>

                <div className={`accordion-collapse collapse ${isOpen ? "show" : ""}`}>
                  <div className="accordion-body">
                    {g.levels ? (
                      <div className="d-flex flex-column gap-3">
                        {g.levels.map((lv) => (
                          <div key={lv.levelKey} className="card">
                            <div className="card-header d-flex justify-content-between align-items-center">
                              <div className="fw-semibold">
                                {(config.grouping.level?.labelPrefix || "Nivel")} {lv.levelKey}
                              </div>
                              {config.totals?.enabled && config.totals?.showGroupTotals && sumField && (
                                <span className="badge bg-dark">
                                  {moneyFmt(currency).format(
                                    lv.items.reduce((acc, it) => acc + Number(it?.[sumField] || 0), 0)
                                  )}
                                </span>
                              )}
                            </div>
                            <div className="card-body p-0">{renderTable(lv.items)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      renderTable(g.items)
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {config.totals?.enabled && config.totals?.showGrandTotal && (
            <div className="d-flex justify-content-end align-items-center gap-2 mt-3 pt-3 border-top">
              <div className="fw-semibold">Total</div>
              <div className="fw-bold fs-5">
                <span className="badge bg-success rounded-pill">{moneyFmt(currency).format(grandTotal)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
