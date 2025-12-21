"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./modulo-detalle.module.css";
import { upsertModuloAction } from "@/actions/modulos";
import type { Field as FieldSchema, FieldType, ModuleSchema, Field, Appareance, Compute, FormSection} from "@repo/types";
import {VALID_FIELD_TYPES,Appareance_Valid_Types} from "@repo/types";



export const ICON_OPTIONS = [
  // 👤 Personas / Usuarios
  { name: "Usuario", value: "bi-person" },
  { name: "Usuarios", value: "bi-people" },
  { name: "Usuario Plus", value: "bi-person-plus" },
  { name: "Usuario Check", value: "bi-person-check" },
  { name: "Usuario Gear", value: "bi-person-gear" },

  // 🏢 Negocio / Organización
  { name: "Empresa", value: "bi-building" },
  { name: "Oficina", value: "bi-building-gear" },
  { name: "Carpeta", value: "bi-folder" },
  { name: "Carpeta Abierta", value: "bi-folder2-open" },
  { name: "Archivo", value: "bi-file-earmark" },
  { name: "Archivos", value: "bi-files" },

  // 🧾 Datos / Tablas
  { name: "Tabla", value: "bi-table" },
  { name: "Lista", value: "bi-list-ul" },
  { name: "Checklist", value: "bi-list-check" },
  { name: "Gráfico", value: "bi-bar-chart" },
  { name: "Gráfico Lineal", value: "bi-graph-up" },

  // ⚙️ Configuración / Sistema
  { name: "Configuración", value: "bi-gear" },
  { name: "Ajustes", value: "bi-sliders" },
  { name: "Herramientas", value: "bi-tools" },
  { name: "Llave", value: "bi-key" },
  { name: "Escudo", value: "bi-shield-lock" },

  // 📅 Tiempo / Planificación
  { name: "Calendario", value: "bi-calendar-week" },
  { name: "Reloj", value: "bi-clock" },
  { name: "Alarma", value: "bi-alarm" },
  { name: "Cronómetro", value: "bi-stopwatch" },

  // 💰 Finanzas
  { name: "Dinero", value: "bi-cash" },
  { name: "Moneda", value: "bi-currency-euro" },
  { name: "Factura", value: "bi-receipt" },
  { name: "Tarjeta", value: "bi-credit-card" },

  // 🧱 Obras / Servicios (muy JiRo)
  { name: "Casa", value: "bi-house" },
  { name: "Martillo", value: "bi-hammer" },
  { name: "Construcción", value: "bi-cone-striped" },
  { name: "Regla", value: "bi-rulers" },
  { name: "Camión", value: "bi-truck" },

  // ✉️ Comunicación
  { name: "Email", value: "bi-envelope" },
  { name: "Chat", value: "bi-chat-dots" },
  { name: "Teléfono", value: "bi-telephone" },

  // 🔔 Estados / UX
  { name: "Check", value: "bi-check-circle" },
  { name: "Error", value: "bi-x-circle" },
  { name: "Info", value: "bi-info-circle" },
  { name: "Advertencia", value: "bi-exclamation-triangle" },

  // ⭐ Extras
  { name: "Estrella", value: "bi-star" },
  { name: "Corazón", value: "bi-heart" },
  { name: "Pin", value: "bi-geo-alt" },
];

function validatePropsClient(props: any): string | null {
  if (!props || typeof props !== "object") return "props debe ser un objeto";
  if (!props.db || typeof props.db !== "object") return "props.db es requerido";
  
  if (!props.db.table || typeof props.db.table !== "string")
    return "props.db.table (string) es requerido";
  if (!Array.isArray(props.fields)) return "props.fields debe ser un array";
  for (let i = 0; i < props.fields.length; i++) {
    const f = props.fields[i];
    if (!f || typeof f !== "object") return `fields[${i}] debe ser objeto`;
    if (!f.name || typeof f.name !== "string")
      return `fields[${i}].name requerido`;
    if (!f.label || typeof f.label !== "string")
      return `fields[${i}].label requerido`;
    console.log("VALID TYPES", VALID_FIELD_TYPES);
    console.log("CHECK TYPE", i, JSON.stringify(f.type), "includes?", VALID_FIELD_TYPES.includes(f.type));
    if (!VALID_FIELD_TYPES.includes(f.type))
      return `fields[${i}].type inválido`;
    console.log("VALIDATE FIELD", i, "type=", f.type, "ref=", f.ref);
    if (f.type === "selectorTabla") {
      const r = f.ref;
      if (
        !r ||
        typeof r !== "object" ||
        typeof r.moduleSlug !== "string" ||
        typeof r.displayField !== "string"
      ) {
        return `fields[${i}].ref inválido para selectorTabla`;
      }

      if (r.multiple !== undefined && typeof r.multiple !== "boolean") {
        return `fields[${i}].ref.multiple debe ser boolean`;
      }
    }
    if (f.type === "ReverseLink") {
      const r = f.ref;
      if (!r || typeof r !== "object") return `fields[${i}].ref inválido para ReverseLink`;
      if (typeof (r as any).moduleSlug !== "string") return `fields[${i}].ref.moduleSlug requerido`;
      if (typeof (r as any).foreignKey !== "string") return `fields[${i}].ref.foreignKey requerido`;
      // parentKey opcional
    }
        if (f.compute?.type === "formula") {
      if (typeof f.compute.expr !== "string" || !Array.isArray(f.compute.deps)) {
        return `fields[${i}].compute formula inválido`;
      }
      
    }

    if (f.compute?.type === "aggregate") {
      if (typeof f.compute.sourceTable !== "string" || typeof f.compute.field !== "string") {
        return `fields[${i}].compute aggregate inválido (sourceTable/field)`;
      }
      if (!["sum","avg","min","max","count"].includes(f.compute.op)) {
        return `fields[${i}].compute aggregate.op inválido`;
      }
      if (!Array.isArray(f.compute.where)) {
        return `fields[${i}].compute aggregate.where debe ser array`;
      }
    }
  }
  
  return null;
}

