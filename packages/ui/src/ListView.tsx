"use client";

import React, { useMemo, useState, useEffect } from "react";
import type {
  Field,
  FieldType,
  ListViewExportPayload,
  ListViewProps,
} from "@repo/types";
import {
  formatAuditActionLabel,
  formatAuditMetadataPreview,
  getEffectiveModuleCapabilities,
  isAuditEventsTable,
  normalizeFieldConfig,
  normalizeModuleSchema,
} from "@repo/types";
import { ActionMenu } from "./ActionMenu";
import { dataProvider } from "./providers/DataProvider";
import  SelectorTabla  from "./components/fields/Selector";
import {
  collectRelationPendingKeys,
  getRelationDisplayConfig,
  getRelationDisplayResult,
  preloadRelationDisplayCache,
  renderRelationDisplay,
  type RelationDisplayEntry,
  type RelationDisplayStatusMap,
} from "./utils/relationDisplay";

type FilterValue =
  | string
  | { value: string; label: string }
  | { from?: string; to?: string };

export default function ListView({
  schema,
  data,
  loading,
  exportLoading,
  importLoading,
  onViewRow,
  onEditRow,
  onDeleteRow,
  onCreate,
  onExport,
  onImport,
}: ListViewProps) {
  const normalizedSchema = useMemo(() => normalizeModuleSchema(schema), [schema]);
  const capabilities = useMemo(() => getEffectiveModuleCapabilities(normalizedSchema), [normalizedSchema]);
  const primaryKey = normalizedSchema.db.primaryKey || "id";
  const isAuditTrail = isAuditEventsTable(normalizedSchema.db.table);
  const [showFilters, setShowFilters] = useState(false);

  // Columnas de la lista
  const listFields = useMemo(() => {
    const fields = normalizedSchema.fields || [];

    const byAppearance = fields.filter((f) => {
      const normalized = normalizeFieldConfig(f);
      return normalized.appearance === "List" || normalized.appearance === "Always";
    });
    if (byAppearance.length > 0) return byAppearance;

    // 2) si no hay appearance List, usar list === true
    const byListFlag = fields.filter((f) => f.list);
    if (byListFlag.length > 0) return byListFlag;

    // 3) fallback: todos los visibles (o sin visible definido)
    return fields.filter((f) => f.visible !== false);
  }, [normalizedSchema.fields]);

  // Campos que tienen filtro
  const filterFields = useMemo(
    () => (normalizedSchema.fields || []).filter((f) => f.filter),
    [normalizedSchema.fields]
  );

  const [filters, setFilters] = useState<Record<string, FilterValue>>({});

  const [openSelector, setOpenSelector] = useState<{
  field: Field;
} | null>(null);

  // Cache para resolver selectorTabla (id -> displayField) en la lista
  const [labelCache, setLabelCache] = useState<Record<string, RelationDisplayEntry>>({});
  const [relationStatusByKey, setRelationStatusByKey] = useState<RelationDisplayStatusMap>({});

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

      if (isDateRangeFilter(f, fv)) {
        const time = new Date(cell).getTime();
        if (Number.isNaN(time)) return false;
        if (fv.from) {
          const from = new Date(fv.from).getTime();
          if (!Number.isNaN(from) && time < from) return false;
        }
        if (fv.to) {
          const to = new Date(`${fv.to}T23:59:59.999`).getTime();
          if (!Number.isNaN(to) && time > to) return false;
        }
        continue;
      }

      if (f.type === "boolean") {
        const wanted = typeof fv === "string" ? fv : "";
        if (!wanted) continue;
        if (wanted === "true" && cell !== true) return false;
        if (wanted === "false" && cell !== false) return false;
        continue;
      }

      // ✅ selectorTabla: filtra por id exacto (lo más lógico)
      if (f.type === "selectorTabla") {
        const wanted = typeof fv === "object" && "value" in fv ? fv.value : String(fv);
        if (!wanted) continue;
        if (String(cell) !== wanted) return false;
        continue;
      }

      // ✅ resto: contains (tu comportamiento actual)
      const cellStr = String(getAuditTrailSearchValue(row, f.name, cell)).toLowerCase();
      const filterStr =
        (typeof fv === "string" ? fv : "label" in fv ? fv.label : "").toLowerCase().trim();

      if (filterStr && !cellStr.includes(filterStr)) return false;
    }
    return true;
  });
}, [data, filterFields, filters]);

  const pendingRelationKeys = useMemo(
    () =>
      collectRelationPendingKeys({
        rows: filteredData,
        fields: listFields,
        getValue: (row, field) => row?.[field.name],
        cache: labelCache,
        statusByKey: relationStatusByKey,
      }),
    [filteredData, listFields, labelCache, relationStatusByKey]
  );

  useEffect(() => {
    if (!filteredData?.length) return;

    let cancelled = false;

    void preloadRelationDisplayCache({
      rows: filteredData,
      fields: listFields,
      getValue: (row, field) => row?.[field.name],
      dataProvider,
      cache: labelCache,
      statusByKey: relationStatusByKey,
    })
      .then(({ patch, statusPatch }) => {
        if (cancelled) return;
        if (Object.keys(patch).length) {
          setLabelCache((prev) => ({ ...prev, ...patch }));
        }
        if (Object.keys(statusPatch).length) {
          setRelationStatusByKey((prev) => ({ ...prev, ...statusPatch }));
        }
      })

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredData, listFields]);

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


  const icon = normalizedSchema.ui?.icon;
  const color = normalizedSchema.ui?.color;
  const tableName = normalizedSchema.db.table;
  const exportPayload = useMemo<ListViewExportPayload>(
    () => ({
      columns: [],
      rows: [],
      rawRows: filteredData,
    }),
    [filteredData]
  );

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
          {capabilities.allowSearch && filterFields.length > 0 && (
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
              onClick={() => void onExport(exportPayload)}
              disabled={exportLoading}
              title={exportLoading ? "Exportando" : "Exportar"}
            >
              <i className="bi bi-download" />
              
            </button>
          )}
          {onImport && (
            <button
              type="button"
              className="btn btn-sm btn-success"
              onClick={onImport}
              disabled={importLoading}
              title={importLoading ? "Importando" : "Importar"}
            >
              <i className="bi bi-upload" />
              
            </button>
          )}

        </div>
      </div>

      {/* FILTROS */}
      
      {capabilities.allowSearch && filterFields.length > 0 && showFilters && (
          <div className="card-body border-bottom">
            <div className="row g-2">
              {filterFields.map((f) => {
                const val = filters[f.name];
                const isSelector = f.type === "selectorTabla";
                const ref = (f as any).ref || {};
                const rangeVal = typeof val === "object" && val !== null && ("from" in val || "to" in val) ? val : {};

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
                          typeof val === "object" && val !== null && "value" in val
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
                    ) : f.type === "date" || f.type === "datetime" ? (
                      <div className="d-flex gap-1">
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          aria-label={`Desde ${f.label}`}
                          value={rangeVal.from || ""}
                          onChange={(e) =>
                            handleFilterChange(f.name, { ...rangeVal, from: e.target.value })
                          }
                        />
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          aria-label={`Hasta ${f.label}`}
                          value={rangeVal.to || ""}
                          onChange={(e) =>
                            handleFilterChange(f.name, { ...rangeVal, to: e.target.value })
                          }
                        />
                      </div>
                    ) : f.type === "boolean" ? (
                      <select
                        className="form-select form-select-sm"
                        value={typeof val === "string" ? val : ""}
                        onChange={(e) => handleFilterChange(f.name, e.target.value)}
                      >
                        <option value="">Todos</option>
                        <option value="true">Exito</option>
                        <option value="false">Fallo</option>
                      </select>
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
              {(onViewRow || onEditRow || onDeleteRow) && (
                <th className="text-start text-nowrap" style={{ background: color || "#5374a1ff" }}></th>
              )}
              {listFields.map((f) => (
                <th key={f.name} className="text-center" style={{ 
                  background: color || "#5374a1ff",
                  borderRight: "1px solid rgb(0, 0, 0)" }}>
                  {f.label}
                </th>
              ))}
              
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr >
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
                  {(onViewRow || onEditRow || onDeleteRow) && (
                    <td className="text-start text-nowrap" >
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
                  {listFields.map((f) => (
                    <td key={f.name} className="text-center hover-cell" style={{borderRight: "1px solid rgb(0, 0, 0)"}}>
                      {renderCell(row[f.name], f, labelCache, pendingRelationKeys, relationStatusByKey, row, isAuditTrail)}
                    </td>
                  ))}

                  
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

function renderCell(
  value: any,
  field: Field,
  labelCache: Record<string, RelationDisplayEntry>,
  pendingKeys: Record<string, boolean>,
  relationStatusByKey: RelationDisplayStatusMap,
  row?: Record<string, any>,
  isAuditTrail?: boolean
) {
  if (value === null || value === undefined || value === "") return "—";

  if (isAuditTrail && row) {
    const auditValue = renderAuditTrailCell(value, field, row);
    if (auditValue !== null) return auditValue;
  }

  if (typeof value === "object" && !Array.isArray(value)) return renderStructuredValue(value);

  switch (field.type as FieldType) {
    case "boolean":
      return value ? (
        <span className="badge bg-success-subtle text-success">Sí</span>
      ) : (
        <span className="badge bg-secondary-subtle text-muted ">No</span>
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
      const config = getRelationDisplayConfig(field);
      if (!config) return String(value);

      const result = getRelationDisplayResult({
        config,
        rawValue: value,
        cache: labelCache,
        pendingKeys,
        statusByKey: relationStatusByKey,
      });

      if (result.kind === "resolved") {
        return config.hasStyle
          ? renderRelationDisplay(result.entry.label, result.entry.icon, result.entry.color)
          : result.entry.label;
      }

      return result.text;
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

function renderStructuredValue(value: unknown) {
  try {
    const text = JSON.stringify(value);
    const display = text.length > 160 ? `${text.slice(0, 157)}...` : text;
    return (
      <code title={text} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {display}
      </code>
    );
  } catch {
    return String(value);
  }
}

function isDateRangeFilter(field: Field, value: FilterValue): value is { from?: string; to?: string } {
  return (
    (field.type === "date" || field.type === "datetime") &&
    typeof value === "object" &&
    value !== null &&
    ("from" in value || "to" in value)
  );
}

function getAuditTrailSearchValue(row: Record<string, any>, fieldName: string, value: unknown) {
  if (fieldName === "actor_user_id") return `${row.actor_label || ""} ${row.actor_email || ""} ${value || ""}`;
  if (fieldName === "module") return `${row.module_label || ""} ${value || ""}`;
  if (fieldName === "action") return `${row.action_label || formatAuditActionLabel(value)} ${value || ""}`;
  if (fieldName === "resource_id") return `${row.resource_label || ""} ${value || ""}`;
  if (fieldName === "request_id") return value || "";
  if (fieldName === "metadata") return row.metadata_preview || "";
  return value;
}

function renderAuditTrailCell(value: any, field: Field, row: Record<string, any>) {
  if (field.name === "actor_user_id") {
    return (
      <span className="d-inline-flex flex-column align-items-center">
        <span>{row.actor_label || "Usuario desconocido"}</span>
        {row.actor_email && <small className="text-muted">{row.actor_email}</small>}
      </span>
    );
  }

  if (field.name === "module") {
    return <span title={String(value)}>{row.module_label || String(value)}</span>;
  }

  if (field.name === "action") {
    const label = row.action_label || formatAuditActionLabel(value);
    return <span title={String(value)}>{label || String(value)}</span>;
  }

  if (field.name === "success") {
    return value === true ? (
      <span className="badge bg-success-subtle text-success border border-success-subtle">Exito</span>
    ) : (
      <span className="badge bg-danger-subtle text-danger border border-danger-subtle">Fallo</span>
    );
  }

  if (field.name === "resource_id") {
    return (
      <code title={String(value)} style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
        {row.resource_label || String(value)}
      </code>
    );
  }

  if (field.name === "request_id") {
    return (
      <code title={String(value)} style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
        {String(value)}
      </code>
    );
  }

  if (field.name === "metadata") {
    return renderStructuredValue(row.metadata_preview || formatAuditMetadataPreview(value));
  }

  return null;
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

