"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Field, ModuleSchema, FieldType } from "@repo/types";
import { applyCompute } from "./engines/computeEngine";
import { dataProvider } from "./providers/DataProvider";

type Props = {
  schema: ModuleSchema;
  initialData?: any;            // { ...valores, meta?: { overrides?: { [k]: {enabled,value} } } }
  onChange?: (values: any) => void;
  readOnly?: boolean;
};

export default function Form({ schema, initialData = {}, onChange, readOnly }: Props) {
  // Valores editables + meta para overrides
  const [values, setValues] = useState<any>(() => withDefaultValues(schema.fields, initialData));
  const [computing, setComputing] = useState(false);

  // Para evitar llamadas excesivas a aggregate
  const aggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recalcular fórmulas (inmediato) y aggregates (debounced) cuando cambian valores
  useEffect(() => {
    if (!schema?.fields?.length) return;

    // Recalcular: fórmula inmediata; aggregate lo dejamos al provider (igual devuelve 0 si es stub)
    // Para UX: hacemos un debounce corto (p.ej. 200ms) para evitar spam de aggregates
    if (aggTimer.current) clearTimeout(aggTimer.current);
    setComputing(true);
    aggTimer.current = setTimeout(async () => {
      try {
        const computed = await applyCompute({
          schema,
          record: values,
          dataProvider, // si quieres usar otro, cámbialo desde props
        });
        setValues(computed);
        onChange?.(computed);
      } finally {
        setComputing(false);
      }
    }, 200);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, JSON.stringify(lightDeps(values))]); // deps ligeras para evitar recálculo infinito

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
            value: enabled ? prev[f.name] ?? null : (prev.meta?.overrides?.[f.name]?.value ?? null),
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
      // mostramos también el valor forzado en el campo visible
      [f.name]: normalizeValue(value),
    }));
  };

  // Render de cada campo
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {schema.fields.map((f) => {
        if (f.visible === false) return null;

        const v = values[f.name] ?? "";
        const isOverride = !!values?.meta?.overrides?.[f.name]?.enabled;

        // Si allowOverride: mostramos el switch y, si está activo, input editable aunque compute exista
        const effectiveReadOnly =
          !!readOnly ||
          (!!f.readOnly && !isOverride) ||
          (!!f.compute && !f.allowOverride && f.type !== "selectorTabla"); // los calculados no editables salvo override

        return (
          <div key={f.name} style={cellStyle(f)}>
            <label style={labelStyle(f)}>{f.label}</label>

            {/* override toggle */}
            {f.allowOverride && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <small style={{ opacity: 0.8 }}>Forzar valor</small>
                <input
                  type="checkbox"
                  checked={isOverride}
                  onChange={(e) => toggleOverride(f, e.target.checked)}
                  disabled={!!readOnly}
                />
              </div>
            )}

            <FieldInput
              field={f}
              value={v}
              onChange={(val) => (isOverride ? setOverrideValue(f, val) : handleChange(f.name, val))}
              readOnly={effectiveReadOnly}
            />

            {f.ui?.help && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{f.ui.help}</div>}

            {/* estado de cálculo */}
            {computing && f.compute && !isOverride && (
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>recalculando…</div>
            )}
          </div>
        );
      })}

      {/* Puedes mostrar el JSON para debug */}
      {/* <pre>{JSON.stringify(values, null, 2)}</pre> */}
    </div>
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

  if (type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        disabled={readOnly}
      />
    );
  }

  if (type === "number" || type === "money" || type === "percent") {
    return (
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        disabled={readOnly}
      />
    );
  }

  if (type === "date" || type === "datetime") {
    return (
      <input
        type={type === "datetime" ? "datetime-local" : "date"}
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
        value={value || "#000000"}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
        style={{ padding: 0, height: 42, width: 64 }}
      />
    );
  }

  if (type === "select") {
    const opts = field.options || [];
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={readOnly}>
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
      <div style={{ display: "grid", gap: 6 }}>
        {opts.map((o) => {
          const checked = arr.includes(o);
          return (
            <label key={o} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked ? [...arr, o] : arr.filter((x) => x !== o);
                  onChange(next);
                }}
                disabled={readOnly}
              />
              <span>{o}</span>
            </label>
          );
        })}
      </div>
    );
  }

  if (type === "file" || type === "image") {
    // Placeholder: integra tu uploader real
    return (
      <input
        type="text"
        value={value ?? ""}
        placeholder={field.placeholder || "URL de archivo (pendiente uploader)"}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      />
    );
  }

  if (type === "selectorTabla") {
    // Placeholder: integra tu SelectorTabla real cuando quieras
    return (
      <input
        type="text"
        value={value ?? ""}
        placeholder={field.placeholder || `ID de ${field.ref?.moduleSlug || "registro"}`}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      />
    );
  }

  // text / textarea / formula (formula suele ser readOnly salvo override)
  if (field.ui?.variant === "textarea" || type === "textarea") {
    return (
      <textarea
        rows={4}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      />
    );
  }

  return (
    <input
      type="text"
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
      out[f.name] = f.defaultValue ?? defaultForType(f.type);
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

function labelStyle(_f: Field): React.CSSProperties {
  return { display: "block", marginBottom: 6, fontSize: 12, opacity: 0.8 };
}

function cellStyle(f: Field): React.CSSProperties {
  const col = f.ui?.width || "1/1";
  const span = col === "1/1" ? "1 / -1" : col === "1/2" ? "span 6" : col === "1/3" ? "span 4" : "span 8";
  return {
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: 10,
    padding: 12,
    gridColumn: span,
  };
}

// minimiza deps para el efecto: ignora meta.snapshots, arrays grandes, etc.
function lightDeps(v: any) {
  const { meta, ...rest } = v || {};
  const ov = meta?.overrides ? Object.keys(meta.overrides).sort() : [];
  return { ...rest, _ovKeys: ov };
}
