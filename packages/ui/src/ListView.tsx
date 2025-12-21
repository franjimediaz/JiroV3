"use client";

import React, { useMemo, useState } from "react";
import type {Field, FieldType, ListViewProps } from "@repo/types";
import { ActionMenu } from "./ActionMenu";


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
                      {renderCell(row[f.name], f)}
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

function renderCell(value: any, field: Field) {
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
          <span>{String(value)}</span>
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
      // Más adelante puedes mejorar esto usando field.ref.displayField.
      if (typeof value === "object" && value !== null) {
        const display =
          (value as any)[field.ref?.displayField || "id"] ??
          (value as any).id ??
          JSON.stringify(value);
        return String(display);
      }
      return String(value);
    }

    case "formula":
      // El valor ya debería venir calculado
      return String(value);

    default:
      return String(value);
  }
}
