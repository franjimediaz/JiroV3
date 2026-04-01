"use client";

import React, { useEffect, useMemo, useState } from "react";
import {ActionMenu} from "./ActionMenu";

type ColumnType = "text" | "money" | "date" | "datetime" | "boolean" | "select" | "percent";
type LegacyFilter =
  | { op: "eq" | "in"; field: string; value: any }
  | { op: "eq"; field: string; valueFromParent: string } // "id" o "cliente.id"
  | { op: "in"; field: string; valuesFromParent: string };

type LegacyConfig = {
  sourceTable?: string;
  groupBy?: string[];
  columns?: any[];
  totals?: {
    enabled?: boolean;
    sumField?: string;
    currency?: string;
    showGroupTotals?: boolean;
    showGrandTotal?: boolean;
  };
  ui?: { title?: string };
  orderBy?: { field: string; ascending?: boolean };
  filters?: LegacyFilter[];
};

type TreeViewQuery = {
  table: string;
  select: string[];
  filters?: Array<
    | { op: "eq"; field: string; value: any }
    | { op: "in"; field: string; value: any[] }
  >;
  orderBy?: { field: string; ascending?: boolean };
};

type LookupQuery = {
  table: string;
  valueField: string;
  ids: string[];
  select: string[];
};

type TreeViewDataProvider = {
  list: (query: TreeViewQuery) => Promise<any[]>;
  lookup?: (query: LookupQuery) => Promise<any[]>;
  remove?: (table: string, id: string) => Promise<void>;
};

type ResolveTableFn = (moduleSlug: string) => { table: string; valueField?: string } | null;

type LookupMeta = { label?: string; icon?: string; color?: string };

type NormalizedColumn = {
  field: string;
  label: string;
  type?: ColumnType;
  width?: string;
  options?: string[];
};

type Props = {
  config?: any;
  dataProvider?: any;
  parentRecord?: any;
  schemaFields?: any;

  onViewRow?: any;
  onEditRow?: any;
  confirmDelete?: any;
  resolveTable?: any;
  resolveRoute?: any;
};
type ResolveRouteFn = (source: string) => string | null;
// ---------------- unwrap helpers ----------------


function unwrapConfig(cfg: any): LegacyConfig | null {
  if (!cfg) return null;
  if (cfg.treeViewConfig) return cfg.treeViewConfig as LegacyConfig;
  return cfg as LegacyConfig;
}
function unwrapProvider(p: any): TreeViewDataProvider | null {
  if (!p) return null;
  if (p.treeViewProvider) return p.treeViewProvider as TreeViewDataProvider;
  return p as TreeViewDataProvider;
}
function unwrapParentRecord(pr: any): any {
  if (!pr) return undefined;
  if (pr.treeViewParentRecord !== undefined) return pr.treeViewParentRecord;
  return pr;
}
function unwrapSchemaFields(sf: any): any[] {
  if (!sf) return [];
  if (Array.isArray(sf)) return sf;
  if (Array.isArray(sf.schemalog)) return sf.schemalog;
  if (Array.isArray(sf.fields)) return sf.fields;
  return [];
}
function unwrapFn(v: any, key?: string): any {
  if (!v) return undefined;
  if (typeof v === "function") return v;
  if (key && typeof v?.[key] === "function") return v[key];
  return undefined;
}
function unwrapResolveTable(v: any): ResolveTableFn | undefined {
  if (!v) return undefined;
  if (typeof v === "function") return v as ResolveTableFn;
  if (typeof v?.resolveTable === "function") return v.resolveTable as ResolveTableFn;
  return undefined;
}
function unwrapResolveRoute(v: any): ResolveRouteFn | undefined {
  if (!v) return undefined;
  if (typeof v === "function") return v as ResolveRouteFn;
  if (typeof v?.resolveRoute === "function") return v.resolveRoute as ResolveRouteFn;
  return undefined;
}


// ---------------- format helpers ----------------