function normalizeFieldType(field: Field, nextType: FieldType): Field {
  const base: any = { ...field, type: nextType };

  if (nextType === "selectorTabla") {
    return {
      ...base,
      type: "selectorTabla",
      ref: {
        moduleSlug: (field as any).ref?.moduleSlug ?? "",
        displayField: (field as any).ref?.displayField ?? "name",
        multiple: (field as any).ref?.multiple,
        table: (field as any).ref?.table,
        valueField: (field as any).ref?.valueField,
        filters: (field as any).ref?.filters,
        sort: (field as any).ref?.sort,
      },
    };
  }

  if (nextType === "ReverseLink") {
    return {
      ...base,
      type: "ReverseLink",
      ref: {
        moduleSlug: (field as any).ref?.moduleSlug ?? "",
        foreignKey: (field as any).ref?.foreignKey ?? "",
        parentKey: (field as any).ref?.parentKey ?? "id",
        limit: (field as any).ref?.limit ?? 20,
        filters: (field as any).ref?.filters,
        sort: (field as any).ref?.sort,
      },
    };
  }

  const { ref, ...rest } = base;
  return rest as Field;
}



// —— Subcomponentes UI simples ————————————————————————————————
function getSectionFieldSet(sections: Array<{ fields: string[] }>) {
  const set = new Set<string>();
  for (const s of sections) {
    for (const name of s.fields || []) set.add(name);
  }
  return set;
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.card} style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className={styles.label} style={{ display: "block", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function IconPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
          gap: 8,
        }}
      >
        {ICON_OPTIONS.map((icon) => (
          <button
            type="button"
            key={icon.value}
            onClick={() => onChange(icon.value)}
            className={styles.btn}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 8,
              background:
                value === icon.value ? "var(--ring)" : undefined,
              border:
                value === icon.value
                  ? "1px solid #042a75ff"
                  : "1px solid var(--border,#ddd)",
            }}
            title={icon.name}
          >
            {/* Sustituir este span por Icon component */}
            <span className={"bi " + icon.value}></span>
            <small style={{ fontSize: 11, marginTop: 4, color: "#ffffffff" }}>
              {icon.name}
            </small>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 12 }}>
        Icono seleccionado:{" "}
        <strong>
          {ICON_OPTIONS.find((i) => i.value === value)?.name || "—"}
        </strong>
      </div>
    </div>
  );
}


function ArrayChips({
  value,
  onChange,
  placeholder = "Añade opción y pulsa Enter",
}: {
  value?: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const vals = value || [];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {vals.map((v, i) => (
          <span key={i} className={styles.badge}>
            {v}
            <button
              type="button"
              onClick={() => onChange(vals.filter((_, idx) => idx !== i))}
              style={{ marginLeft: 6 }}
              aria-label="Eliminar opción"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        className={styles.input}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" && input.trim()) {
            e.preventDefault();
            onChange([...vals, input.trim()]);
            setInput("");
          }
        }}
      />
    </div>
  );
}
const defaultFormula: Extract<Compute, { type: "formula" }> = {
  type: "formula",
  expr: "",
  deps: [],
  persist: "onSave",
};

const defaultAggregate: Extract<Compute, { type: "aggregate" }> = {
  type: "aggregate",
  sourceTable: "",
  field: "",
  op: "sum",
  where: [],
  persist: "onSave",
};

const computeNone: Extract<Compute, { type: "none" }> = { type: "none" };

// Aseguradores
function ensureFormula(field: FieldSchema): Extract<Compute, { type: "formula" }> {
  const prev = field.compute?.type === "formula" ? field.compute : undefined;
  return { ...defaultFormula, ...(prev || {}) };
}

function ensureAggregate(field: FieldSchema): Extract<Compute, { type: "aggregate" }> {
  const prev = field.compute?.type === "aggregate" ? field.compute : undefined;
  return { ...defaultAggregate, ...(prev || {}) };
}

// Helpers para el selector de modo
function getComputeKind(field: FieldSchema): "none" | "formula" | "aggregate" {
  if (!field.compute) return "none";
  return field.compute.type;
}

function setComputeKind(field: FieldSchema, kind: "none" | "formula" | "aggregate"): FieldSchema {
  if (kind === "none") return { ...field, compute: computeNone };
  if (kind === "formula") return { ...field, compute: ensureFormula(field) };
  return { ...field, compute: ensureAggregate(field) };
}


