"use client";

import React, { useMemo, useState, useEffect } from "react";
import type {Field, FieldType, ListViewProps, CacheEntry  } from "@repo/types";
import { ActionMenu } from "./ActionMenu";
import { dataProvider } from "./providers/DataProvider";
import  SelectorTabla  from "./Selector";

type FilterValue =
  | string
  | { value: string; label: string };

export default function ListView({
  schema,
  data,
  loading,
  onViewRow,
  onEditRow,
  onDeleteRow,
  onCreate,
  onExport,
  onImport,
}: ListViewProps) {
  const primaryKey = schema.db.primaryKey || "id";
  const [showFilters, setShowFilters] = useState(false);

  // Columnas de la lista
  const listFields = useMemo(() => {
    const fields = schema.fields || [];

    // 1) prioridad: appareance === "List"
    const byAppareance = fields.filter((f) => f.appareance === "List" || f.appareance === "Always");
    if (byAppareance.length > 0) return byAppareance;

    // 2) si no hay appareance List, usar list === true
    const byListFlag = fields.filter((f) => f.list);
    if (byListFlag.length > 0) return byListFlag;

    // 3) fallback: todos los visibles (o sin visible definido)
    return fields.filter((f) => f.visible !== false);
  }, [schema.fields]);

  // Campos que tienen filtro
  const filterFields = useMemo(
    () => (schema.fields || []).filter((f) => f.filter),
    [schema.fields]
  );

  const [filters, setFilters] = useState<Record<string, FilterValue>>({});

  const [openSelector, setOpenSelector] = useState<{
  field: Field;
} | null>(null);

  // Cache para resolver selectorTabla (id -> displayField) en la lista
  const [labelCache, setLabelCache] = useState<Record<string, CacheEntry>>({});

  useEffect(() => {
    if (!filteredData?.length) return;

    preloadSelectorLabels({
      rows: filteredData,
      fields: listFields,
      dataProvider,
      cache: labelCache,
      setCache: setLabelCache,
    }).catch(() => {
      // si falla, degradamos mostrando el id
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ listFields]);

  const handleFilterChange = (fieldName: string, value: FilterValue) => {
    setFilters((prev) => ({ ...prev, [fieldName]: value }));
  };

  // Aplicar filtros sobre data
  const filteredData = useMemo(() => {
  if (!filterFields.length) return data;

  return data.filter((row) => {
    for (const f of filterFields) {
      const fv = filters[f.name];
      if (!fv) continue;

      const cell = row[f.name];
      if (cell === null || cell === undefined) return false;

      // ✅ selectorTabla: filtra por id exacto (lo más lógico)
      if (f.type === "selectorTabla") {
        const wanted = typeof fv === "object" ? fv.value : String(fv);
        if (!wanted) continue;
        if (String(cell) !== wanted) return false;
        continue;
      }

      // ✅ resto: contains (tu comportamiento actual)
      const cellStr = String(cell).toLowerCase();
      const filterStr =
        (typeof fv === "string" ? fv : fv.label).toLowerCase().trim();

      if (filterStr && !cellStr.includes(filterStr)) return false;
    }
    return true;
  });
}, [data, filterFields, filters]);

// ---------------- PAGINACIÓN ----------------
  const [pageSize, setPageSize] = useState<number>(10); // ✅ por defecto 10
  const [page, setPage] = useState<number>(1);

  const totalRows = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  // Si cambian filtros o pageSize, vuelve a la primera página (evita páginas vacías)
  useEffect(() => {
    setPage(1);
  }, [pageSize, JSON.stringify(filters)]);

  // Si por cualquier razón page queda fuera de rango, corrige
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  const pagedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, page, pageSize]);


  const icon = schema.ui?.icon;
  const color = schema.ui?.color;
  const tableName = schema.db.table;
  const tableTitle = schema.db?.name;

  return (
    <div className="card" style={{ borderColor: "rgb(136, 135, 135)" }}>
      {/* HEADER */}
      <div className="card-header d-flex justify-content-between  align-items-center">
        <div className="d-flex align-items-center gap-2">
          {icon && <i className={icon} style={{ color, fontSize: 40 }} />}
          <div>
            <div className="fw-semibold " style={{ fontSize: 14 }}>
              {capitalize(tableName)}
            </div>
            
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {loading && (
            <span className="small text-muted">Cargando…</span>
          )}
          

          {onCreate && (
            <button
              type="button"
              className="btn btn-sm btn-success"
              onClick={onCreate}
            >
              <i className="bi bi-plus-lg me-1" />
              
            </button>
          )}
          {filterFields.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              title="Mostrar filtros"
              onClick={() => setShowFilters(v => !v)}
            >
              <i className={`bi ${showFilters ? "bi-x-lg" : "bi-search"}`} />
            </button>
          )}
          {onExport && (
            <button
              type="button"
              className="btn btn-sm btn-success"
              onClick={onCreate}
            >
              <i className="bi bi-download" />
              
            </button>
          )}
          {onImport && (
            <button
              type="button"
              className="btn btn-sm btn-success"
              onClick={onCreate}
            >
              <i className="bi bi-upload" />
              
            </button>
          )}

        </div>
      </div>

      {/* FILTROS */}
      
      {filterFields.length > 0 && showFilters && (
          <div className="card-body border-bottom">
            <div className="row g-2">
              {filterFields.map((f) => {
                const val = filters[f.name];
                const isSelector = f.type === "selectorTabla";
                const ref = (f as any).ref || {};

                return (
                  <div key={f.name} className="col-12 col-md-3">
                    <label
                      className="formsearch-label mb-1"
                      style={{ fontSize: 12 }}
                    >
                      {f.label}
                    </label>

                    {isSelector ? (
                      <SelectorTabla
                        moduleSlug={ref.moduleSlug}
                        displayField={ref.displayField}
                        valueField={ref.valueField || "id"}
                        filters={ref.filters}
                        sort={ref.sort}
                        value={
                          typeof val === "object" && val !== null
                            ? val.value
                            : val || ""
                        }
                        onChange={(v) =>
                          handleFilterChange(f.name, {
                            value: v,
                            label: "", // se resolverá por cache interna del selector
                          })
                        }
                        placeholder={`Filtrar ${f.label}`}
                      />
                    ) : (
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder={`Filtrar ${f.label}`}
                        value={typeof val === "string" ? val : ""}
                        onChange={(e) =>
                          handleFilterChange(f.name, e.target.value)
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}


      {/* TABLA */}
      <div className="table-responsive">
        <table className="table table-sm mb-0 align-middle table-hover">
          <thead>
            <tr>
              {listFields.map((f) => (
                <th key={f.name} className="text-nowrap" style={{ background: color || "#5374a1ff" }}>
                  {f.label}
                </th>
              ))}
              {(onViewRow || onEditRow || onDeleteRow) && (
                <th className="text-end text-nowrap" style={{ background: color || "#5374a1ff" }}>Acciones</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    listFields.length +
                    (onViewRow || onEditRow || onDeleteRow ? 1 : 0)
                  }
                  className="text-center text-muted py-4"
                >
                  {loading ? "Cargando…" : "No se encontraron registros."}
                </td>
              </tr>
            ) : (
              pagedData.map((row, idx) => (
                <tr key={row[primaryKey] ?? idx}>
                  {listFields.map((f) => (
                    <td key={f.name} className="text-nowrap hover-cell">
                      {renderCell(row[f.name], f, labelCache)}
                    </td>
                  ))}

                  {(onViewRow || onEditRow || onDeleteRow) && (
                    <td className="text-end text-nowrap">
                      <ActionMenu
                        items={[
                          onViewRow && {
                            label: "Ver",
                            icon: <i className="bi bi-eye" />,
                            onClick: () => onViewRow(row),
                          },
                          onEditRow && {
                            label: "Editar",
                            icon: <i className="bi bi-pencil" />,
                            onClick: () => onEditRow(row),
                          },
                          onDeleteRow && {
                            label: "Eliminar",
                            icon: <i className="bi bi-trash" />,
                            variant: "danger",
                            onClick: () => onDeleteRow(row),
                          },
                        ]}
                      />
                    </td>

                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
            {/* FOOTER: page size + paginación */}
      <div className="card-body d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 border-top">
        <div className="d-flex align-items-center gap-2">
          <span className="small text-muted">Mostrar</span>
          <select
            className="form-select form-select-sm pageSizeSelect"
            style={{ width: 110 }}
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {[10, 20, 50, 80].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="small text-muted">registros</span>

          <span className="small text-muted ms-2">
            {totalRows === 0
              ? "0 resultados"
              : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalRows)} de ${totalRows}`}
          </span>
        </div>

        {/* Paginación */}
        <nav aria-label="Paginación" className="ms-md-auto">
          <ul className="pagination pagination-sm mb-0">
            <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
              <button className="page-link" onClick={() => setPage(1)} disabled={page <= 1}>
                «
              </button>
            </li>
            <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
              <button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                ‹
              </button>
            </li>

            {getPageItems(page, totalPages).map((it, i) => {
              if (it === "...") {
                return (
                  <li key={`dots_${i}`} className="page-item disabled">
                    <span className="page-link">…</span>
                  </li>
                );
              }
              const n = it as number;
              return (
                <li key={n} className={`page-item ${n === page ? "active" : ""}`}>
                  <button className="page-link" onClick={() => setPage(n)}>
                    {n}
                  </button>
                </li>
              );
            })}

            <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
              <button
                className="page-link"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                ›
              </button>
            </li>
            <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
              <button className="page-link" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
                »
              </button>
            </li>
          </ul>
        </nav>
      </div>

    </div>
  );
}

/* ---------- Helpers ---------- */

function capitalize(str: string) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getSelectorRef(ref: any): { moduleSlug?: string; displayField?: string; valueField?: string } | null {
  if (!ref || typeof ref !== "object") return null;
  
  if ("displayField" in ref) return ref;
  return null;
}

function cacheKey(moduleSlug: string, id: string) {
  return `${moduleSlug}::${id}`;
}
async function preloadSelectorLabels(params: {
  rows: any[];
  fields: Field[];
  dataProvider: any;
  cache: Record<string, CacheEntry>;
  setCache: React.Dispatch<React.SetStateAction<Record<string, CacheEntry>>>;
}) {
  const { rows, fields, dataProvider, cache, setCache } = params;

 
  const pending = new Map<
    string,
    {
      moduleSlug: string;
      valueField: string;
      displayField: string;
      hasStyle: boolean;
      styleIconField: string;
      styleColorField: string;
      ids: Set<string>;
    }
  >();

  for (const f of fields) {
    if (f.type !== "selectorTabla") continue;

    const ref = getSelectorRef((f as any).ref);
    const moduleSlug = ref?.moduleSlug ? String(ref.moduleSlug) : "";
    const valueField = ref?.valueField ? String(ref.valueField) : "id";
    const displayField = ref?.displayField ? String(ref.displayField) : "id";
    if (!moduleSlug) continue;

    const hasStyle = !!((f as any).hasStyle ?? (ref as any)?.hasStyle);
    const styleIconField =
      ((f as any).styleIconField ?? (ref as any)?.styleIconField) || "icon";
    const styleColorField =
      ((f as any).styleColorField ?? (ref as any)?.styleColorField) || "color";

    const k = `${moduleSlug}|${valueField}|${displayField}|${
      hasStyle ? 1 : 0
    }|${styleIconField}|${styleColorField}`;

    if (!pending.has(k)) {
      pending.set(k, {
        moduleSlug,
        valueField,
        displayField,
        hasStyle,
        styleIconField,
        styleColorField,
        ids: new Set(),
      });
    }

    const bucket = pending.get(k)!;

    for (const r of rows) {
      const id = r?.[f.name];
      if (!id) continue;

      const idStr = String(id);
      const ck = cacheKey(moduleSlug, idStr);

     
      if (!cache[ck]?.label) bucket.ids.add(idStr);
    }
  }

  for (const b of pending.values()) {
    const ids = Array.from(b.ids);
    if (!ids.length) continue;

    
    const res = await dataProvider.list({
      moduleSlug: b.moduleSlug,
      filters: [{ field: b.valueField, op: "in", value: ids }],
      limit: Math.min(ids.length, 500),
      hasStyle: b.hasStyle,
      styleIconField: b.styleIconField,
      styleColorField: b.styleColorField,
    });

    const rowsRes = Array.isArray(res?.data) ? res.data : [];
    const patch: Record<string, CacheEntry> = {};

    for (const r of rowsRes) {
      const id = String(r?.[b.valueField]);
      const label = String(r?.[b.displayField] ?? id);

      patch[cacheKey(b.moduleSlug, id)] = {
        label,
        icon: b.hasStyle ? r?.[b.styleIconField] : undefined,
        color: b.hasStyle ? r?.[b.styleColorField] : undefined,
      };
    }

    if (Object.keys(patch).length) {
      setCache((prev) => ({ ...prev, ...patch }));
    }
  }
}



function renderCell(value: any, field: Field, labelCache: Record<string, CacheEntry>) {
  if (value === null || value === undefined || value === "") return "—";

  const isBi = (s?: string) => !!s && (s.includes("bi-") || s.startsWith("bi "));

  const renderStyled = (label: string, icon?: string, color?: string) => (
    <span className="d-inline-flex align-items-center gap-2">
      {icon ? (
        isBi(icon) ? (
          <i
            className={icon.includes(" ") ? icon : `bi ${icon}`}
            style={{ color: color || "inherit" }}
            aria-hidden="true"
          />
        ) : (
         
          <span style={{ color: color || "inherit" }}>{icon}</span>
        )
      ) : null}
      <span>{label}</span>
    </span>
  );

  switch (field.type as FieldType) {
    case "boolean":
      return value ? (
        <span className="badge bg-success-subtle text-success">Sí</span>
      ) : (
        <span className="badge bg-secondary-subtle text-muted">No</span>
      );

    case "date":
    case "datetime": {
      try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);

        if (field.type === "date") return d.toISOString().slice(0, 10);
        return d.toLocaleString();
      } catch {
        return String(value);
      }
    }

    case "number":
    case "money":
    case "percent":
      return String(value);

    case "multiselect":
      if (Array.isArray(value)) return value.join(", ");
      return String(value);

    case "color":
      return (
        <div className="d-flex align-items-center gap-1">
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.1)",
              backgroundColor: String(value),
            }}
          />
        </div>
      );

    case "file":
    case "image":
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: "underline" }}
        >
          Ver
        </a>
      );

    case "selectorTabla": {
      const ref = getSelectorRef((field as any).ref);
      const moduleSlug = ref?.moduleSlug ? String(ref.moduleSlug) : "";
      const df = ref?.displayField ? String(ref.displayField) : "id";

      
      if (typeof value === "object" && value !== null) {
        const v: any = value;
        const label = String(v[df] ?? v.id ?? JSON.stringify(v));

        
        const hasStyle = !!((field as any).hasStyle ?? (ref as any)?.hasStyle);
        const styleIconField =
          ((field as any).styleIconField ?? (ref as any)?.styleIconField) || "icon";
        const styleColorField =
          ((field as any).styleColorField ?? (ref as any)?.styleColorField) || "color";

        if (hasStyle) {
          return renderStyled(label, v?.[styleIconField], v?.[styleColorField]);
        }
        return label;
      }

    
      const id = String(value ?? "");
      if (moduleSlug && id) {
        const entry = labelCache[cacheKey(moduleSlug, id)];
        const label = entry?.label || id;

        const hasStyle = !!((field as any).hasStyle ?? (ref as any)?.hasStyle);
        if (hasStyle) {
          return renderStyled(label, entry?.icon, entry?.color);
        }

        return label;
      }

      return id;
    }

    case "formula":
      return String(value);

    case "iconpicker":
      if (!value) return "—";
      return (
        <span className="d-inline-flex align-items-center gap-2">
          <i className={`bi ${value}`} aria-hidden="true" />
        </span>
      );

    default:
      return String(value);
  }
}

function getPageItems(current: number, total: number): Array<number | "..."> {
  // Muestra: 1 ... (c-1) c (c+1) ... total
  // con recortes para no tener 80 botones si hay muchas páginas.
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const items: Array<number | "..."> = [];
  const push = (x: number | "...") => items.push(x);

  push(1);

  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  if (left > 2) push("...");

  for (let i = left; i <= right; i++) push(i);

  if (right < total - 1) push("...");

  push(total);

  // Si current está cerca del inicio/fin, amplía un poco para que no quede raro
  // (esto es opcional pero mejora UX)
  const normalized: Array<number | "..."> = [];
  for (const it of items) normalized.push(it);

  return normalized;
}
