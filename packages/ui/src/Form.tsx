"use client";

import React, { useEffect, useMemo, useRef, useState} from "react";
import type { Field, ModuleSchema, FieldType, CacheEntry } from "@repo/types";
import { applyCompute } from "./engines/computeEngine";
import type { DataProvider } from "./engines/computeEngine";
import { dataProvider as defaultDataProvider } from "./providers/DataProvider";
import { IconPicker } from "./IconPicker";
import  Selector from "./Selector";
import ReverseLinkTable from "./ReverseLinkTable";

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
  const reverseLinkFields = useMemo(
    () => (schema.fields || []).filter((f) => f.type === "ReverseLink"),
    [schema.fields]
  );

  // Reverse Links activos

  const [activeReverseLink, setActiveReverseLink] = useState<string | null>(null);

  useEffect(() => {
  if (!activeReverseLink && reverseLinkFields.length > 0) {
    setActiveReverseLink(reverseLinkFields[0].name);
  }
}, [activeReverseLink, reverseLinkFields]);

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

  // --------- SECCIONES DE FORMULARIO (layout) ---------

const formSections =
  ((schema.ui as any)?.formSections as {
    id: string;
    label: string;
    description?: string;
    fields: string[];
  }[]) || [];

// ✅ NUEVO: acordeón (qué secciones están abiertas)
const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
  // Por defecto: abre la primera sección (si existe)
  const firstId = formSections[0]?.id;
  return firstId ? { [firstId]: true } : {};
});


const toggleSection = (id: string) => {
  setOpenSections((prev) => ({
    ...prev,
    [id]: !prev[id],
  }));
};


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
    (f) => f.type !== "ReverseLink" && !fieldsInSections.has(f.name)
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
  
  // --------- RENDER PRINCIPAL ---------

  return (
    <form
    className="d-flex flex-column gap-4"
    onSubmit={handleSubmit}
  >
    {/* Formulario principal */}
    {formSections.length > 0 ? (
      <div className="d-flex flex-column gap-3">
        {formSections.map((section) => {
          const isOpen = !!openSections[section.id];

          return (
            <div key={section.id} className="card">
              {/* HEADER CLICABLE */}
              <button
                type="button"
                className="card-header d-flex justify-content-between align-items-center w-100"
                onClick={() => toggleSection(section.id)}
                style={{
                  cursor: "pointer",
                  background: "transparent",
                  border: "none",
                  textAlign: "left",
                }}
              >
                <div>
                  <div className="fw-semibold">{section.label}</div>
                  {section.description && (
                    <div className="small text-muted">
                      {section.description}
                    </div>
                  )}
                </div>

                <span className="text-muted">
                  {isOpen ? "▾" : "▸"}
                </span>
              </button>

              {/* BODY COLAPSABLE */}
              {isOpen && (
                <div className="card-body">
                  <div className="row g-3">
                    {section.fields.map((fieldName) => {
                      const f = fieldsByName[fieldName];
                      if (!f) return null;
                      return renderField(f);
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

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

    {/* ReverseLink */}
    {reverseLinkFields.length > 0 && (
        <div className="d-flex flex-column gap-3">
          {/* Tabs */}
          <div className="card">
            <div className="card-header pb-0">
              <ul className="nav nav-tabs  card-header-tabs">
                {reverseLinkFields.map((f) => {
                  const tabId = f.name;
                  const label = (f.label as string) || f.name;
                  const isActive = activeReverseLink === tabId;

                  return (
                    <li className="nav-item" key={tabId}>
                      <button
                        type="button"
                        className={`nav-link bg-primary text-light  ${isActive ? "active" : ""}`}
                        onClick={() => setActiveReverseLink(tabId)}
                      >
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Tab content */}
            <div className="card-body">
              {reverseLinkFields.map((f) => {
                if (activeReverseLink !== f.name) return null;

                return (
                  <ReverseLinkTable
                    key={f.name}
                    field={f}
                    parentRecord={values}
                    mode={effectiveMode}
                  />
                );
              })}
            </div>
          </div>
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