function FieldRow({
  field,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canUp,
  canDown,
  readOnly,
}: {
  field: FieldSchema;
  onChange: (f: FieldSchema) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canUp: boolean;
  canDown: boolean;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const summaryLabel = field.label?.trim() || "Sin label";
  const summaryName = field.name?.trim() || "sin_name";
  const summaryType = field.type || "text";
  const summaryCompute = getComputeKind(field);

  const duplicate = () => {
    const baseName = (field.name || "campo").replace(/\s+/g, "_");
    const copy: FieldSchema = {
      ...field,
      name: `${baseName}_copy_${Math.floor(Math.random() * 1000)}`,
      label: `${field.label || "Campo"} (copia)`,
    };
    onChange(copy);
  };

  return (
    <div className={styles.fieldformcard} style={{ marginBottom: 12 }}>
      {/* ========= HEADER COMPACTO ========= */}
      <div className={styles.card} style={{ padding: 12 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            type="button"
            className={styles.btn}
            onClick={() => setOpen((v) => !v)}
            style={{
              flex: 1,
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
            title={open ? "Ocultar detalle" : "Mostrar detalle"}
          >
            <div style={{ fontWeight: 700 }}>
              {summaryLabel}
              <span style={{ opacity: 0.8, fontWeight: 500 }}> · {summaryName}</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, opacity: 0.9 }}>
              <span className={styles.hint}>type: {summaryType}</span>
              <span className={styles.hint}>compute: {summaryCompute}</span>
              {field.required ? <span className={styles.hint}>required</span> : null}
              {field.readOnly ? <span className={styles.hint}>readOnly</span> : null}
              {(field.visible ?? true) === false ? <span className={styles.hint}>hidden</span> : null}
              {field.allowOverride ? <span className={styles.hint}>override</span> : null}
            </div>
          </button>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className={styles.btn}
              onClick={onMoveUp}
              disabled={!canUp || readOnly}
              title="Subir"
            >
              ↑
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={onMoveDown}
              disabled={!canDown || readOnly}
              title="Bajar"
            >
              ↓
            </button>

            <button
              type="button"
              className={styles.btn}
              onClick={duplicate}
              disabled={readOnly}
              title="Duplicar (rápido)"
            >
              ⎘
            </button>

            <button
              type="button"
              className={styles.btn}
              onClick={onRemove}
              disabled={readOnly}
              style={{ background: "#fc0505ff", borderColor: "#ffb3b3" }}
              title="Eliminar campo"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>

      {/* ========= DETALLE PLEGABLE (tu contenido original, sin perder nada) ========= */}
      {open && (
        <>
          {/* BLOQUE PRINCIPAL (tu grid 1 + grid 2) */}
          <div className={styles.card} style={{ marginTop: 12 }}>
            <div className={styles.grid}>
              <div>
                <label className={styles.label}>name</label>
                <input
                  className={styles.input}
                  value={field.name}
                  onChange={(e) => onChange({ ...field, name: e.target.value })}
                  disabled={readOnly}
                />
              </div>

              <div>
                <label className={styles.label}>label</label>
                <input
                  className={styles.input}
                  value={field.label}
                  onChange={(e) => onChange({ ...field, label: e.target.value })}
                  disabled={readOnly}
                />
              </div>

              <div>
                <label className={styles.label}>type</label>
                <select
                  className={styles.input}
                  value={field.type}
                  onChange={(e) => onChange(normalizeFieldType(field, e.target.value as FieldType))}
                  disabled={readOnly}
                >
                  {VALID_FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Modo de cálculo */}
              <div>
                <label className={styles.label}>compute</label>
                <select
                  className={styles.input}
                  value={getComputeKind(field)}
                  onChange={(e) => onChange(setComputeKind(field, e.target.value as any))}
                  disabled={readOnly}
                >
                  <option value="none">none</option>
                  <option value="formula">formula</option>
                  <option value="aggregate">aggregate</option>
                </select>
              </div>

              <div className={styles.switchRow}>
                <label className={styles.label}>required</label>
                <input
                  type="checkbox"
                  checked={!!field.required}
                  onChange={(e) => onChange({ ...field, required: e.target.checked })}
                  disabled={readOnly}
                />
              </div>

              <div className={styles.switchRow}>
                <label className={styles.label}>visible</label>
                <input
                  type="checkbox"
                  checked={field.visible ?? true}
                  onChange={(e) => onChange({ ...field, visible: e.target.checked })}
                  disabled={readOnly}
                />
              </div>

              <div className={styles.switchRow}>
                <label className={styles.label}>readOnly</label>
                <input
                  type="checkbox"
                  checked={!!field.readOnly}
                  onChange={(e) => onChange({ ...field, readOnly: e.target.checked })}
                  disabled={readOnly}
                />
              </div>

              <div className={styles.switchRow}>
                <label className={styles.label}>allowOverride (forzar valor)</label>
                <input
                  type="checkbox"
                  checked={!!field.allowOverride}
                  onChange={(e) => onChange({ ...field, allowOverride: e.target.checked })}
                  disabled={readOnly}
                />
              </div>

              <div>
                <label className={styles.label}>appareance</label>
                <select
                  className={styles.input}
                  value={field.appareance}
                  onChange={(e) => onChange({ ...field, appareance: e.target.value as Appareance })}
                  disabled={readOnly}
                >
                  {Appareance_Valid_Types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.grid}>
              <div>
                <label className={styles.label}>placeholder</label>
                <input
                  className={styles.input}
                  value={field.placeholder || ""}
                  onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
                  disabled={readOnly}
                />
              </div>

              <div>
                <label className={styles.label}>help</label>
                <input
                  className={styles.input}
                  value={field.help || ""}
                  onChange={(e) => onChange({ ...field, help: e.target.value })}
                  disabled={readOnly}
                />
              </div>

              <div>
                <label className={styles.label}>defaultValue</label>
                <input
                  className={styles.input}
                  value={
                    typeof field.defaultValue === "string" || typeof field.defaultValue === "number"
                      ? String(field.defaultValue)
                      : field.defaultValue === undefined
                        ? ""
                        : JSON.stringify(field.defaultValue)
                  }
                  onChange={(e) => onChange({ ...field, defaultValue: e.target.value })}
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>

          {/* Opcionales comunes */}
          <div className={styles.card} style={{ marginTop: 12 }}>
            <h4 style={{ marginTop: 0 }}>Opciones UI</h4>

            <div className={styles.grid}>
              <div>
                <label className={styles.label}>ui.width</label>
                <select
                  className={styles.input}
                  value={field.ui?.width || "1/1"}
                  onChange={(e) =>
                    onChange({
                      ...field,
                      ui: { ...(field.ui || {}), width: e.target.value as any },
                    })
                  }
                  disabled={readOnly}
                >
                  <option value="1/1">1/1</option>
                  <option value="1/2">1/2</option>
                  <option value="1/3">1/3</option>
                  <option value="2/3">2/3</option>
                </select>
              </div>

              <div>
                <label className={styles.label}>ui.variant</label>
                <select
                  className={styles.input}
                  value={field.ui?.variant || "input"}
                  onChange={(e) =>
                    onChange({
                      ...field,
                      ui: { ...(field.ui || {}), variant: e.target.value as any },
                    })
                  }
                  disabled={readOnly}
                >
                  <option value="input">input</option>
                  <option value="textarea">textarea</option>
                  <option value="currency">currency</option>
                  <option value="percent">percent</option>
                  <option value="richtext">richtext</option>
                </select>
              </div>
            </div>
          </div>

          {/* Específico por tipo */}
          {["select", "multiselect"].includes(field.type) && (
            <Labeled label="options">
              <ArrayChips
                value={field.options || []}
                onChange={(opts) => onChange({ ...field, options: opts })}
              />
            </Labeled>
          )}

          {field.type === "selectorTabla" && (
            <div className={styles.card} style={{ marginTop: 12 }}>
              <h4 style={{ marginTop: 0 }}>Selector Tabla</h4>

              <div className={styles.grid}>
                <div>
                  <label className={styles.label}>ref.moduleSlug</label>
                  <input
                    className={styles.input}
                    value={field.ref?.moduleSlug || ""}
                    onChange={(e) =>
                      onChange({
                        ...field,
                        ref: {
                          ...(field.ref || { moduleSlug: "", displayField: "" }),
                          moduleSlug: e.target.value,
                        },
                      })
                    }
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <label className={styles.label}>ref.displayField</label>
                  <input
                    className={styles.input}
                    value={field.ref?.displayField || ""}
                    onChange={(e) =>
                      onChange({
                        ...field,
                        ref: {
                          ...(field.ref || { moduleSlug: "", displayField: "" }),
                          displayField: e.target.value,
                        },
                      })
                    }
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <label className={styles.label}>ref.valueField</label>
                  <input
                    className={styles.input}
                    value={field.ref?.valueField || "id"}
                    onChange={(e) =>
                      onChange({
                        ...field,
                        ref: {
                          ...(field.ref || { moduleSlug: "", displayField: "" }),
                          valueField: e.target.value,
                        },
                      })
                    }
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <label className={styles.label}>ref.multiple</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!field.ref?.multiple}
                      onChange={(e) =>
                        onChange({
                          ...field,
                          ref: {
                            ...(field.ref || { moduleSlug: "", displayField: "" }),
                            multiple: e.target.checked,
                          },
                        })
                      }
                      disabled={readOnly}
                    />
                    <span style={{ fontSize: 13, opacity: 0.85 }}>Permitir multiselección</span>
                  </div>
                </div>

                <div className="full">
                  <label className={styles.label}>ref.filters (JSON)</label>
                  <textarea
                    className={styles.textarea}
                    rows={4}
                    value={JSON.stringify(field.ref?.filters || [], null, 2)}
                    onChange={(e) => {
                      try {
                        const filters = JSON.parse(e.target.value || "[]");
                        onChange({
                          ...field,
                          ref: {
                            ...(field.ref || { moduleSlug: "", displayField: "" }),
                            filters,
                          },
                        });
                      } catch {
                        // opcional: marcar error visual
                      }
                    }}
                    spellCheck={false}
                    disabled={readOnly}
                  />
                  <div className={styles.hint}>
                    Ejemplo: [{"{"}"field":"obraId","op":"=","value":123{""}{"}"}]
                  </div>
                </div>

                <div className="full">
                  <label className={styles.label}>ref.sort (JSON)</label>
                  <textarea
                    className={styles.textarea}
                    rows={3}
                    value={JSON.stringify(field.ref?.sort || [], null, 2)}
                    onChange={(e) => {
                      try {
                        const sort = JSON.parse(e.target.value || "[]");
                        onChange({
                          ...field,
                          ref: {
                            ...(field.ref || { moduleSlug: "", displayField: "" }),
                            sort,
                          },
                        });
                      } catch {
                        // opcional: marcar error
                      }
                    }}
                    spellCheck={false}
                    disabled={readOnly}
                  />
                  <div className={styles.hint}>
                    Ejemplo: [{"{"}"field":"nombre","direction":"asc"{""}{"}"}]
                  </div>
                </div>
              </div>
            </div>
          )}
          {field.type === "ReverseLink" && (
            <div className={styles.grid}>
              <div>
                <label className={styles.label}>ref.moduleSlug (tabla destino)</label>
                <input
                  className={styles.input}
                  value={field.ref?.moduleSlug || ""}
                  onChange={(e) =>
                    onChange({
                      ...field,
                      ref: { ...(field.ref || {}), moduleSlug: e.target.value },
                    })
                  }
                />
              </div>

    <div>
      <label className={styles.label}>ref.foreignKey (FK en la tabla destino)</label>
      <input
        className={styles.input}
        value={field.ref?.foreignKey || ""}
        onChange={(e) =>
          onChange({
            ...field,
            ref: { ...(field.ref || {}), foreignKey: e.target.value },
          })
        }
        placeholder="ej: clienteId"
      />
    </div>

    <div>
      <label className={styles.label}>ref.parentKey (campo del registro actual)</label>
      <input
        className={styles.input}
        value={field.ref?.parentKey || "id"}
        onChange={(e) =>
          onChange({
            ...field,
            ref: { ...(field.ref || {}), parentKey: e.target.value },
          })
        }
        placeholder="id"
      />
    </div>

    <div>
      <label className={styles.label}>ref.limit</label>
      <input
        className={styles.input}
        type="number"
        value={field.ref?.limit ?? 20}
        onChange={(e) =>
          onChange({
            ...field,
            ref: { ...(field.ref || {}), limit: Number(e.target.value || 20) },
          })
        }
      />
    </div>

    <div className="full">
      <label className={styles.label}>ref.filters extra (JSON)</label>
      <textarea
        className={styles.textarea}
        rows={4}
        value={JSON.stringify(field.ref?.filters || [], null, 2)}
        onChange={(e) => {
          try {
            const filters = JSON.parse(e.target.value || "[]");
            onChange({
              ...field,
              ref: { ...(field.ref || {}), filters },
            });
          } catch {}
        }}
        spellCheck={false}
      />
      <div className={styles.hint}>
        Se aplican además del filtro FK. Ej: [{"{"}"field":"estado","op":"=","value":"activa"{""}{"}"}]
      </div>
    </div>

    <div className="full">
      <label className={styles.label}>ref.sort (JSON)</label>
      <textarea
        className={styles.textarea}
        rows={3}
        value={JSON.stringify(field.ref?.sort || [], null, 2)}
        onChange={(e) => {
          try {
            const sort = JSON.parse(e.target.value || "[]");
            onChange({
              ...field,
              ref: { ...(field.ref || {}), sort },
            });
          } catch {}
        }}
        spellCheck={false}
      />
      <div className={styles.hint}>
        Ej: [{"{"}"field":"created_at","direction":"desc"{""}{"}"}]
      </div>
    </div>
  </div>
)}


          {/* IMPORTANTE: tu código tenía un bloque field.type === "formula" y otro getComputeKind(field) === "formula".
             Dejo SOLO el segundo (getComputeKind) porque es el que realmente corresponde al selector compute y evita duplicar UI.
             Si quieres mantener ambos por compatibilidad, te lo vuelvo a dejar doble, pero no aporta y confunde. */}

          {getComputeKind(field) === "formula" && (
            <div className={styles.card} style={{ marginTop: 12 }}>
              <h4 style={{ marginTop: 0 }}>Cálculo (formula)</h4>

              <label className={styles.label}>Expresión</label>
              <input
                className={styles.input}
                value={ensureFormula(field).expr}
                onChange={(e) => {
                  const base = ensureFormula(field);
                  onChange({ ...field, compute: { ...base, expr: e.target.value } });
                }}
                disabled={readOnly}
              />

              <label className={styles.label}>Dependencias (coma separadas)</label>
              <input
                className={styles.input}
                value={ensureFormula(field).deps.join(",")}
                onChange={(e) => {
                  const deps = e.target.value
                    .split(",")
                    .map((d) => d.trim())
                    .filter(Boolean);
                  const base = ensureFormula(field);
                  onChange({ ...field, compute: { ...base, deps } });
                }}
                disabled={readOnly}
              />

              <label className={styles.label}>Persistencia</label>
              <select
                className={styles.input}
                value={ensureFormula(field).persist}
                onChange={(e) => {
                  const base = ensureFormula(field);
                  onChange({
                    ...field,
                    compute: { ...base, persist: e.target.value as "none" | "onSave" | "always" },
                  });
                }}
                disabled={readOnly}
              >
                <option value="none">none</option>
                <option value="onSave">onSave</option>
                <option value="always">always</option>
              </select>
            </div>
          )}

          {getComputeKind(field) === "aggregate" && (
            <div className={styles.card} style={{ marginTop: 12 }}>
              <h4 style={{ marginTop: 0 }}>Cálculo (aggregate)</h4>

              <div className={styles.grid}>
                <div>
                  <label className={styles.label}>sourceTable</label>
                  <input
                    className={styles.input}
                    value={ensureAggregate(field).sourceTable}
                    onChange={(e) => {
                      const base = ensureAggregate(field);
                      onChange({ ...field, compute: { ...base, sourceTable: e.target.value } });
                    }}
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <label className={styles.label}>field</label>
                  <input
                    className={styles.input}
                    value={ensureAggregate(field).field}
                    onChange={(e) => {
                      const base = ensureAggregate(field);
                      onChange({ ...field, compute: { ...base, field: e.target.value } });
                    }}
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <label className={styles.label}>op</label>
                  <select
                    className={styles.input}
                    value={ensureAggregate(field).op}
                    onChange={(e) => {
                      const base = ensureAggregate(field);
                      onChange({ ...field, compute: { ...base, op: e.target.value as any } });
                    }}
                    disabled={readOnly}
                  >
                    <option value="sum">sum</option>
                    <option value="avg">avg</option>
                    <option value="min">min</option>
                    <option value="max">max</option>
                    <option value="count">count</option>
                  </select>
                </div>
              </div>

              <label className={styles.label}>where (JSON)</label>
              <textarea
                className={styles.textarea}
                rows={5}
                value={JSON.stringify(ensureAggregate(field).where, null, 2)}
                onChange={(e) => {
                  try {
                    const where = JSON.parse(e.target.value || "[]");
                    const base = ensureAggregate(field);
                    onChange({ ...field, compute: { ...base, where } });
                  } catch {
                    // opcional: error visual
                  }
                }}
                spellCheck={false}
                disabled={readOnly}
              />

              <label className={styles.label}>persist</label>
              <select
                className={styles.input}
                value={ensureAggregate(field).persist}
                onChange={(e) => {
                  const base = ensureAggregate(field);
                  onChange({
                    ...field,
                    compute: { ...base, persist: e.target.value as "none" | "onSave" | "always" },
                  });
                }}
                disabled={readOnly}
              >
                <option value="none">none</option>
                <option value="onSave">onSave</option>
                <option value="always">always</option>
              </select>
            </div>
          )}

          {/* ========= FOOTER DE ACCIONES (lo mantengo, por si te gusta tenerlo también abajo) ========= */}
          <div className={styles.actionsRow} style={{ justifyContent: "space-between", marginTop: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className={styles.btn} onClick={onMoveUp} disabled={!canUp || readOnly}>
                ↑
              </button>
              <button type="button" className={styles.btn} onClick={onMoveDown} disabled={!canDown || readOnly}>
                ↓
              </button>
            </div>

            <button
              type="button"
              className={styles.btn}
              onClick={onRemove}
              disabled={readOnly}
              style={{ background: "#fc0505ff", borderColor: "#ffb3b3" }}
            >
              Eliminar campo
            </button>
          </div>
        </>
      )}
    </div>
  );
}


// —— Form principal ————————————————————————————————————————————————

export default function ModuloForm({
  initialData,
  mode,
}: {
  initialData: any;
  mode: "view" | "edit" | "create";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const readOnly = mode === "view";

  const [nombre, setNombre] = useState(initialData?.nombre ?? "");
  const [route, setRoute] = useState(initialData?.route ?? "");

  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [tipo, setTipo] = useState(initialData?.tipo ?? "tabla");
  const [orden, setOrden] = useState<number>(initialData?.orden ?? 0);
  const [activo, setActivo] = useState<boolean>(!!initialData?.activo);
  const [parentId, setParentId] = useState<string | null>(initialData?.parent_id ?? null);

  // Estado visual de props
  const [propsObj, setPropsObj] = useState<ModuleSchema>(() => {
  const base: ModuleSchema = {
    db: { table: "", softDelete: false },
    fields: [],
    ui: { icon: "", color: "#2b2b2b" },
  };
  const raw = initialData?.props;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw || {};
    return {
      db: { ...base.db, ...(parsed.db || {}) },
      fields: Array.isArray(parsed.fields) ? parsed.fields : [],
      ui: { ...base.ui, ...(parsed.ui || {}) },
    };
  } catch {
    return base;
  }
});
  const getFormSections = (): FormSection[] => {
    const uiAny = (propsObj.ui || {}) as any;
    return Array.isArray(uiAny.formSections) ? uiAny.formSections : [];
  };

  const setFormSections = (sections: FormSection[]) => {
    const ui = { ...(propsObj.ui || {}), formSections: sections as any };
    const next = { ...propsObj, ui };
    setPropsObj(next);
    setRawText(JSON.stringify(next, null, 2));
  };
  // Toggle para mostrar el JSON crudo si quieres
  const [showRaw, setShowRaw] = useState(false);
  const [rawText, setRawText] = useState(() => JSON.stringify(propsObj, null, 2));

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setMsg(null);

    if (!nombre) return setMsg({ ok: false, text: "nombre es requerido" });
    if (!slug) return setMsg({ ok: false, text: "slug es requerido" });
    if (!["carpeta", "tabla", "subtabla", "vista"].includes(tipo))
      return setMsg({ ok: false, text: "tipo inválido" });
    if (Number.isNaN(orden) || orden < 0)
      return setMsg({ ok: false, text: "orden debe ser un entero ≥ 0" });

    let toSave: any = propsObj;

    // Si estás en modo JSON crudo, intenta respetar lo que hay en el textarea
    if (showRaw) {
      try {
        toSave = JSON.parse(rawText || "{}");
      } catch {
        return setMsg({ ok: false, text: "El JSON de props no es válido." });
      }
    }

    if (tipo !== "carpeta") {
      const err = validatePropsClient(toSave);
      if (err) return setMsg({ ok: false, text: `Props inválidos: ${err}` });
    }

    start(async () => {
      const fd = new FormData();
      if (initialData?.id) fd.set("id", initialData.id);
      if (parentId !== undefined) fd.set("parent_id", parentId ?? "");
      fd.set("nombre", nombre);
      fd.set("slug", slug);
      fd.set("route", route);
      fd.set("tipo", tipo);
      fd.set("orden", String(orden));
      fd.set("activo", String(activo));
      fd.set("props", JSON.stringify(toSave));

      const res = await upsertModuloAction(fd);
      setMsg({ ok: res.ok, text: res.detail });

      if (res.ok && res.id) {
        const sp = new URLSearchParams(searchParams.toString());
        sp.set("edit", "false");
        router.replace(`/system/modulos/${res.id}?${sp.toString()}`);
        router.refresh();
      }
    });
    console.log("FIELDS[0] DEBUG", propsObj.fields?.[0]);
  };

  // Helpers de fields
  const updateField = (idx: number, patch: FieldSchema) => {
    const next = [...propsObj.fields];
    next[idx] = patch;
    setPropsObj({ ...propsObj, fields: next });
    setRawText(JSON.stringify({ ...propsObj, fields: next }, null, 2));
  };
  const removeField = (idx: number) => {
    const next = propsObj.fields.filter((_, i) => i !== idx);
    setPropsObj({ ...propsObj, fields: next });
    setRawText(JSON.stringify({ ...propsObj, fields: next }, null, 2));
  };
  const moveField = (idx: number, dir: -1 | 1) => {
    const next = [...propsObj.fields];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setPropsObj({ ...propsObj, fields: next });
    setRawText(JSON.stringify({ ...propsObj, fields: next }, null, 2));
  };
  const addField = () => {
    const base: FieldSchema = { name: `campo_${propsObj.fields.length + 1}`, label: "Nuevo campo", type: "text" };
    const next = [...propsObj.fields, base];
    setPropsObj({ ...propsObj, fields: next });
    setRawText(JSON.stringify({ ...propsObj, fields: next }, null, 2));
  };
    const addSection = () => {
    const sections = getFormSections();
    const index = sections.length + 1;
    const newSection: FormSection = {
      id: `section_${index}`,
      label: `Sección ${index}`,
      description: "",
      fields: [],
    };
    setFormSections([...sections, newSection]);
  };

  const updateSection = (idx: number, patch: Partial<FormSection>) => {
    const sections = getFormSections();
    if (!sections[idx]) return;
    const updated = [...sections];
    updated[idx] = { ...updated[idx], ...patch };
    setFormSections(updated);
  };

  const removeSection = (idx: number) => {
    const sections = getFormSections();
    const updated = sections.filter((_, i) => i !== idx);
    setFormSections(updated);
  };


  const readOnlyAttr = { disabled: readOnly } as const;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

    const isSectionOpen = (id: string) => !!openSections[id];

    const toggleSectionOpen = (id: string) => {
      setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
    };
    const moveSection = (idx: number, dir: -1 | 1) => {
    const sections = [...getFormSections()];
    const next = idx + dir;

    if (next < 0 || next >= sections.length) return;

    const copy = [...sections];
    const [item] = copy.splice(idx, 1);
    copy.splice(next, 0, item);

    setFormSections(copy);
  };


  return (
    <form className={styles.card} onSubmit={onSubmit}>
      {/* Cabecera módulo */}
      <div className={styles.card}>
      <div className={styles.grid}>
        <div>
          <label className={styles.label}>Nombre</label>
          <input className={styles.input} value={nombre} onChange={(e)=>setNombre(e.target.value)} {...readOnlyAttr}/>
        </div>
        <div>
          <label className={styles.label}>Slug/Xml</label>
          <input className={styles.input} value={slug} onChange={(e)=>setSlug(e.target.value)} {...readOnlyAttr}/>
        </div>
        <div>
          <label className={styles.label}>Tipo</label>
          <select className={styles.input} value={tipo} onChange={(e)=>setTipo(e.target.value)} {...readOnlyAttr}>
            <option value="carpeta">carpeta</option>
            <option value="tabla">tabla</option>
            <option value="subtabla">subtabla</option>
            <option value="vista">vista</option>
          </select>
        </div>
        </div>
  
        <div>
          <label className={styles.label}>Orden</label>
          <input type="number" className={styles.input} value={orden} onChange={(e)=>setOrden(Number(e.target.value))} {...readOnlyAttr}/>
        </div>
        <div>
          <label className={styles.label}>Ruta (route)</label>
          <input className={styles.input} value={route} onChange={(e)=>setRoute(e.target.value)} {...readOnlyAttr}/>
        </div>
        <div className={styles.switchRow}>
          <label className={styles.label}>Activo</label>
          <input type="checkbox" checked={activo} onChange={(e)=>setActivo(e.target.checked)} {...readOnlyAttr}/>
        </div>
        <div>
          <label className={styles.label}>Parent ID (opcional)</label>
          <input className={styles.input} value={parentId ?? ""} onChange={(e)=>setParentId(e.target.value || null)} {...readOnlyAttr}/>
        </div>
      </div>

      {/* Sección DB */}
      <Section title="Sección: DB">
        <div className={styles.grid}>
          <div>
            <label className={styles.label}>db.table</label>
            <input
              className={styles.input}
              value={propsObj.db.table}
              onChange={(e) => {
                const db = { ...propsObj.db, table: e.target.value };
                setPropsObj({ ...propsObj, db });
                setRawText(JSON.stringify({ ...propsObj, db }, null, 2));
              }}
              {...readOnlyAttr}
            />
          </div>
          <div>
            <label className={styles.label}>db.primaryKey (opcional)</label>
            <input
              className={styles.input}
              value={propsObj.db.primaryKey || ""}
              onChange={(e) => {
                const db = { ...propsObj.db, primaryKey: e.target.value || undefined };
                setPropsObj({ ...propsObj, db });
                setRawText(JSON.stringify({ ...propsObj, db }, null, 2));
              }}
              {...readOnlyAttr}
            />
          </div>
          <div className={styles.switchRow}>
            <label className={styles.label}>db.softDelete</label>
            <input
              type="checkbox"
              checked={!!propsObj.db.softDelete}
              onChange={(e) => {
                const db = { ...propsObj.db, softDelete: e.target.checked };
                setPropsObj({ ...propsObj, db });
                setRawText(JSON.stringify({ ...propsObj, db }, null, 2));
              }}
              {...readOnlyAttr}
            />
          </div>
        </div>
      </Section>

      {/* Sección UI */}
      <Section title="Sección: UI">
        <div className={styles.grid}>
          <div>
            <label className={styles.label}>ui.color</label>
            <input
              type="color"
              className={styles.input}
              value={propsObj.ui?.color || "#2b2b2b"}
              onChange={(e) => {
                const ui = { ...(propsObj.ui || {}), color: e.target.value };
                setPropsObj({ ...propsObj, ui });
                setRawText(JSON.stringify({ ...propsObj, ui }, null, 2));
              }}
              {...readOnlyAttr}
              style={{ padding: 0, height: 42 }}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className={styles.label}>ui.icon</label>
            <IconPicker
              value={propsObj.ui?.icon}
              onChange={(icon) => {
                const ui = { ...(propsObj.ui || {}), icon };
                setPropsObj({ ...propsObj, ui });
                setRawText(JSON.stringify({ ...propsObj, ui }, null, 2));
              }}
            />
          </div>
        </div>
      </Section>


      <Section title="Formulario">
          <div className={styles.actionsRow} style={{ justifyContent: "space-between", gap: 12 }}>
            <button type="button" className={styles.btnAdd} onClick={addField} disabled={readOnly}>
              + Añadir campo
            </button>

            <button type="button" className={styles.btnAdd} onClick={addSection} disabled={readOnly}>
              + Añadir sección
            </button>
          </div>

          {/* hints */}
          {propsObj.fields.length === 0 && getFormSections().length === 0 && (
            <div className={styles.hint}>
              Aún no hay campos ni secciones. Puedes crear secciones (Identificación, Contacto…) y luego asignar campos.
            </div>
          )}

          {/* ====== SECCIONES (con fields dentro) ====== */}
          {getFormSections().map((section, sIdx) => {
            const allFieldNames = propsObj.fields.map((f) => f.name);
            const fieldsInSection = propsObj.fields.filter((f) => (section.fields || []).includes(f.name));

            return (
              <div key={section.id} className={styles.sectionRow}>
                {/* header compacto + acciones */}
                <div className={styles.sectionHeader}>
                  <button
                    type="button"
                    className={styles.sectionToggle}
                    onClick={() => toggleSectionOpen(section.id)} // te dejo función abajo
                    title="Mostrar/ocultar sección"
                  >
                    <div className={styles.sectionTitleLine}>
                      <span className={styles.sectionTitle}>{section.label || "Sección sin label"}</span>
                      <span className={styles.sectionMeta}>
                        <span className={styles.badgeSoft}>id: {section.id}</span>
                        <span className={styles.badgeSoft}>{(section.fields || []).length} campos</span>
                      </span>
                    </div>
                    {section.description ? (
                      <div className={styles.sectionDescPreview}>
                        {section.description.length > 80 ? section.description.slice(0, 80) + "…" : section.description}
                      </div>
                    ) : null}
                  </button>

                  <div className={styles.sectionActions}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => moveSection(sIdx, -1)}
                      disabled={readOnly || sIdx === 0}
                      title="Subir sección"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => moveSection(sIdx, +1)}
                      disabled={readOnly || sIdx === getFormSections().length - 1}
                      title="Bajar sección"
                    >
                      ↓
                    </button>

                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={() => removeSection(sIdx)}
                      disabled={readOnly}
                      title="Eliminar sección"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                {/* body de sección (config + asignación) */}
                {isSectionOpen(section.id) && (
                  <div className={styles.sectionBody}>
                    <div className={styles.grid}>
                      <div>
                        <label className={styles.label}>Label sección</label>
                        <input
                          className={styles.input}
                          value={section.label}
                          onChange={(e) => updateSection(sIdx, { label: e.target.value })}
                          disabled={readOnly}
                        />
                      </div>
                      <div>
                        <label className={styles.label}>ID</label>
                        <input
                          className={styles.input}
                          value={section.id}
                          onChange={(e) => updateSection(sIdx, { id: e.target.value || `section_${sIdx + 1}` })}
                          disabled={readOnly}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={styles.label}>Descripción</label>
                      <input
                        className={styles.input}
                        value={section.description || ""}
                        onChange={(e) => updateSection(sIdx, { description: e.target.value })}
                        disabled={readOnly}
                      />
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <label className={styles.label}>Campos en esta sección</label>
                      <select
                        multiple
                        className={styles.input}
                        value={section.fields}
                        onChange={(e) => {
                          const selected = Array.from(e.currentTarget.selectedOptions).map((opt) => opt.value);
                          updateSection(sIdx, { fields: selected });
                        }}
                        disabled={readOnly}
                        style={{ height: 140 }}
                      >
                        {allFieldNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <div className={styles.hint}>Ctrl/Cmd para seleccionar varios.</div>
                    </div>

                    {/* ===== fields dentro de sección ===== */}
                    <div style={{ marginTop: 14 }}>
                      {fieldsInSection.length === 0 ? (
                        <div className={styles.hint}>No hay campos asignados a esta sección.</div>
                      ) : (
                        fieldsInSection.map((f) => {
                          const idx = propsObj.fields.findIndex((x) => x.name === f.name);
                          if (idx === -1) return null;

                          return (
                            <FieldRow
                              key={idx}
                              field={propsObj.fields[idx]}
                              onChange={(patch) => updateField(idx, patch)}
                              onRemove={() => removeField(idx)}
                              onMoveUp={() => moveField(idx, -1)}
                              onMoveDown={() => moveField(idx, +1)}
                              canUp={idx > 0}
                              canDown={idx < propsObj.fields.length - 1}
                              readOnly={readOnly}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ====== CAMPOS SIN SECCIÓN ====== */}
          {(() => {
            const sections = getFormSections();
            const inSections = getSectionFieldSet(sections);
            const unassigned = propsObj.fields
              .map((f, idx) => ({ f, idx }))
              .filter(({ f }) => !inSections.has(f.name));

            if (unassigned.length === 0) return null;

            return (
              <div className={styles.sectionRow} style={{ marginTop: 12 }}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitleLine}>
                    <span className={styles.sectionTitle}>Campos sin sección</span>
                    <span className={styles.sectionMeta}>
                      <span className={styles.badgeSoft}>{unassigned.length} campos</span>
                    </span>
                  </div>
                </div>

                <div className={styles.sectionBody}>
                  {unassigned.map(({ idx }) => (
                    <FieldRow
                      key={idx}
                      field={propsObj.fields[idx]}
                      onChange={(patch) => updateField(idx, patch)}
                      onRemove={() => removeField(idx)}
                      onMoveUp={() => moveField(idx, -1)}
                      onMoveDown={() => moveField(idx, +1)}
                      canUp={idx > 0}
                      canDown={idx < propsObj.fields.length - 1}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
      </Section>


      {/* JSON avanzado (opcional) */}
      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
          <span className={styles.hint}>Editor avanzado</span>
          <button type="button" className={styles.btn} onClick={() => setShowRaw(!showRaw)}>
            {showRaw ? "Ocultar JSON" : "Ver/editar JSON"}
          </button>
        </div>
        {showRaw && (
          <textarea
            className={styles.textarea}
            rows={16}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            spellCheck={false}
            disabled={readOnly}
          />
        )}
      </div>

      {/* Acciones */}
      <div className={styles.actionsRow}>
        {readOnly ? (
          <a className={styles.btn} href={`?edit=true`}>Editar</a>
        ) : (
          <button type="submit" disabled={pending}  className={styles.btn}>
            {msg ? (msg.ok?  "Guardado" : "Guardando...") : ("Guardar")}
            
          </button>
          
        )}
        <a className={styles.btn} href="/system/modulos">← Volver</a>
        {msg && <span className={msg.ok ? styles.msgOk : styles.msgErr}>{msg.text}</span>}
      </div>
    </form>
  );
}
