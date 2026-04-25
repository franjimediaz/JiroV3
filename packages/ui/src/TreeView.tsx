"use client";

import React, { useEffect, useMemo, useState } from "react";
import {ActionMenu} from "./ActionMenu";
import { normalizeTreeViewConfig } from "@repo/types";
import {
  collectRelationPendingKeys,
  type RelationDisplayStatusMap,
  getRelationDisplayConfig,
  getRelationDisplayResult,
  preloadRelationDisplayCache,
  renderRelationDisplay,
  type RelationDisplayEntry,
} from "./utils/relationDisplay";

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
  moduleSlug?: string;
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
  return normalizeTreeViewConfig(cfg.treeViewConfig ?? cfg) as unknown as LegacyConfig;
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
  const raw = String(value).trim();
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = dateOnlyMatch
    ? new Date(Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3])))
    : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  const opts: Intl.DateTimeFormatOptions = withTime
    ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }
    : { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" };

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

function normalizeComparableLabel(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, "");
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
  const raw = (((cfg as any)?.source?.filters || cfg?.filters || []) as any[]);
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
  const [lookupCache, setLookupCache] = useState<Record<string, RelationDisplayEntry>>({});
  const [lookupStatusByKey, setLookupStatusByKey] = useState<RelationDisplayStatusMap>({});

  const groupByField = (cfg as any)?.grouping?.groupByField;
  const columns = useMemo(() => normalizeColumns(cfg?.columns), [cfg?.columns]);
  const totals = cfg?.totals || {};
  const currency = totals.currency || "EUR";
  const sumField = totals.sumField;
  const sourceRef =
    (cfg as any)?.source?.table ||
    (p.config as any)?.source?.table ||
    (p.config as any)?.sourceTable;

const resolvedSource = useMemo(() => {
  const src = typeof sourceRef === "string" ? sourceRef.trim() : "";
  if (!src) return null;
  return resolveTable?.(src) || null;
}, [resolveTable, sourceRef]);

const sourceTable = resolvedSource?.table || sourceRef;

const baseRoute = useMemo(() => {
  if (!resolveRoute) return null;
  const src = typeof sourceRef === "string" ? sourceRef.trim() : "";
  if (!src) return null;
  const r = resolveRoute(src);
  return r ? cleanBaseRoute(r) : null;
}, [resolveRoute, sourceRef]);

const showActions = true;
  const isReady = !!sourceTable && !!groupByField;

  const fieldsByName = useMemo(() => buildFieldsByName(schemaFields), [schemaFields]);
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
      const configLabel = String(c.label || "").trim();
      const schemaLabel = String(f?.label || "").trim();
      const normalizedConfigLabel = normalizeComparableLabel(configLabel);
      const normalizedFieldName = normalizeComparableLabel(c.field);
      const normalizedSchemaLabel = normalizeComparableLabel(schemaLabel);
      const shouldPreferSchemaLabel =
        !!schemaLabel &&
        (!configLabel ||
          normalizedConfigLabel === normalizedFieldName ||
          normalizedConfigLabel === normalizedSchemaLabel);
      const label = shouldPreferSchemaLabel ? schemaLabel : configLabel || schemaLabel || c.field;


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

  const getResolvedField = (fieldName: string, fallback?: any) => {
    const schemaField = fieldsByName[fieldName];
    if (schemaField) {
      return fallback ? { ...fallback, ...schemaField, name: schemaField.name || fieldName } : schemaField;
    }
    if (!fallback) return null;
    return { ...fallback, name: fallback.name || fallback.field || fieldName };
  };

  // ---------------- selectorTabla lookups ----------------
  // ✅ Regla: TODO selectorTabla intentará traer displayField + icon + color (siempre)
const relationFields = useMemo(() => {
  const selectedNames = new Set<string>(effectiveColumns.map((column) => column.field));
  if (groupByField) selectedNames.add(groupByField);

  const resolvedFields = Array.from(selectedNames)
    .map((fieldName) => {
      const column = effectiveColumns.find((item) => item.field === fieldName);
      return getResolvedField(fieldName, column ? { ...column, field: column.field } : undefined);
    })
    .filter((field): field is any => !!field);

  return resolvedFields.filter((field): field is any => !!getRelationDisplayConfig(field));
}, [effectiveColumns, groupByField, fieldsByName]);

const pendingLookupKeys = useMemo(
  () =>
    collectRelationPendingKeys({
      rows,
      fields: relationFields,
      getValue: (row, field) => row?.[field.name],
      cache: lookupCache,
      statusByKey: lookupStatusByKey,
    }),
  [rows, relationFields, lookupCache, lookupStatusByKey]
);


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
    if (!rows.length || !relationFields.length || !provider) return;

    let cancelled = false;

    void preloadRelationDisplayCache({
      rows,
      fields: relationFields,
      getValue: (row, field) => row?.[field.name],
      dataProvider: provider,
      cache: lookupCache,
      statusByKey: lookupStatusByKey,
    })
      .then(({ patch, statusPatch }) => {
        if (cancelled) return;
        if (Object.keys(patch).length) {
          setLookupCache((prev) => ({ ...prev, ...patch }));
        }
        if (Object.keys(statusPatch).length) {
          setLookupStatusByKey((prev) => ({ ...prev, ...statusPatch }));
        }
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError((prev) => prev || e?.message || "Error cargando lookups");
      });

    return () => {
      cancelled = true;
    };
  }, [
    rows,
    relationFields,
    lookupCache,
    lookupStatusByKey,
    provider,
  ]);

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
      return { key, rawValue: items[0]?.[groupByField!], items, total };
    });

    const headerFieldDef = groupByField ? getResolvedField(groupByField) : null;
    if (headerFieldDef?.type === "selectorTabla") {
      out.sort((a, b) => {
        const config = getRelationDisplayConfig(headerFieldDef);
        const la = config ? getRelationDisplayResult({ config, rawValue: a.rawValue, cache: lookupCache, pendingKeys: pendingLookupKeys, statusByKey: lookupStatusByKey }) : null;
        const lb = config ? getRelationDisplayResult({ config, rawValue: b.rawValue, cache: lookupCache, pendingKeys: pendingLookupKeys, statusByKey: lookupStatusByKey }) : null;
        return String(la?.kind === "resolved" ? la.entry.label : la?.text || a.key).localeCompare(String(lb?.kind === "resolved" ? lb.entry.label : lb?.text || b.key));
      });
    } else if (headerFieldDef?.type === "date" || headerFieldDef?.type === "datetime") {
      out.sort((a, b) =>
        String(formatDate(a.rawValue, headerFieldDef.type === "datetime")).localeCompare(
          String(formatDate(b.rawValue, headerFieldDef.type === "datetime"))
        )
      );
    } else {
      out.sort((a, b) => String(a.key).localeCompare(String(b.key)));
    }

    return out;
  }, [isReady, rows, groupByField, totals.enabled, sumField, fieldsByName, lookupCache, pendingLookupKeys, lookupStatusByKey]);

  const grandTotal = useMemo(() => {
    if (!totals.enabled || !sumField) return 0;
    return rows.reduce((acc, r) => acc + Number(r?.[sumField] || 0), 0);
  }, [rows, totals.enabled, sumField]);

  const hasSelectorColumns =
    effectiveColumns.some((c) => fieldsByName[c.field]?.type === "selectorTabla") ||
    (groupByField && fieldsByName[groupByField]?.type === "selectorTabla");

  const missingResolve = hasSelectorColumns && !resolveTable;
  const missingLookup = hasSelectorColumns && !provider?.lookup;

  // ---------------- render helpers ----------------
  const renderValueForField = (field: any, rawValue: any, fallbackType?: ColumnType) => {
    
    if (field?.type === "selectorTabla") {
      const config = getRelationDisplayConfig(field);
      if (!config) return <span className="text-muted">{normalizeId(rawValue) || "â€”"}</span>;
      

      const result = getRelationDisplayResult({
        config,
        rawValue,
        cache: lookupCache,
        pendingKeys: pendingLookupKeys,
        statusByKey: lookupStatusByKey,
      });
      if (result.kind === "resolved") {
        return config.hasStyle
          ? renderRelationDisplay(result.entry.label, result.entry.icon, result.entry.color)
          : result.entry.label;
      }
      

      return <span className="text-muted">{result.text}</span>;
    
    }

    return <>{renderPrimitive(rawValue, fallbackType || field?.type || "text", currency)}</>;
    
  };

  const renderGroupHeader = (groupKey: any) => {
    if (!groupByField) return <div className="fw-bold">{String(groupKey || "â€”")}</div>;

    const f = getResolvedField(groupByField);
    return <div className="fw-bold">{renderValueForField(f, groupKey, f?.type)}</div>;
    /*
    if (f?.type === "selectorTabla") {
      const config = lookupConfigByField[groupByField];
      const result = config
        ? getRelationDisplayResult({ config, rawValue: groupKey, cache: lookupCache, pendingKeys: pendingLookupKeys, statusByKey: lookupStatusByKey })
        : null;
      return (
        <div className="fw-bold d-flex align-items-center gap-2">
          {result?.kind === "resolved"
            ? renderRelationDisplay(result.entry.label, result.entry.icon, result.entry.color)
            : <span>{result?.text || String(groupKey || "—")}</span>}
        </div>
      );
    }

    return <div className="fw-bold">{String(groupKey || "—")}</div>;
    */
  };

  const renderCell = (row: any, col: NormalizedColumn) => {
    const f = getResolvedField(col.field, col);
    const raw = row?.[col.field];
    return renderValueForField(f, raw, col.type || "text");
    /*

    if (f?.type === "selectorTabla") {
      const config = lookupConfigByField[col.field];
      if (!config) return <span className="text-muted">{normalizeId(raw) || "—"}</span>;

      const result = getRelationDisplayResult({
        config,
        rawValue: raw,
        cache: lookupCache,
        pendingKeys: pendingLookupKeys,
        statusByKey: lookupStatusByKey,
      });

      if (result.kind === "resolved") {
        return config.hasStyle
          ? renderRelationDisplay(result.entry.label, result.entry.icon, result.entry.color)
          : result.entry.label;
      }

      return <span className="text-muted">{result.text}</span>;
    }

    return <>{renderPrimitive(raw, col.type || "text", currency)}</>;
    */
  };

  const renderTable = (items: any[]) => (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead>
          <tr className="text-muted small">
            {(effectiveColumns || []).map((c, idx) => (
              <th key={`${c.field}__${idx}`} style={{
                          ...(c.width ? { width: c.width } : {}),
                          background: "linear-gradient(90deg, #13367c, #13367c, #13367c)",
                          color:"white",
                          borderRight: "1px solid rgb(0, 0, 0)"

                        }}>
                {c.label}
              </th>
            ))}
            {showActions && (
              <th className="text-end" style={{
                 width: "1%",
                  background: "linear-gradient(90deg, #13367c, #13367c, #13367c)",
                  color:"white",
                  borderRight: "1px solid rgb(0, 0, 0)"}}>
                
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {items.map((r, ridx) => (
            <tr key={normalizeId(r?.id) || String(ridx)}>
              {(effectiveColumns || []).map((c, idx) => (
                <td key={`${c.field}__${idx}`} className="fw-semibold" style={{
                  borderRight: "1px solid rgb(0, 0, 0)"
                }}>
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
                      {renderGroupHeader(g.rawValue)}
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






