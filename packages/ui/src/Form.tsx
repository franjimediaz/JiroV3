"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Field, ModuleSchema, FieldType } from "@repo/types";
import { applyCompute } from "./engines/computeEngine";
import type { DataProvider } from "./engines/computeEngine";
import { dataProvider as defaultDataProvider } from "./providers/DataProvider";
import { PopupSelector } from "./PopUpSelector";

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

  // Render de un campo individual
  const renderField = (f: Field) => {
    if (f.visible === false) return null;

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
    await onSubmit?.(values);  // ✅ CLAVE: esperar al Server Action
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
const isMultiple = type === "selectorTabla" && !!field.ref?.multiple;
const [labelCache, setLabelCache] = useState<Record<string, string>>({});


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
const moduleSlug = field.ref?.moduleSlug;
const displayField = field.ref?.displayField || "name";
const valueField = field.ref?.valueField || "id"; // si no lo tienes, usamos id

if (!moduleSlug) {
  setPopupItems([
    { value: "__missing__", label: "⚠️ Falta ref.moduleSlug en este selectorTabla" },
  ]);
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
      value: row?.[valueField],
      label: row?.[displayField] ?? String(row?.[valueField] ?? ""),
    }))
  );
} finally {
  setPopupLoading(false);
}
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
    return (
      <input
        type={type === "datetime" ? "datetime-local" : "date"}
        className="form-control"
        value={value ?? ""}
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

  return (
    <>
      <button
        type="button"
        className="form-control d-flex justify-content-between align-items-center"
        onClick={openSelectorTablaPopup}
        disabled={readOnly}
      >
        <span style={{ opacity: value ? 1 : 0.75 }}>{summary}</span>
        <span style={{ opacity: 0.7 }}>🔎</span>
      </button>
      
        <PopupSelector
        open={popupOpen}
        title={field.label || `Seleccionar (${field.ref?.moduleSlug || ""})`}
        multiple={isMultiple}
        value={isMultiple ? (Array.isArray(value) ? value : []) : value}
        items={popupItems}
        loading={popupLoading}
        onSearch={handleSearch}
        onClose={() => setPopupOpen(false)}
        onApply={(next) => {
  // next puede ser id o ids[]
          if (Array.isArray(next)) {
            const newCache: Record<string, string> = {};
            popupItems.forEach((item) => {
              if (next.includes(item.value)) {
                newCache[item.value] = item.label;
              }
            });
            setLabelCache((prev) => ({ ...prev, ...newCache }));
          } else {
            const found = popupItems.find((i) => i.value === next);
            if (found) {
              setLabelCache((prev) => ({ ...prev, [next]: found.label }));
            }
          }

          onChange(next);
        }}
      />
 

    </>
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