function toBool(v: any) {
  if (v === true) return true;
  if (v === false) return false;
  if (v === 1 || v === "1") return true;
  if (v === 0 || v === "0") return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "yes" || s === "si") return true;
    if (s === "false" || s === "no") return false;
  }
  return false;
}


function moneyFmt(currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency });
}
function percentFmt() {
  return new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 2 });
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
function renderPrimitive(value: any, type: ColumnType = "text", currency?: string) {
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
    case "percent":
      return percentFmt().format(Number(value || 0) / 100);
    case "date":
      return formatDate(value, false);
    case "datetime":
      return formatDate(value, true);
    default:
      return String(value);
  }
}

// FK normalization: evita `[object Object]`, nulls, etc.
function normalizeId(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s || s.toLowerCase() === "undefined" || s.toLowerCase() === "null") return null;
    return s;
  }
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const maybe = (v as any).id ?? (v as any).value ?? null;
    return normalizeId(maybe);
  }
  return null;
}

function normalizeColumns(input: any): NormalizedColumn[] {
  const cols = Array.isArray(input) ? input : [];
  const out: NormalizedColumn[] = [];

  for (const c of cols) {
    if (typeof c === "string") {
      out.push({ field: c, label: "", type: "text" });
      continue;
    }
    if (c && typeof c === "object") {
      const field =
        typeof c.field === "string"
          ? c.field
          : typeof c.name === "string"
          ? c.name
          : null;
      if (!field) continue;

      out.push({
        field,
        label: typeof c.label === "string" ? c.label : field,
        type: (c.type as ColumnType) || undefined,
        width: typeof c.width === "string" ? c.width : undefined,
        options: Array.isArray(c.options) ? c.options : undefined,
      });
    }
  }

  // dedupe por field
  const seen = new Set<string>();
  return out.filter((c) => {
    if (!c.field) return false;
    if (seen.has(c.field)) return false;
    seen.add(c.field);
    return true;
  });
}

function buildFieldsByName(schemaFields: any[]) {
  const map: Record<string, any> = {};
  for (const f of schemaFields || []) {
    if (f?.name) map[f.name] = f;
  }
  return map;
}

function getLookupMeta(cache: Record<string, Record<string, LookupMeta>>, field: string, rawValue: any) {
  const k = normalizeId(rawValue);
  if (!k) return undefined;
  return cache?.[field]?.[k];
}

