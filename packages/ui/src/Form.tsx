"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { Field, ModuleSchema, FieldType, CacheEntry } from "@repo/types";
import { useRouter } from "next/navigation";
import { applyCompute } from "./engines/computeEngine";
import type { DataProvider } from "./engines/computeEngine";
import { dataProvider as defaultDataProvider } from "./providers/DataProvider";
import { IconPicker } from "./IconPicker";
import  Selector from "./Selector";
import {ActionMenu} from "./ActionMenu";

type Mode = "view" | "edit" | "create";

type Props = {
  schema: ModuleSchema;
  initialData?: any;            // { ...valores, meta?: { overrides?: { [k]: {enabled,value} } } }
  onChange?: (values: any) => void | Promise<void>;
  readOnly?: boolean;

  // NUEVO: modo lógico del formulario
  mode?: Mode;

  // NUEVO: callbacks opcionales para acciones
  onSubmit?: (values: any) => void;
  onBack?: () => void;
  onEdit?: () => void;

  dataProvider?: DataProvider;
};
export default function Form({
  schema,
  initialData = {},
  onChange,
  readOnly,
  mode,
  onSubmit,
  onBack,
  onEdit,
  dataProvider = defaultDataProvider,
}: Props) {
  // Derivar modo por defecto si no viene
  const effectiveMode: Mode =
    mode || (readOnly ? "view" : "edit");
    

  // Valores editables + meta para overrides
  const [values, setValues] = useState<any>(() =>
    withDefaultValues(schema.fields, initialData)
  );
  const [computing, setComputing] = useState(false);

  // Para evitar llamadas excesivas a aggregate
  const aggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recalcular fórmulas (inmediato) y aggregates (debounced) cuando cambian valores
  useEffect(() => {
    if (!schema?.fields?.length) return;

    if (aggTimer.current) clearTimeout(aggTimer.current);
    setComputing(true);
    aggTimer.current = setTimeout(async () => {
      try {
        const computed = await applyCompute({
          schema,
          record: values,
          dataProvider,
        });
        setValues(computed);
        onChange?.(computed);
      } finally {
        setComputing(false);
      }
    }, 200);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, JSON.stringify(lightDeps(values))]);

  const handleChange = (name: string, value: any) => {
    setValues((prev: any) => ({ ...prev, [name]: normalizeValue(value) }));
  };

  // Toggle de override por campo
  const toggleOverride = (f: Field, enabled: boolean) => {
    setValues((prev: any) => ({
      ...prev,
      meta: {
        ...(prev.meta || {}),
        overrides: {
          ...(prev.meta?.overrides || {}),
          [f.name]: {
            enabled,
            value: enabled
              ? prev[f.name] ?? null
              : prev.meta?.overrides?.[f.name]?.value ?? null,
          },
        },
      },
    }));
  };

  // Cambio de valor de override manual
  const setOverrideValue = (f: Field, value: any) => {
    setValues((prev: any) => ({
      ...prev,
      meta: {
        ...(prev.meta || {}),
        overrides: {
          ...(prev.meta?.overrides || {}),
          [f.name]: {
            enabled: true,
            value: normalizeValue(value),
          },
        },
      },
      [f.name]: normalizeValue(value),
    }));
  };

  // --------- SECCIONES DE FORMULARIO (layout) ---------

  const formSections =
    ((schema.ui as any)?.formSections as {
      id: string;
      label: string;
      description?: string;
      fields: string[];
    }[]) || [];

  // mapa rápido para buscar campos por name
  const fieldsByName = useMemo(() => {
    const map: Record<string, Field> = {};
    (schema.fields || []).forEach((f) => {
      map[f.name] = f;
    });
    return map;
  }, [schema.fields]);

  // Campos que no están en ninguna sección
  const fieldsInSections = new Set(formSections.flatMap((s) => s.fields));
  const unsectionedFields = (schema.fields || []).filter(
    (f) => !fieldsInSections.has(f.name)
  );

  // Helper: clases de columna Bootstrap según ui.width
  const colClass = (f: Field): string => {
    const col = f.ui?.width || "1/1";
    switch (col) {
      case "1/2":
        return "col-12 col-md-6";
      case "1/3":
        return "col-12 col-md-4";
      case "2/3":
        return "col-12 col-md-8";
      case "1/1":
      default:
        return "col-12";
    }
  };


function dateToDb(value?: string) {
  return value || null; // YYYY-MM-DD → date
}

function datetimeLocalToDb(value?: string) {
  if (!value) return null;
  return new Date(value).toISOString(); // local → UTC Z
}


  function isFieldVisibleInMode(
  field: Field,
  mode: "view" | "edit" | "create"
) {
  if (field.visible === false) return false;

  const vw = field.visibleWhen || "add_edit";

  if (mode === "create") return vw === "add" || vw === "add_edit";
  if (mode === "edit") return vw === "edit" || vw === "add_edit";

  // view → respeta visible, pero no el when
  return true;
}

  // Render de un campo individual
  const renderField = (f: Field) => {
    if (!isFieldVisibleInMode(f, effectiveMode)) return null;
    if (f.type === "ReverseLink") return null;
    const v = values[f.name] ?? "";
    const isOverride = !!values?.meta?.overrides?.[f.name]?.enabled;

    const effectiveReadOnlyField =
      !!readOnly ||
      effectiveMode === "view" ||
      (!!f.readOnly && !isOverride) ||
      (!!f.compute && !f.allowOverride && f.type !== "selectorTabla");
    const reverseLinkFields = useMemo(
  () => (schema.fields || []).filter((f) => f.type === "ReverseLink"),
  [schema.fields]
);
    return (
      <div key={f.name} className={colClass(f)}>
        <div className="field-box">
          <label style={labelStyle()} className="form-label">
            {f.label}
          </label>

          {f.allowOverride && (
            <div className="d-flex align-items-center gap-2 mb-2">
              <small className="text-muted">Forzar valor</small>
              <input
                type="checkbox"
                className="form-check-input"
                checked={isOverride}
                onChange={(e) => toggleOverride(f, e.target.checked)}
                disabled={effectiveMode === "view"}
              />
            </div>
          )}

          <FieldInput
            field={f}
            value={v}
            onChange={(val) =>
              isOverride
                ? setOverrideValue(f, val)
                : handleChange(f.name, val)
            }
            readOnly={effectiveReadOnlyField}
          />

          {f.ui?.help && (
            <div className="form-text mt-1">{f.ui.help}</div>
          )}

          {computing && f.compute && !isOverride && (
            <div className="small text-muted mt-1">recalculando…</div>
          )}

        </div>

      </div>
      
    );
  };

  // --------- ACCIONES (Guardar / Editar / Volver) ---------

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (effectiveMode === "view") return;

  try {
    const payload = { ...(values || {}) };
    delete payload.meta;

    for (const f of schema.fields || []) {
      const v = payload[f.name];

      if (f.type === "date") {
        payload[f.name] = dateToDb(v);
      }

      if (f.type === "datetime") {
        payload[f.name] = datetimeLocalToDb(v);
      }
    }

    console.log("SUBMIT payload:", payload); // debe salir ...Z

    await onSubmit?.(payload);
  } catch (err) {
    console.error("Error en submit:", err);
    alert((err as any)?.message || "Error guardando");
  }
};


                                                                                                                                                                                                    

  const handleBack = () => {
    if (onBack) return onBack();
    if (typeof window !== "undefined") {
      window.history.back();
    }
  };

  const handleEdit = () => {
    if (onEdit) return onEdit();
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("edit", "true");
      window.location.href = url.toString();
    }
  };

  const renderActions = () => {
    return (
      <>
        {/* Volver siempre visible */}
        <button
          type="button"
          className="btn btn-secondary px-4"
          onClick={handleBack}
        >
          ← Volver
        </button>

        {/* Editar SOLO en view */}
        {effectiveMode === "view" && (
          <button
            type="button"
            className="btn btn-warning px-4"
            onClick={handleEdit}
          >
            Editar
          </button>
        )}

        {/* Guardar SOLO en edit o create */}
        {(effectiveMode === "edit" || effectiveMode === "create") && (
          <button
            type="submit"
            className="btn btn-primary px-5"
            style={{
              background: "linear-gradient(90deg, #2563eb, #3b82f6)",
              border: "none",
              borderRadius: 10,
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.35)",
            }}
          >
            Guardar
          </button>
        )}
      </>
    );
  };
  const reverseLinkFields = useMemo(
    () => (schema.fields || []).filter((f) => f.type === "ReverseLink"),
    [schema.fields]
  );
  // --------- RENDER PRINCIPAL ---------

  return (
    <form
      className="d-flex flex-column gap-4"
      onSubmit={handleSubmit}
    >
      {/* Formulario principal (secciones o plano) */}
      {formSections.length > 0 ? (
        <div className="d-flex flex-column gap-3">
          {formSections.map((section) => (
            <div key={section.id} className="card">
              <div className="card-header">
                <div className="fw-semibold">{section.label}</div>
                {section.description && (
                  <div className="small text-muted">
                    {section.description}
                  </div>
                )}
              </div>
              <div className="card-body">
                <div className="row g-3">
                  {section.fields.map((fieldName) => {
                    const f = fieldsByName[fieldName];
                    if (!f) return null;
                    return renderField(f);
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Campos sin sección */}
          {unsectionedFields.length > 0 && (
            <div className="card border border-dashed">
              <div className="card-header">
                <div className="fw-semibold">Otros campos</div>
                <div className="small text-muted">
                  Campos sin sección asignada
                </div>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  {unsectionedFields.map((f) => renderField(f))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="row g-3">
          {schema.fields.map((f) => renderField(f))}
        </div>
      )}
      {/* ReverseLink (tablas relacionadas) */}
        {reverseLinkFields.length > 0 && (
          <div className="d-flex flex-column gap-3">
            {reverseLinkFields.map((f) => (
              <ReverseLinkTable
                key={f.name}
                field={f}
                parentRecord={values}
                mode={effectiveMode}
              />
            ))}
          </div>
        )}


      {/* Acciones */}
      <div className="d-flex justify-content-end gap-2 mt-3">
        {renderActions()}
      </div>
    </form>
  );
}

/* ---------------- Renderers por tipo ---------------- */

function FieldInput({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
  readOnly?: boolean;
}) {
  const type = field.type as FieldType;
const [popupOpen, setPopupOpen] = useState(false);
const [popupItems, setPopupItems] = useState<{ value: any; label: string }[]>([]);
const [popupLoading, setPopupLoading] = useState(false);
const isMultiple = field.type === "selectorTabla" && !!field.ref.multiple;
const [labelCache, setLabelCache] = useState<Record<string, CacheEntry>>({});


// selección borrador
const selectedSet = useMemo(() => {
  if (!isMultiple) return new Set<any>(value ? [value] : []);
  return new Set<any>(Array.isArray(value) ? value : []);
}, [isMultiple, value]);

const [draft, setDraft] = useState<Set<any>>(new Set(selectedSet));


//-------------------------
const toggleDraft = (v: any) => {
  setDraft((prev) => {
    const next = new Set(prev);
    if (isMultiple) {
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    }
    next.clear();
    next.add(v);
    return next;
  });
};

const applyDraft = () => {
  if (isMultiple) onChange(Array.from(draft));
  else onChange(draft.size ? Array.from(draft)[0] : "");
  setPopupOpen(false);
};
//-----------------------------
async function handleSearch(q: string) {
  if (field.type !== "selectorTabla") return;

  const { moduleSlug, displayField, valueField } = field.ref;
  const df = displayField || "name";
  const vf = valueField || "id"; // fallback

  if (!moduleSlug) {
    setPopupItems([{ value: "__missing__", label: "⚠️ Falta ref.moduleSlug en este selectorTabla" }]);
    return;
  }

  setPopupLoading(true);
  try {
  const params = new URLSearchParams();
  params.set("moduleSlug", moduleSlug);
  params.set("q", q || "");
  params.set("limit", "30");
  params.set("displayField", displayField);

  const r = await fetch(`/api/dp/list?${params.toString()}`, {
    credentials: "include",
  });

  const json = await r.json();

  if (!r.ok) {
    setPopupItems([
      {
        value: "__err__",
        label: `❌ ${json?.error?.message || json?.error || "Error cargando datos"}`,
      },
    ]);
    return;
  }

  const rows = json.data || [];
  setPopupItems(
    rows.map((row: any) => ({
      value: row?.[vf],
      label: row?.[displayField] ?? String(row?.[vf] ?? ""),
    }))
  );
} finally {
  setPopupLoading(false);
}
}
function toInputDate(value?: string) {
  if (!value) return "";
  return value.slice(0, 10); // YYYY-MM-DD
}

function toInputDateTimeLocal(value?: string) {
  if (!value) return "";

  const d = new Date(value); // value ISO con Z
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}




//-------------------------
async function openSelectorTablaPopup() {
  if (readOnly) return;
  setPopupOpen(true);
  // primera carga
  await handleSearch("");
}

//-------------------------
  
  if (type === "boolean") {
    return (
      <div className="form-check">
        <input
          type="checkbox"
          className="form-check-input"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          disabled={readOnly}
        />
      </div>
    );
  }
  

  if (type === "number" || type === "money" || type === "percent") {
    return (
      <input
        type="number"
        className="form-control"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? "" : Number(e.target.value))
        }
        disabled={readOnly}
      />
    );
  }

  if (type === "date" || type === "datetime") {
  const inputValue =
    type === "date"
      ? toInputDate(value)
      : toInputDateTimeLocal(value);

  return (
    <input
      type={type === "datetime" ? "datetime-local" : "date"}
      className="form-control"
      value={inputValue}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
    />
  );
}


  

  


  if (type === "color") {
    return (
      <input
        type="color"
        className="form-control form-control-color"
        value={value || "#000000"}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      />
    );
  }

  if (type === "select") {
    const opts = field.options || [];
    return (
      <select
        className="form-select"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (type === "multiselect") {
    const opts = field.options || [];
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="d-flex flex-column gap-1">
        {opts.map((o) => {
          const checked = arr.includes(o);
          return (
            <div className="form-check" key={o}>
              <input
                className="form-check-input"
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...arr, o]
                    : arr.filter((x) => x !== o);
                  onChange(next);
                }}
                disabled={readOnly}
              />
              <label className="form-check-label">{o}</label>
            </div>
          );
        })}
      </div>
    );
  }

  if (type === "file" || type === "image") {
    // Placeholder: integra tu uploader real cuando quieras
    return (
      <input
        type="text"
        className="form-control"
        value={value ?? ""}
        placeholder={
          field.placeholder || "URL de archivo (pendiente uploader)"
        }
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      />
    );
  }

  if (type === "selectorTabla") {
  const summary = (() => {
  if (!value) return "— Seleccionar —";

  if (isMultiple) {
    if (!Array.isArray(value) || value.length === 0) {
      return "— Seleccionar —";
    }

    const labels = value.map(
      (v) => labelCache[v] || String(v)
    );

    // si hay muchos, no ensuciamos el input
    if (labels.length > 3) {
      return `${labels.length} seleccionados`;
    }

    return labels.join(", ");
  }

  // single
  return labelCache[value] || String(value);
})();
 const ref = field.ref;

  const moduleSlug =
    ref && "moduleSlug" in ref ? (ref as any).moduleSlug : "";

  const displayField =
    ref && "displayField" in ref ? (ref as any).displayField : "id";

  const valueField =
    ref && "valueField" in ref ? (ref as any).valueField : "id";

  const filters =
    ref && "filters" in ref ? (ref as any).filters : [];

  const sort =
    ref && "sort" in ref ? (ref as any).sort : [];
  const hasStyle = 
  ref && "hasStyle" in ref ? (ref as any).hasStyle : false;

  const styleIconField = 
    ref && "styleIconField" in ref ? (ref as any).styleIconField : "icon";

  const styleColorField = 
    ref && "styleColorField" in ref ? (ref as any).styleColorField : "color";

return (
    <>

          <Selector
            moduleSlug={moduleSlug}
            displayField={displayField}
            valueField={valueField}
            value={value ?? ""}
            onChange={onChange}
            readOnly={readOnly}
            filters={filters}
            sort={sort}
            multiple={isMultiple}
            placeholder={field.placeholder || "Selecciona un registro"}
            hasStyle={hasStyle}                    
            styleIconField={styleIconField}        
            styleColorField={styleColorField} 

          />
 

    </>
  );
}
if (type === "iconpicker") {
  return (
    <IconPicker
     value={value || ""}
     onChange={(v) => onChange(v)} />
  );
}


  // text / textarea / formula (formula suele ser readOnly salvo override)
  if (field.ui?.variant === "textarea" || type === "textarea") {
    return (
      <textarea
        rows={4}
        className="form-control"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      />
    );
  }

  return (
    <input
      type="text"
      className="form-control"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
      placeholder={field.placeholder}
    />
    
  );

}

function ReverseLinkTable({
  field,
  parentRecord,
  mode,
}: {
  field: Field; // viene tipado como Field, pero lo estrechamos dentro
  parentRecord: any;
  mode: "view" | "edit" | "create";
}) {
  if (field.type !== "ReverseLink") return null;

  type ListFilterOp = "=" | "!=" | ">" | "<" | "in";
  type ListFilter = { field: string; op: ListFilterOp; value: any };
  type ListSort = { field: string; dir: "asc" | "desc" };

  type CacheEntry = { label: string; icon?: string; color?: string };

  function toListOp(op: any): ListFilterOp {
    if (op === "=" || op === "!=" || op === ">" || op === "<" || op === "in") return op;
    return "=";
  }

  const ref = field.ref; // ReverseLinkRef

  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [targetSchema, setTargetSchema] = useState<ModuleSchema | null>(null);

  // ✅ cache: moduleSlug:id -> { label, icon, color }
  const [labelCache, setLabelCache] = useState<Record<string, CacheEntry>>({});

  const parentKey = ref.parentKey || "id";
  const parentId = parentRecord?.[parentKey];

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setErr(null);

      if (mode === "create" || !parentId) {
        setRows([]);
        return;
      }

      if (!ref.moduleSlug?.trim()) {
        setErr("ReverseLink: falta ref.moduleSlug");
        return;
      }
      if (!ref.foreignKey?.trim()) {
        setErr("ReverseLink: falta ref.foreignKey");
        return;
      }

      // dataProvider necesario
      if (!defaultDataProvider?.list || !defaultDataProvider?.getSchema) {
        setErr("dataProvider no implementa list/getSchema");
        return;
      }

      setLoading(true);
      try {
        // 1) Schema destino (para columnas list/always)
        const sch = await defaultDataProvider.getSchema(ref.moduleSlug);
        if (!cancelled) setTargetSchema(sch);

        // 2) Query de relacionados
        const extraFilters = Array.isArray(ref.filters) ? ref.filters : [];

        const filters: ListFilter[] = [
          ...extraFilters.map((f): ListFilter => ({
            field: String(f.field),
            op: toListOp(f.op),
            value: f.value,
          })),
          { field: ref.foreignKey, op: "=", value: parentId },
        ];

        const sort: ListSort[] = Array.isArray(ref.sort)
          ? ref.sort.map((s): ListSort => ({
              field: String(s.field),
              dir: s.direction === "desc" ? "desc" : "asc",
            }))
          : [];

        const result = await defaultDataProvider.list({
          moduleSlug: ref.moduleSlug,
          filters,
          sort,
          limit: ref.limit ?? 20,
        });

        const data = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];

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
    ref.moduleSlug,
    ref.foreignKey,
    ref.limit,
    JSON.stringify(ref.filters || []),
    JSON.stringify(ref.sort || []),
  ]);

  // columnas visibles
  const columns =
    (targetSchema?.fields || []).filter((f) => ["List", "Always"].includes(f.appareance || "Zoom"));

  // ✅ aseguramos “fields completos” (con type/ref de selectorTabla)
  const columnsFull = useMemo(() => {
    const byName = new Map((targetSchema?.fields || []).map((f) => [f.name, f] as const));
    return columns.map((c) => byName.get(c.name) ?? c) as Field[];
  }, [columns, targetSchema]);

  const getRowId = (r: any) => r?.id;

  // Ruta base del módulo relacionado.
  const baseRoute = `/${ref.route}`;

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
      if (c.type !== "selectorTabla") return false;
      const moduleSlug = (c as any)?.ref?.moduleSlug;
      const displayField = (c as any)?.ref?.displayField;
      return !!moduleSlug && !!displayField;
    });
  }, [columnsFull]);

  const preloadSelectorLabels = useCallback(async () => {
    if (!defaultDataProvider?.list) return;
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
        const res = await defaultDataProvider.list({
          moduleSlug: b.moduleSlug,
          filters: [{ field: b.valueField, op: "in", value: ids }],
          limit: Math.max(ids.length, 50),

          // opcional, pero coherente con tu provider
          hasStyle: b.hasStyle,
          styleIconField: b.styleIconField,
          styleColorField: b.styleColorField,
        });

        const data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];

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
  // ✅ Render helpers estilo
  // ---------------------------
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
        <a
          href={String(raw)}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: "underline" }}
        >
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

        {!err && !loading && rows.length === 0 && (
          <div className="text-muted small">No hay registros relacionados.</div>
        )}

        {!err && !loading && rows.length > 0 && (
          <>
            {columnsFull.length === 0 ? (
              <div className="text-muted small">
                No hay campos con appareance List/Always en {ref.moduleSlug}.
              </div>
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
                            background:
                              "linear-gradient(90deg, #0c1f49ab, #1f407546, #4d648aaf)",
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




/* ---------------- Utils ---------------- */

function withDefaultValues(fields: Field[], base: any) {
  const out = { ...(base || {}) };
  for (const f of fields) {
    if (out[f.name] === undefined) {
      out[f.name] = f.defaultValue ?? defaultForType(f.type as FieldType);
    }
  }
  return out;
}

function defaultForType(t: FieldType): any {
  switch (t) {
    case "number":
    case "money":
    case "percent":
      return 0;
    case "boolean":
      return false;
    case "multiselect":
      return [];
    default:
      return "";
  }
}

function normalizeValue(v: any) {
  if (v === "") return "";
  return v;
}

function labelStyle(): React.CSSProperties {
  return { display: "block", marginBottom: 4, fontSize: 12 };
}

// minimiza deps para el efecto: ignora meta.snapshots, arrays grandes, etc.
function lightDeps(v: any) {
  const { meta, ...rest } = v || {};
  const ov = meta?.overrides ? Object.keys(meta.overrides).sort() : [];
  return { ...rest, _ovKeys: ov };
}
