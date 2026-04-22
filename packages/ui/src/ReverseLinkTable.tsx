"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Field, FieldType, ModuleSchema } from "@repo/types";
import { dataProvider } from "./providers/DataProvider";
import { ActionMenu } from ".//ActionMenu";
import {
  collectRelationPendingKeys,
  getRelationDisplayConfig,
  getRelationDisplayResult,
  preloadRelationDisplayCache,
  renderRelationDisplay,
  type RelationDisplayEntry,
  type RelationDisplayStatusMap,
} from "./utils/relationDisplay";

type Mode = "view" | "edit" | "create";

type Props = {
  field: Field;
  parentRecord: any;
  mode: Mode;
};

type ListFilterOp = "=" | "!=" | ">" | "<" | "in";
type ListFilter = { field: string; op: ListFilterOp; value: any };
type ListSort = { field: string; dir: "asc" | "desc" };

function toListOp(op: any): ListFilterOp {
  if (op === "=" || op === "!=" || op === ">" || op === "<" || op === "in") return op;
  return "=";
}

export default function ReverseLinkTable({ field, parentRecord, mode }: Props) {
  if (field.type !== "ReverseLink") return null;

  const ref: any = (field as any).ref;
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [targetSchema, setTargetSchema] = useState<ModuleSchema | null>(null);
  const [labelCache, setLabelCache] = useState<Record<string, RelationDisplayEntry>>({});
  const [relationStatusByKey, setRelationStatusByKey] = useState<RelationDisplayStatusMap>({});

  const parentKey = ref?.parentKey || "id";
  const parentId = parentRecord?.[parentKey];

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setErr(null);

      if (mode === "create" || !parentId) {
        setRows([]);
        return;
      }

      if (!ref?.moduleSlug?.trim()) {
        setErr("ReverseLink: falta ref.moduleSlug");
        return;
      }
      if (!ref?.foreignKey?.trim()) {
        setErr("ReverseLink: falta ref.foreignKey");
        return;
      }
      if (!dataProvider?.list || !dataProvider?.getSchema) {
        setErr("dataProvider no implementa list/getSchema");
        return;
      }

      setLoading(true);
      try {
        const schema = await dataProvider.getSchema(ref.moduleSlug);
        if (!cancelled) setTargetSchema(schema);

        const extraFilters = Array.isArray(ref.filters) ? ref.filters : [];
        const filters: ListFilter[] = [
          ...extraFilters.map((item: any): ListFilter => ({
            field: String(item.field),
            op: toListOp(item.op),
            value: item.value,
          })),
          { field: ref.foreignKey, op: "=", value: parentId },
        ];

        const sort: ListSort[] = Array.isArray(ref.sort)
          ? ref.sort.map((item: any): ListSort => ({
              field: String(item.field),
              dir: item.direction === "desc" ? "desc" : "asc",
            }))
          : [];

        const result = await dataProvider.list({
          moduleSlug: ref.moduleSlug,
          filters,
          sort,
          limit: ref.limit ?? 20,
        });

        const data = Array.isArray((result as any)?.data)
          ? (result as any).data
          : Array.isArray(result)
          ? (result as any)
          : [];

        if (!cancelled) setRows(data);
      } catch (error: any) {
        if (!cancelled) setErr(error?.message || "Error cargando ReverseLink");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    parentId,
    ref?.moduleSlug,
    ref?.foreignKey,
    ref?.limit,
    JSON.stringify(ref?.filters || []),
    JSON.stringify(ref?.sort || []),
  ]);

  const columns = (targetSchema?.fields || []).filter((item) =>
    ["List", "Always"].includes((item as any).appareance || "Zoom")
  );

  const columnsFull = useMemo(() => {
    const byName = new Map((targetSchema?.fields || []).map((item) => [item.name, item] as const));
    return columns.map((column) => byName.get(column.name) ?? column) as Field[];
  }, [columns, targetSchema]);

  const pendingRelationKeys = useMemo(
    () =>
      collectRelationPendingKeys({
        rows,
        fields: columnsFull,
        getValue: (row, column) => row?.[column.name],
        cache: labelCache,
        statusByKey: relationStatusByKey,
      }),
    [rows, columnsFull, labelCache, relationStatusByKey]
  );

  useEffect(() => {
    if (!rows.length || !columnsFull.length) return;

    if (process.env.NODE_ENV !== "production") {
      const selectorColumns = columnsFull.filter((column) => column.type === "selectorTabla");
      const sampleRow = rows[0];
      console.log("ReverseLinkTable preload trace", {
        relationFields: selectorColumns,
        selectorFieldsByName: selectorColumns.reduce<Record<string, Field>>((acc, column) => {
          acc[column.name] = column;
          return acc;
        }, {}),
        sampleRawValues: selectorColumns.reduce<Record<string, any>>((acc, column) => {
          acc[column.name] = sampleRow?.[column.name];
          return acc;
        }, {}),
      });
    }

    let cancelled = false;

    void preloadRelationDisplayCache({
      rows,
      fields: columnsFull,
      getValue: (row, column) => row?.[column.name],
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
  }, [rows, columnsFull]);

  const getRowId = (row: any) => row?.id;
  const baseRoute = `/${ref?.route}`;

  const goView = (row: any) => {
    const id = getRowId(row);
    if (!id) return;
    window.location.href = `${baseRoute}/${id}`;
  };

  const goEdit = (row: any) => {
    const id = getRowId(row);
    if (!id) return;
    window.location.href = `${baseRoute}/${id}?edit=true`;
  };

  const renderCellValue = (row: any, column: Field) => {
    const raw = row?.[column.name];
    if (raw === null || raw === undefined || raw === "") return "—";

    switch (column.type as FieldType) {
      case "boolean":
        return raw ? (
          <span className="badge bg-success-subtle text-success">Sí</span>
        ) : (
          <span className="badge bg-secondary-subtle text-muted">No</span>
        );

      case "date":
      case "datetime": {
        try {
          const date = new Date(raw);
          if (Number.isNaN(date.getTime())) return String(raw);

          if (column.type === "date") return date.toISOString().slice(0, 10);
          return date.toLocaleString();
        } catch {
          return String(raw);
        }
      }

      case "number":
      case "money":
      case "percent":
        return String(raw);

      case "multiselect":
        return Array.isArray(raw) ? raw.join(", ") : String(raw);

      case "color":
        return (
          <div className="d-flex align-items-center gap-2">
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.1)",
                backgroundColor: String(raw),
              }}
            />
            <span className="small text-muted">{String(raw)}</span>
          </div>
        );

      case "file":
      case "image":
        return (
          <a href={String(raw)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
            Ver
          </a>
        );

      case "iconpicker":
        if (!raw) return "—";
        return (
          <span className="d-inline-flex align-items-center gap-2">
            <i className={`bi ${String(raw)}`} aria-hidden="true" />
          </span>
        );

      case "selectorTabla": {
        const config = getRelationDisplayConfig(column);
        if (!config) return String(raw);

        const result = getRelationDisplayResult({
          config,
          rawValue: raw,
          cache: labelCache,
          pendingKeys: pendingRelationKeys,
          statusByKey: relationStatusByKey,
        });

        if (process.env.NODE_ENV !== "production") {
          console.log("ReverseLinkTable render trace", {
            fieldName: column.name,
            rawValue: raw,
            result,
          });
        }

        if (result.kind === "resolved") {
          return config.hasStyle
            ? renderRelationDisplay(result.entry.label, result.entry.icon, result.entry.color)
            : result.entry.label;
        }

        return result.text;
      }

      default:
        return String(raw);
    }
  };

  return (
    <div className="card">
      <div className="card-header d-flex align-items-start justify-content-between gap-3">
        <div>
          <div className="fw-semibold">{field.label || field.name}</div>
          <div className="small text-muted">{rows.length} registros</div>
        </div>
      </div>

      <div className="card-body">
        {mode === "create" && (
          <div className="text-muted small">Guarda el registro para ver elementos relacionados.</div>
        )}

        {err && <div className="alert alert-danger py-2 mb-0">{err}</div>}
        {!err && loading && <div className="text-muted">Cargando…</div>}
        {!err && !loading && rows.length === 0 && <div className="text-muted small">No hay registros relacionados.</div>}

        {!err && !loading && rows.length > 0 && (
          <>
            {columnsFull.length === 0 ? (
              <div className="text-muted small">No hay campos con appareance List/Always en {ref?.moduleSlug}.</div>
            ) : (
              <div className="table-responsive">
                 <table
                      className="table table-sm table-striped align-middle mb-0"
                      style={{ borderCollapse: "separate", borderSpacing: 0 }}
                    >
                  <thead>
                    <tr>
                      {columnsFull.map((column) => (
                        <th
                          key={column.name}
                          style={{
                            width: 180,
                            background: "linear-gradient(90deg, #112c66, #112c66, #112c66)",
                            color: "white",
                            fontWeight: 600,
                            padding: "12px 16px",
                            borderBottom: "2px solid #1e40af",
                            borderRight: "1px solid rgb(0, 0, 0)",
                          }}
                        >
                          {column.label || column.name}
                        </th>
                      ))}
                      <th
                        style={{
                          width: 180,
                          background: "linear-gradient(90deg, #112c66, #112c66)",
                          color: "white",
                          fontWeight: 600,
                          padding: "12px 16px",
                          borderBottom: "2px solid #1e40af",
                          
                        }}
                      >
                        
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row, index) => (
                      <tr 
                        key={row?.id || index}
                          style={{
                          backgroundColor: index % 2 === 0 ? "#000000" : "#000000",
                        }}>
                        {columnsFull.map((column) => (
                          <td key={column.name}
                          style={{
                          
                          borderBottom: "1px solid #e5e7eb",
                          borderRight: "1px solid #000000",
                        }}
                          >{renderCellValue(row, column)}</td>
                        ))}
                        <td>
                          <ActionMenu
                            items={[
                              {
                                label: "Ver",
                                icon: <i className="bi bi-eye" />,
                                onClick: () => goView(row),
                              },
                              {
                                label: "Editar",
                                icon: <i className="bi bi-pencil" />,
                                onClick: () => goEdit(row),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
