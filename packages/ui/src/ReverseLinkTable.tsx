"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Field, FieldType, ModuleSchema } from "@repo/types";

// ✅ Ajusta estas rutas a TU proyecto
import { dataProvider } from "./providers/DataProvider"; // <- cambia si tu provider está en otro sitio
import {ActionMenu} from ".//ActionMenu"; // <- cambia si tu ActionMenu está en otro sitio

type Mode = "view" | "edit" | "create";

type Props = {
  field: Field; // viene tipado como Field, pero lo estrechamos dentro
  parentRecord: any;
  mode: Mode;
};

type ListFilterOp = "=" | "!=" | ">" | "<" | "in";
type ListFilter = { field: string; op: ListFilterOp; value: any };
type ListSort = { field: string; dir: "asc" | "desc" };

type CacheEntry = { label: string; icon?: string; color?: string };

function toListOp(op: any): ListFilterOp {
  if (op === "=" || op === "!=" || op === ">" || op === "<" || op === "in") return op;
  return "=";
}

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

export default function ReverseLinkTable({ field, parentRecord, mode }: Props) {
  if (field.type !== "ReverseLink") return null;

  // Nota: lo usas en el resto del proyecto, aquí lo conservamos aunque ahora navegues con window.location.href
  const router = useRouter();

  const ref: any = (field as any).ref; // ReverseLinkRef (en tu código viene así)
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [targetSchema, setTargetSchema] = useState<ModuleSchema | null>(null);

  // ✅ cache: moduleSlug:id -> { label, icon, color }
  const [labelCache, setLabelCache] = useState<Record<string, CacheEntry>>({});

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

      // dataProvider necesario
      if (!dataProvider?.list || !dataProvider?.getSchema) {
        setErr("dataProvider no implementa list/getSchema");
        return;
      }

      setLoading(true);
      try {
        // 1) Schema destino (para columnas list/always)
        const sch = await dataProvider.getSchema(ref.moduleSlug);
        if (!cancelled) setTargetSchema(sch);

        // 2) Query de relacionados
        const extraFilters = Array.isArray(ref.filters) ? ref.filters : [];

        const filters: ListFilter[] = [
          ...extraFilters.map((f: any): ListFilter => ({
            field: String(f.field),
            op: toListOp(f.op),
            value: f.value,
          })),
          { field: ref.foreignKey, op: "=", value: parentId },
        ];

        const sort: ListSort[] = Array.isArray(ref.sort)
          ? ref.sort.map((s: any): ListSort => ({
              field: String(s.field),
              dir: s.direction === "desc" ? "desc" : "asc",
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
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Error cargando ReverseLink");
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

  // columnas visibles
  const columns = (targetSchema?.fields || []).filter((f) =>
    ["List", "Always"].includes((f as any).appareance || "Zoom")
  );

  // ✅ aseguramos “fields completos” (con type/ref de selectorTabla)
  const columnsFull = useMemo(() => {
    const byName = new Map((targetSchema?.fields || []).map((f) => [f.name, f] as const));
    return columns.map((c) => byName.get(c.name) ?? c) as Field[];
  }, [columns, targetSchema]);

  const getRowId = (r: any) => r?.id;

  // Ruta base del módulo relacionado.
  const baseRoute = `/${ref?.route}`;

  const goView = (r: any) => {
    const id = getRowId(r);
    if (!id) return;
    window.location.href = `${baseRoute}/${id}`;
  };

  const goEdit = (r: any) => {
    const id = getRowId(r);
    if (!id) return;
    window.location.href = `${baseRoute}/${id}?edit=true`;
  };

  // ---------------------------
  // ✅ Precarga labels (y estilo) para columnas selectorTabla
  // ---------------------------
  const selectorCols = useMemo(() => {
    return columnsFull.filter((c) => {
      if ((c.type as any) !== "selectorTabla") return false;
      const moduleSlug = (c as any)?.ref?.moduleSlug;
      const displayField = (c as any)?.ref?.displayField;
      return !!moduleSlug && !!displayField;
    });
  }, [columnsFull]);

  const preloadSelectorLabels = useCallback(async () => {
    if (!dataProvider?.list) return;
    if (rows.length === 0) return;
    if (selectorCols.length === 0) return;

    const buckets = new Map<
      string,
      {
        moduleSlug: string;
        ids: Set<any>;
        valueField: string;
        displayField: string;
        hasStyle: boolean;
        styleIconField: string;
        styleColorField: string;
      }
    >();

    for (const col of selectorCols) {
      const refc = (col as any)?.ref || {};
      const moduleSlug = String(refc.moduleSlug || "");
      const valueField = String(refc.valueField || "id");
      const displayField = String(refc.displayField || "id");
      if (!moduleSlug) continue;

      const hasStyle = !!((col as any).hasStyle ?? refc.hasStyle);
      const styleIconField = ((col as any).styleIconField ?? refc.styleIconField) || "icon";
      const styleColorField = ((col as any).styleColorField ?? refc.styleColorField) || "color";

      const bucketKey = `${moduleSlug}|${valueField}|${displayField}|${hasStyle ? 1 : 0}|${styleIconField}|${styleColorField}`;

      let b = buckets.get(bucketKey);
      if (!b) {
        b = {
          moduleSlug,
          ids: new Set<any>(),
          valueField,
          displayField,
          hasStyle,
          styleIconField,
          styleColorField,
        };
        buckets.set(bucketKey, b);
      }

      for (const r of rows) {
        const raw = r?.[col.name];
        if (raw === null || raw === undefined || raw === "") continue;

        const ck = `${moduleSlug}:${String(raw)}`;
        if (labelCache[ck]?.label) continue;

        b.ids.add(raw);
      }
    }

    for (const b of buckets.values()) {
      const ids = Array.from(b.ids);
      if (ids.length === 0) continue;

      try {
        const res = await dataProvider.list({
          moduleSlug: b.moduleSlug,
          filters: [{ field: b.valueField, op: "in", value: ids }],
          limit: Math.max(ids.length, 50),

          // opcional, pero coherente con tu provider
          hasStyle: b.hasStyle,
          styleIconField: b.styleIconField,
          styleColorField: b.styleColorField,
        } as any);

        const data = Array.isArray((res as any)?.data) ? (res as any).data : Array.isArray(res) ? (res as any) : [];

        const patch: Record<string, CacheEntry> = {};
        for (const row of data) {
          const idVal = row?.[b.valueField];
          if (idVal === null || idVal === undefined) continue;

          const idStr = String(idVal);
          patch[`${b.moduleSlug}:${idStr}`] = {
            label: String(row?.[b.displayField] ?? idStr),
            icon: b.hasStyle ? row?.[b.styleIconField] : undefined,
            color: b.hasStyle ? row?.[b.styleColorField] : undefined,
          };
        }

        if (Object.keys(patch).length) {
          setLabelCache((prev) => ({ ...prev, ...patch }));
        }
      } catch {
        // degradamos mostrando id si falla
      }
    }
  }, [rows, selectorCols, labelCache]);

  useEffect(() => {
    preloadSelectorLabels();
  }, [preloadSelectorLabels]);

  // ---------------------------
  // ✅ Render cell
  // ---------------------------
  const renderCellValue = (r: any, c: Field) => {
    const raw = r?.[c.name];
    if (raw === null || raw === undefined || raw === "") return "—";

    switch (c.type as FieldType) {
      case "boolean":
        return raw ? (
          <span className="badge bg-success-subtle text-success">Sí</span>
        ) : (
          <span className="badge bg-secondary-subtle text-muted">No</span>
        );

      case "date":
      case "datetime": {
        try {
          const d = new Date(raw);
          if (Number.isNaN(d.getTime())) return String(raw);

          if (c.type === "date") return d.toISOString().slice(0, 10);
          return d.toLocaleString();
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
        const refc = (c as any)?.ref || {};
        const moduleSlug = refc?.moduleSlug ? String(refc.moduleSlug) : "";
        const displayField = refc?.displayField ? String(refc.displayField) : "id";

        const hasStyle = !!((c as any).hasStyle ?? refc.hasStyle);
        const styleIconField = ((c as any).styleIconField ?? refc.styleIconField) || "icon";
        const styleColorField = ((c as any).styleColorField ?? refc.styleColorField) || "color";

        // Si por cualquier motivo viene objeto relacionado
        if (typeof raw === "object" && raw !== null) {
          const v: any = raw;
          const label = String(v?.[displayField] ?? v?.id ?? "");
          if (hasStyle) return renderStyled(label, v?.[styleIconField], v?.[styleColorField]);
          return label || "—";
        }

        // Normal: ID con cache
        const id = String(raw);
        if (moduleSlug && id) {
          const key = `${moduleSlug}:${id}`;
          const entry = labelCache[key];
          const label = entry?.label ?? id;

          if (hasStyle) return renderStyled(label, entry?.icon, entry?.color);
          return label;
        }

        return id;
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
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      {columnsFull.map((c) => (
                        <th
                          key={c.name}
                          style={{
                            width: 180,
                            background: "linear-gradient(90deg, #0c1f49ab, #1f407546, #4d648aaf)",
                            color: "white",
                            fontWeight: 600,
                            padding: "12px 16px",
                            borderBottom: "2px solid #1e40af",
                          }}
                        >
                          {c.label || c.name}
                        </th>
                      ))}
                      <th
                        style={{
                          width: 180,
                          background: "linear-gradient(90deg, #0c1f49ff, #1f407546)",
                          color: "white",
                          fontWeight: 600,
                          padding: "12px 16px",
                          borderBottom: "2px solid #1e40af",
                        }}
                      >
                        Acciones
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((r, idx) => (
                      <tr key={r?.id || idx}>
                        {columnsFull.map((c) => (
                          <td key={c.name}>{renderCellValue(r, c)}</td>
                        ))}
                        <td>
                          <ActionMenu
                            items={[
                              {
                                label: "Ver",
                                icon: <i className="bi bi-eye" />,
                                onClick: () => goView(r),
                              },
                              {
                                label: "Editar",
                                icon: <i className="bi bi-pencil" />,
                                onClick: () => goEdit(r),
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