function dedupeStrings(arr: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of arr) {
    if (!s || typeof s !== "string") continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
function cleanBaseRoute(base: string) {
  if (!base) return "";
  // asegura que empieza con "/"
  let b = base.trim();
  if (!b.startsWith("/")) b = `/${b}`;
  // quita trailing slash
  if (b.length > 1 && b.endsWith("/")) b = b.slice(0, -1);
  return b;
}
function joinRoute(base: string, id: any) {
  const b = cleanBaseRoute(base);
  const rid = String(id ?? "").trim();
  if (!b || !rid) return null;
  return `${b}/${encodeURIComponent(rid)}`;
}
function getByPath(obj: any, path: string) {
  if (!obj || !path) return undefined;
  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  let cur = obj;
  for (const key of parts) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}





export default function TreeView(p: Props) {
  // unwrap props as you send them
  const cfg = useMemo(() => unwrapConfig(p.config), [p.config]);
  const provider = useMemo(() => unwrapProvider(p.dataProvider), [p.dataProvider]);
  const parentRecord = useMemo(() => unwrapParentRecord(p.parentRecord), [p.parentRecord]);
  const schemaFields = useMemo(() => unwrapSchemaFields(p.schemaFields), [p.schemaFields]);

  const onViewRow = useMemo(() => unwrapFn(p.onViewRow, "onTreeViewRowView"), [p.onViewRow]);
  const onEditRow = useMemo(() => unwrapFn(p.onEditRow, "onTreeViewRowEdit"), [p.onEditRow]);
  const confirmDelete = useMemo(() => unwrapFn(p.confirmDelete, "confirmTreeViewDelete"), [p.confirmDelete]);
  const resolveTable = useMemo(() => unwrapResolveTable(p.resolveTable), [p.resolveTable]);
  const resolveRoute = useMemo(() => unwrapResolveRoute(p.resolveRoute), [p.resolveRoute]);
  const normalizedFilters = useMemo<TreeViewQuery["filters"]>(() => {
  const raw = (cfg?.filters || []) as any[];
  const out: TreeViewQuery["filters"] = [];

  for (const f of raw) {
    if (!f?.field || !f?.op) continue;

    // ✅ valor fijo (legacy)
    if ("value" in f) {
      if (f.op === "eq") {
        if (f.value === undefined) continue;
        out.push({ op: "eq", field: f.field, value: f.value });
      } else if (f.op === "in") {
        if (!Array.isArray(f.value) || f.value.length === 0) continue;
        out.push({ op: "in", field: f.field, value: f.value });
      }
      continue;
    }

    // ✅ valueFromParent (nuevo)
    if (f.op === "eq" && typeof f.valueFromParent === "string") {
      const v = getByPath(parentRecord, f.valueFromParent);
      if (v === undefined) continue;
      out.push({ op: "eq", field: f.field, value: v });
      continue;
    }

    // ✅ valuesFromParent (nuevo, arrays)
    if (f.op === "in" && typeof f.valuesFromParent === "string") {
      const v = getByPath(parentRecord, f.valuesFromParent);
      if (!Array.isArray(v) || v.length === 0) continue;
      out.push({ op: "in", field: f.field, value: v });
      continue;
    }
  }

  return out;
}, [cfg?.filters, parentRecord]);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [lookupCache, setLookupCache] = useState<Record<string, Record<string, LookupMeta>>>({});

  // legacy config fields

  const groupByField = Array.isArray(cfg?.groupBy) && cfg!.groupBy!.length ? cfg!.groupBy![0] : undefined;
  const columns = useMemo(() => normalizeColumns(cfg?.columns), [cfg?.columns]);
  const totals = cfg?.totals || {};
  const currency = totals.currency || "EUR";
  const sumField = totals.sumField;
  const sourceTable =
    cfg?.sourceTable ||
    (cfg as any)?.source?.table ||
    (p.config as any)?.sourceTable ||
    (p.config as any)?.source?.table;

const baseRoute = useMemo(() => {
  if (!resolveRoute) return null;
  const src = typeof sourceTable === "string" ? sourceTable.trim() : "";
  if (!src) return null;
  const r = resolveRoute(src);
  return r ? cleanBaseRoute(r) : null;
}, [resolveRoute, sourceTable]);

const canNavigateByRoute = !!baseRoute;
const hasActionHandlers = !!onViewRow || !!onEditRow;
const showActions = true;





  const isReady = !!sourceTable && !!groupByField;

  const fieldsByName = useMemo(() => buildFieldsByName(schemaFields), [schemaFields]);
  const defaultView = useMemo(() => {
  if (!baseRoute) return undefined;
  return (row: any) => {
    const url = joinRoute(baseRoute, row?.id);
    if (!url) return;
    window.location.assign(url);
  };
}, [baseRoute]);

const defaultEdit = useMemo(() => {
  if (!baseRoute) return undefined;
  return (row: any) => {
    const url = joinRoute(baseRoute, row?.id);
    if (!url) return;
    window.location.assign(`${url}?edit=true`);
  };
}, [baseRoute]);


const handleView = onViewRow
  ? (row: any) => onViewRow(row)
  : baseRoute
  ? (row: any) => {
      const url = joinRoute(baseRoute, row?.id);
      if (!url) return;
      window.location.assign(url);
    }
  : undefined;

const handleEdit = onEditRow
  ? (row: any) => onEditRow(row)
  : baseRoute
  ? (row: any) => {
      const url = joinRoute(baseRoute, row?.id);
      if (!url) return;
      window.location.assign(`${url}?edit=true`);
    }
  : undefined;



  // infer column types from schema if missing
  const effectiveColumns: NormalizedColumn[] = useMemo(() => {
    return columns.map((c) => {
      const f = fieldsByName[c.field];
      const hasRealLabel = !!c.label && c.label.trim() !== "" && c.label !== c.field;
      const label = hasRealLabel ? c.label : (f?.label || c.field);


      let type = c.type;
      if (!type && f?.type) {
        if (f.type === "money") type = "money";
        else if (f.type === "percent") type = "percent";
        else if (f.type === "date") type = "date";
        else if (f.type === "datetime") type = "datetime";
        else if (f.type === "boolean") type = "boolean";
        else if (f.type === "select") type = "select";
        else type = "text";
      }

      const options = c.options || f?.options;

      return { ...c, label, type, options };
    });
  }, [columns, fieldsByName]);

  // list select fields
  const selectFields = useMemo(() => {
    const s = new Set<string>(["id"]);
    if (groupByField) s.add(groupByField);
    for (const c of effectiveColumns) s.add(c.field);
    if (totals.enabled && sumField) s.add(sumField);
    return Array.from(s);
  }, [groupByField, effectiveColumns, totals.enabled, sumField]);

  // ---------------- selectorTabla lookups ----------------
  // ✅ Regla: TODO selectorTabla intentará traer displayField + icon + color (siempre)
  const selectorLookups = useMemo(() => {
  const out: Array<{
    field: string;
    table: string;
    valueField: string;
    labelField: string;
    hasStyle: boolean;
    iconField?: string;
    colorField?: string;
  }> = [];

  const addLookup = (fieldName: string) => {
    const f = fieldsByName[fieldName];
    if (!f || f.type !== "selectorTabla") return;

    const ref = f.ref || {};
    const moduleSlug = ref.moduleSlug;
    const displayField = ref.displayField;

    if (!moduleSlug || !displayField) return;
    if (!resolveTable) return;

    const resolved = resolveTable(moduleSlug);
    if (!resolved?.table) return;

    const hasStyle = toBool(ref.hasStyle);

    out.push({
      field: fieldName,
      table: resolved.table,
      valueField: ref.valueField || resolved.valueField || "id",
      labelField: displayField,
      hasStyle,
      iconField: hasStyle ? (ref.styleIconField || "icon") : undefined,
      colorField: hasStyle ? (ref.styleColorField || "color") : undefined,
    });
  };

  for (const c of effectiveColumns) addLookup(c.field);
  if (groupByField) addLookup(groupByField);

  const by = new Map<string, any>();
  for (const l of out) by.set(l.field, l);
  return Array.from(by.values());
}, [effectiveColumns, groupByField, fieldsByName, resolveTable]);


  // ---------------- load rows ----------------
  async function loadRows() {
    if (!isReady) {
      setLoading(false);
      setRows([]);
      return;
    }
    if (!provider?.list) {
      setLoading(false);
      setError("TreeView: falta dataProvider.list()");
      setRows([]);
      return;
    }

    setLoading(true);
    setError(null);
    console.log("TREE list query", {
        table: sourceTable,
        selectFields,
        normalizedFilters,
        parentId: parentRecord?.id,
      });

    try {
      const data = await provider.list({
        table: sourceTable!,
        select: selectFields,
        filters: normalizedFilters || [],
        orderBy: cfg?.orderBy,
      });

      const list = Array.isArray(data) ? data : [];
      setRows(list);

      if (!openGroupKey && list.length > 0) {
        const k = normalizeId(list[0]?.[groupByField!]);
        setOpenGroupKey(k || null);
      }
    } catch (e: any) {
      setError(e?.message || "Error cargando datos");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // ---------------- load lookups ----------------
  async function loadLookups(list: any[]) {
    if (!provider?.lookup) return;
    if (!selectorLookups.length) return;

    try {
      const next: Record<string, Record<string, LookupMeta>> = {};

      for (const lk of selectorLookups) {
        const ids = dedupeStrings(
          (list || [])
            .map((r) => normalizeId(r?.[lk.field]))
            .filter(Boolean) as string[]
        );

        next[lk.field] = {};
        if (!ids.length) continue;

        // ✅ siempre pedir: valueField + labelField + icon + color
        const baseSelect = [lk.valueField, lk.labelField];

        const styleSelect = lk.hasStyle
          ? [lk.iconField, lk.colorField].filter(Boolean)
          : [];

        const select = dedupeStrings([...baseSelect, ...(styleSelect as string[])]);


        const data = await provider.lookup({
          table: lk.table,
          valueField: lk.valueField,
          ids,
          select,
        });

        const map: Record<string, LookupMeta> = {};
        for (const item of data || []) {
          const key = normalizeId(item?.[lk.valueField]);
          if (!key) continue;

          map[key] = {
            label: item?.[lk.labelField],
            icon: item?.[lk.iconField],
            color: item?.[lk.colorField],
          };
        }

        next[lk.field] = map;
      }

      setLookupCache(next);
    } catch (e: any) {
      setError((prev) => prev || e?.message || "Error cargando lookups");
    }
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isReady,
    sourceTable,
    JSON.stringify(selectFields),
    JSON.stringify(normalizedFilters),
    JSON.stringify(cfg?.orderBy || {}),
    provider,
  ]);

  useEffect(() => {
    if (!rows.length) return;
    loadLookups(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, JSON.stringify(selectorLookups), provider?.lookup]);

  // ---------------- group ----------------
  const grouped = useMemo(() => {
    if (!isReady) return [];

    const groups = new Map<string, any[]>();
    for (const r of rows) {
      const k = normalizeId(r?.[groupByField!]) || "";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }

    const out = Array.from(groups.entries()).map(([key, items]) => {
      const total =
        totals.enabled && sumField
          ? items.reduce((acc, it) => acc + Number(it?.[sumField] || 0), 0)
          : 0;
      return { key, items, total };
    });

    const headerFieldDef = groupByField ? fieldsByName[groupByField] : null;
    if (headerFieldDef?.type === "selectorTabla") {
      out.sort((a, b) => {
        const la = getLookupMeta(lookupCache, groupByField!, a.key)?.label || a.key;
        const lb = getLookupMeta(lookupCache, groupByField!, b.key)?.label || b.key;
        return String(la).localeCompare(String(lb));
      });
    } else {
      out.sort((a, b) => String(a.key).localeCompare(String(b.key)));
    }

    return out;
  }, [isReady, rows, groupByField, totals.enabled, sumField, fieldsByName, lookupCache]);

  const grandTotal = useMemo(() => {
    if (!totals.enabled || !sumField) return 0;
    return rows.reduce((acc, r) => acc + Number(r?.[sumField] || 0), 0);
  }, [rows, totals.enabled, sumField]);

  // ---------------- render helpers ----------------
  const renderGroupHeader = (groupKey: string) => {
    if (!groupByField) return <div className="fw-bold">{groupKey}</div>;

    const f = fieldsByName[groupByField];
    if (f?.type === "selectorTabla") {
      const meta = getLookupMeta(lookupCache, groupByField, groupKey);
      return (
        <div className="fw-bold d-flex align-items-center gap-2">
          {meta?.icon && <i className={meta.icon} style={{ color: meta.color || "inherit" }} aria-hidden />}
          <span>{meta?.label || String(groupKey || "—")}</span>
        </div>
      );
    }

    return <div className="fw-bold">{String(groupKey || "—")}</div>;
  };

  const renderCell = (row: any, col: NormalizedColumn) => {
    const f = fieldsByName[col.field];
    const raw = row?.[col.field];

    if (f?.type === "selectorTabla") {
      const meta = getLookupMeta(lookupCache, col.field, raw);
      if (meta?.label) {
        return (
          <span className="d-inline-flex align-items-center gap-2">
            {meta.icon && <i className={meta.icon} style={{ color: meta.color || "inherit" }} aria-hidden />}
            <span>{meta.label}</span>
          </span>
        );
      }
      const id = normalizeId(raw);
      return <span className="text-muted">{id || "—"}</span>;
    }

    return <>{renderPrimitive(raw, col.type || "text", currency)}</>;
  };

  const renderTable = (items: any[]) => (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead>
          <tr className="text-muted small">
            {(effectiveColumns || []).map((c, idx) => (
              <th key={`${c.field}__${idx}`} style={{
                          ...(c.width ? { width: c.width } : {}),
                          background: "linear-gradient(90deg, #0d275a, #11294ec4, #4d648a96)",
                          color:"white"

                        }}>
                {c.label}
              </th>
            ))}
            {showActions && (
              <th className="text-end" style={{ width: "1%", background: "linear-gradient(90deg, #0d275a, #11294ec4, #4d648a96)",color:"white"}}>
                Acciones
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {items.map((r, ridx) => (
            <tr key={normalizeId(r?.id) || String(ridx)}>
              {(effectiveColumns || []).map((c, idx) => (
                <td key={`${c.field}__${idx}`} className="fw-semibold">
                  {renderCell(r, c)}
                </td>
              ))}

              {showActions && (
                

                <td className="text-end text-nowrap">
                <ActionMenu
                  items={[
                    handleView && {
                      label: "Ver",
                      icon: <i className="bi bi-eye" />,
                      onClick: () => handleView?.(r),
                    },
                    handleEdit && {
                      label: "Editar",
                      icon: <i className="bi bi-pencil" />,
                      onClick: () => handleEdit?.(r),
                    }
                  ]}
                />
              </td>
                
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ---------------- guards / UX ----------------
  if (!p.config) return <div className="alert alert-warning mb-0">TreeView: falta <code>config</code>.</div>;
  if (!cfg) return <div className="alert alert-warning mb-0">TreeView: config inválido.</div>;
  if (!provider) return <div className="alert alert-warning mb-0">TreeView: falta <code>dataProvider</code>.</div>;

  if (!isReady) {
    return (
      <div className="alert alert-warning mb-0">
        TreeView: configuración incompleta.
        <div className="small text-muted mt-1">
          Requiere <code>sourceTable</code> y <code>groupBy[0]</code>.
        </div>
      </div>
    );
  }

  const hasSelectorColumns =
    effectiveColumns.some((c) => fieldsByName[c.field]?.type === "selectorTabla") ||
    (groupByField && fieldsByName[groupByField]?.type === "selectorTabla");

  const missingResolve = hasSelectorColumns && !resolveTable;
  const missingLookup = hasSelectorColumns && !provider.lookup;

  useEffect(() => {
  console.log("TREE route debug", { sourceTable, baseRoute });
}, [sourceTable, baseRoute]);


  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center justify-content-between">
        
        
      </div>

      {missingResolve && (
        <div className="alert alert-warning py-2 mb-0">
          Hay campos <code>selectorTabla</code> pero no se recibió <code>resolveTable()</code>. Sin esto no se puede
          resolver la tabla destino para el lookup.
        </div>
      )}

      {missingLookup && (
        <div className="alert alert-warning py-2 mb-0">
          Hay campos <code>selectorTabla</code> pero el provider no tiene <code>lookup()</code>. Sin lookup, se verán IDs.
        </div>
      )}

      {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}

      {loading ? (
        <div className="alert alert-secondary mb-0">Cargando árbol…</div>
      ) : grouped.length === 0 ? (
        <div className="alert alert-secondary mb-0">No hay registros.</div>
      ) : (
        <div className="accordion" id="acc-treeview">
          {grouped.map((g) => {
            const isOpen = openGroupKey === g.key;

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
                        <span className="badge text-bg-light">{g.items.length}</span>
                        {totals.enabled && totals.showGroupTotals && sumField && (
                          <span className="badge bg-dark">{moneyFmt(currency).format(g.total)}</span>
                        )}
                      </div>
                    </div>
                  </button>
                </h2>

                <div className={`accordion-collapse collapse ${isOpen ? "show" : ""}`}>
                  <div className="accordion-body">{renderTable(g.items)}</div>
                </div>
              </div>
            );
          })}

          {totals.enabled && totals.showGrandTotal && sumField && (
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
