"use client";

import React, { useMemo, useState, useEffect } from "react";
import type {Field, FieldType, ListViewProps } from "@repo/types";
import { ActionMenu } from "./ActionMenu";
import { dataProvider } from "./providers/DataProvider";



export default function ListView({
  schema,
  data,
  loading,
  onViewRow,
  onEditRow,
  onDeleteRow,
  onCreate,
}: ListViewProps) {
  const primaryKey = schema.db.primaryKey || "id";

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

  const [filters, setFilters] = useState<Record<string, string>>({});

  // Cache para resolver selectorTabla (id -> displayField) en la lista
  const [labelCache, setLabelCache] = useState<Record<string, string>>({});

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

  const handleFilterChange = (fieldName: string, value: string) => {
    setFilters((prev) => ({ ...prev, [fieldName]: value }));
  };

  // Aplicar filtros sobre data
  const filteredData = useMemo(() => {
    if (!filterFields.length) return data;

    return data.filter((row) => {
      for (const f of filterFields) {
        const val = filters[f.name];
        if (!val) continue;

        const cell = row[f.name];
        if (cell === null || cell === undefined) return false;

        const cellStr = String(cell).toLowerCase();
        const filterStr = val.toLowerCase().trim();
        if (!cellStr.includes(filterStr)) return false;
      }
      return true;
    });
  }, [data, filterFields, filters]);

  const icon = schema.ui?.icon;
  const color = schema.ui?.color;
  const tableName = schema.db.table;

  return (
    <div className="card " style={{ borderColor: color || "#5374a1ff" }}>
      {/* HEADER */}
      <div className="card-header d-flex justify-content-between  align-items-center">
        <div className="d-flex align-items-center gap-2">
          {icon && <i className={icon} style={{ color, fontSize: 18 }} />}
          <div>
            <div className="fw-semibold " style={{ fontSize: 14 }}>
              {capitalize(tableName)}
            </div>
            <div className="small text-muted">Tabla: {tableName}</div>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {loading && (
            <span className="small text-muted">Cargando…</span>
          )}

          {onCreate && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onCreate}
              style={{
                background: "linear-gradient(90deg, #35eb25ff, #27b61aff",
                border: "none",
                borderRadius: 950,
              }}
            >
              <i className="bi bi-plus-lg me-1" />
              Nuevo
            </button>
          )}
        </div>
      </div>

      {/* FILTROS */}
      {filterFields.length > 0 && (
        <div className="card-body border-bottom">
          <div className="row g-2">
            {filterFields.map((f) => (
              <div key={f.name} className="col-12 col-md-3">
                <label className="form-label mb-1" style={{ fontSize: 12 }}>
                  {f.label}
                </label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder={`Filtrar ${f.label}`}
                  value={filters[f.name] ?? ""}
                  onChange={(e) =>
                    handleFilterChange(f.name, e.target.value)
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TABLA */}
      <div className="table-responsive">
        <table className="table table-sm mb-0 align-middle">
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
              filteredData.map((row, idx) => (
                <tr key={row[primaryKey] ?? idx}>
                  {listFields.map((f) => (
                    <td key={f.name} className="text-nowrap">
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
  // “displayField” solo existe en SelectorTablaRef
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
  cache: Record<string, string>;
  setCache: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const { rows, fields, dataProvider, cache, setCache } = params;

  // Agrupamos por referencia (mismo moduleSlug/valueField/displayField)
  const pending = new Map<
    string,
    { moduleSlug: string; valueField: string; displayField: string; ids: Set<string> }
  >();

  for (const f of fields) {
    if (f.type !== "selectorTabla") continue;

    const ref = getSelectorRef((f as any).ref);
    const moduleSlug = ref?.moduleSlug ? String(ref.moduleSlug) : "";
    const valueField = ref?.valueField ? String(ref.valueField) : "id";
    const displayField = ref?.displayField ? String(ref.displayField) : "id";
    if (!moduleSlug) continue;

    const k = `${moduleSlug}|${valueField}|${displayField}`;
    if (!pending.has(k)) {
      pending.set(k, { moduleSlug, valueField, displayField, ids: new Set() });
    }

    const bucket = pending.get(k)!;

    for (const r of rows) {
      const id = r?.[f.name];
      if (!id) continue;
      const idStr = String(id);
      const ck = cacheKey(moduleSlug, idStr);
      if (!cache[ck]) bucket.ids.add(idStr);
    }
  }

  for (const b of pending.values()) {
    const ids = Array.from(b.ids);
    if (!ids.length) continue;

    // Ideal: backend soporta op "in".
    const res = await dataProvider.list({
      moduleSlug: b.moduleSlug,
      filters: [{ field: b.valueField, op: "in", value: ids }],
      limit: Math.min(ids.length, 500),
    });

    const rowsRes = Array.isArray(res?.data) ? res.data : [];
    const patch: Record<string, string> = {};

    for (const r of rowsRes) {
      const id = String(r?.[b.valueField]);
      const label = String(r?.[b.displayField] ?? id);
      patch[cacheKey(b.moduleSlug, id)] = label;
    }

    if (Object.keys(patch).length) {
      setCache((prev) => ({ ...prev, ...patch }));
    }
  }
}


function renderCell(value: any, field: Field, labelCache: Record<string, string>) {
  if (value === null || value === undefined || value === "") return "—";

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

        if (field.type === "date") {
          return d.toISOString().slice(0, 10);
        }
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

      // Si ya viene el objeto relacionado, intenta pintar displayField directamente
      if (typeof value === "object" && value !== null) {
        const v: any = value;
        return String(v[df] ?? v.id ?? JSON.stringify(v));
      }

      // Normal: guardamos el ID. Lo resolvemos contra caché.
      const id = String(value ?? "");
      if (moduleSlug && id) {
        const lbl = labelCache[cacheKey(moduleSlug, id)];
        if (lbl) return lbl;
      }
      return id;
    }

    case "formula":
      // El valor ya debería venir calculado
      return String(value);

      case "iconpicker":
  if (!value) return "—";

  return (
    <span className="d-inline-flex align-items-center gap-2">
      <i className={`bi ${value}`} aria-hidden />
      <small className="text-muted"></small>
    </span>
  );

    default:
      return String(value);
  }
}
