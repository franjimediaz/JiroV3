"use client";

import { useState, useTransition, useEffect  } from "react";
import styles from "./modulo-detalle.module.css";
import {IconPicker} from "@repo/ui";
import type { Field as FieldSchema, FieldType, ModuleSchema, Field, Appareance, Compute, FormSection, UiTab} from "@repo/types";
import {VALID_FIELD_TYPES,Appareance_Valid_Types} from "@repo/types";




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

    if (!VALID_FIELD_TYPES.includes(f.type))
      return `fields[${i}].type inválido`;
    
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




function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className={styles.label} style={{ display: "block", marginBottom: 6 }}>{label}</label>
      {children}
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
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.card} style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </div>
  );
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

  // arriba del return de FieldRow (o dentro, antes del return)
const [whereText, setWhereText] = useState(() =>
  JSON.stringify(ensureAggregate(field).where ?? [], null, 2)
);
const [whereErr, setWhereErr] = useState<string | null>(null);

// si cambia el field desde fuera (p.ej. cambias compute kind / cambias de campo)
useEffect(() => {
  setWhereText(JSON.stringify(ensureAggregate(field).where ?? [], null, 2));
  setWhereErr(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [field.name, field.compute?.type]);

const commitWhereIfValid = (text: string) => {
  try {
    const parsed = JSON.parse(text || "[]");
    if (!Array.isArray(parsed)) {
      setWhereErr("El where debe ser un ARRAY. Ejemplo: [{...}]");
      return;
    }

    // Validación suave: estructura mínima
    for (let i = 0; i < parsed.length; i++) {
      const c = parsed[i];
      if (!c || typeof c !== "object") {
        setWhereErr(`Condición [${i}] debe ser un objeto`);
        return;
      }
      if (typeof c.field !== "string" || !c.field.trim()) {
        setWhereErr(`Condición [${i}] => "field" (string) es requerido`);
        return;
      }
      if (typeof c.op !== "string" || !c.op.trim()) {
        setWhereErr(`Condición [${i}] => "op" (string) es requerido`);
        return;
      }
      // value puede ser string/number/boolean/null/array, pero debe existir la clave
      if (!("value" in c)) {
        setWhereErr(`Condición [${i}] => falta "value"`);
        return;
      }
    }

    setWhereErr(null);

    const base = ensureAggregate(field);
    onChange({ ...field, compute: { ...base, where: parsed } });
  } catch (e: any) {
    setWhereErr(e?.message || "JSON inválido");
  }
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
            <h4 style={{ marginTop: 0 }}>Opciones Generales</h4>
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

              <div>
                  <label className={styles.label}>visible when</label>
                  <select
                    className={styles.input}
                    value={field.visibleWhen || "add_edit"}
                    onChange={(e) =>
                      onChange({
                        ...field,
                        visibleWhen: e.target.value as "add" | "edit" | "add_edit",
                      })
                    }
                  >
                    <option value="add">add</option>
                    <option value="edit">edit</option>
                    <option value="add_edit">add & edit</option>
                  </select>
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
                <label className={styles.label}>virtual</label>
                <input
                  type="checkbox"
                  checked={!!field.virtual}
                  onChange={(e) => onChange({ ...field, virtual: e.target.checked })}
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
                <label className={styles.label}>allowOverride (forzar valor)</label>
                <input
                  type="checkbox"
                  checked={!!field.allowOverride}
                  onChange={(e) => onChange({ ...field, allowOverride: e.target.checked })}
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
              <div className={styles.switchRow}>
                <label className={styles.label}>readOnly</label>
                <input
                  type="checkbox"
                  checked={!!field.readOnly}
                  onChange={(e) => onChange({ ...field, readOnly: e.target.checked })}
                  disabled={readOnly}
                />
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
                <div>
                  <label className={styles.label}>ref.hasStyle (aplica estilo en tablas con campos icon y color)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!field.ref?.hasStyle}
                      onChange={(e) =>
                        onChange({
                          ...field,
                          ref: {
                            ...(field.ref || { moduleSlug: "", displayField: "" }),
                            hasStyle: e.target.checked,
                          },
                        })
                      }
                      disabled={readOnly}
                    />
                    <span style={{ fontSize: 13, opacity: 0.85 }}>Tiene estilo</span>
                  </div>
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
             <div className={styles.card} style={{ marginTop: 12 }}>
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
              <div>
                <label className={styles.label}>ref.route (tabla destino)</label>
                <input
                  className={styles.input}
                  value={field.ref?.route || ""}
                  onChange={(e) =>
                    onChange({
                      ...field,
                      ref: { ...(field.ref || {}), route: e.target.value },
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
                  rows={6}
                  value={whereText}
                  placeholder={`[
                  { "field": "obraId", "op": "=", "value": "{{id}}" }
                ]`}
                  onChange={(e) => {
                    const next = e.target.value;
                    setWhereText(next);

                    // Si el usuario lo deja válido mientras escribe, lo aplicamos al vuelo.
                    // Si no, no rompemos el estado del campo: solo mostramos error.
                    commitWhereIfValid(next);
                  }}
                  onBlur={() => {
                    // En blur, intentamos consolidar (por si quedó medio escrito)
                    commitWhereIfValid(whereText);
                  }}
                  spellCheck={false}
                  disabled={readOnly}
                />

                <div className={styles.hint} style={{ marginTop: 6 }}>
                  
                  Ejemplo referencia formulario actual: <code>{"{{id}}"}</code>, <code>{"{{obraId}}"}</code>, <code>{"{{clienteId}}"}</code>.
                  Ejemplo consulta: <code>{ '[{"op": "=",'+
                          ' "field": "task",'+
                          '"value": "{{id}}"}]'
                            
                          
                          }
                          </code>
                  
                </div>

                {whereErr && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#b42318" }}>
                    {whereErr}
                  </div>
                )}


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
  onSave,
}: {
  initialData: any;
  mode: "view" | "edit" | "create";
  onSave: (fd: FormData) => Promise<{ ok: boolean; detail: string; id?: string }>;
}) {
  const [pending, start] = useTransition();
  const readOnly = mode === "view";

  const [nombre, setNombre] = useState(initialData?.nombre ?? "");
  const [route, setRoute] = useState(initialData?.route ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [tipo, setTipo] = useState(initialData?.tipo ?? "tabla");
  const [orden, setOrden] = useState<number>(initialData?.orden ?? 0);
  const [activo, setActivo] = useState<boolean>(!!initialData?.activo);
  const [sidebar, setSidebar] = useState<boolean>(!!initialData?.sidebar);
  const [parentId, setParentId] = useState<string | null>(initialData?.parent_id ?? null);

  // =========================
  // propsObj parse + migración (legacy ui.formSections -> tabs[firstForm].config.formSections)
  // =========================
  const [propsObj, setPropsObj] = useState<ModuleSchema>(() => {
    const base: ModuleSchema = {
      db: { table: "", softDelete: false },
      fields: [],
      ui: { icon: "", color: "#2b2b2b", sidebar: false, tabs: [] },
    };

    const raw = initialData?.props;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw || {};
      const next: ModuleSchema = {
        db: { ...base.db, ...(parsed.db || {}) },
        fields: Array.isArray(parsed.fields) ? (parsed.fields as Field[]) : [],
        ui: { ...base.ui, ...(parsed.ui || {}) },
      };

      // Migración suave (por si había ui.formSections en DB antigua)
      const uiAny = (next.ui || {}) as any;
      const legacyGlobal: FormSection[] = Array.isArray(uiAny.formSections) ? uiAny.formSections : [];
      const tabs: UiTab[] = Array.isArray(uiAny.tabs) ? uiAny.tabs : [];

      if (tabs.length > 0 && legacyGlobal.length > 0) {
        const hasAny = tabs.some((t) => t.type === "form" && Array.isArray(t.config?.formSections));
        if (!hasAny) {
          const firstFormIdx = tabs.findIndex((t) => t.type === "form");
          if (firstFormIdx !== -1) {
            const copy = [...tabs];
            const first = copy[firstFormIdx];
            copy[firstFormIdx] = {
              id: first.id,
              label: first.label,
              type: "form",
              config: { formSections: legacyGlobal },
            };
            next.ui = { ...(next.ui || {}), tabs: copy };
          }
        }
      }

      return next;
    } catch {
      return base;
    }
  });

  // JSON avanzado (opcional)
  const [showRaw, setShowRaw] = useState(false);
  const [rawText, setRawText] = useState(() => JSON.stringify(propsObj, null, 2));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // =========================
  // Tabs helpers
  // =========================
  const getTabs = (): UiTab[] => {
    const uiAny = (propsObj.ui || {}) as any;
    return Array.isArray(uiAny.tabs) ? (uiAny.tabs as UiTab[]) : [];
  };

  const setTabs = (tabs: UiTab[]) => {
    const ui = { ...(propsObj.ui || {}), tabs };
    const next = { ...propsObj, ui };
    setPropsObj(next);
    setRawText(JSON.stringify(next, null, 2));
  };

  // =========================
  // FormSections por pestaña
  // =========================
  const getTabFormSections = (tab: UiTab): FormSection[] => {
    if (!tab || tab.type !== "form") return [];
    return Array.isArray(tab.config?.formSections) ? tab.config!.formSections! : [];
  };

  const setTabFormSections = (tabIndex: number, sections: FormSection[]) => {
    const tabs = getTabs();
    const tab = tabs[tabIndex];
    if (!tab || tab.type !== "form") return;

    const next = [...tabs];
    next[tabIndex] = {
      ...tab,
      config: { ...(tab.config || {}), formSections: sections },
    };
    setTabs(next);
  };

  const addSectionToTab = (tabIndex: number) => {
    const tabs = getTabs();
    const tab = tabs[tabIndex];
    if (!tab || tab.type !== "form") return;

    const sections = getTabFormSections(tab);
    const index = sections.length + 1;

    const newSection: FormSection = {
      id: `section_${index}`,
      label: `Sección ${index}`,
      description: "",
      fields: [],
    };

    setTabFormSections(tabIndex, [...sections, newSection]);
  };

  const updateTabSection = (tabIndex: number, sectionIndex: number, patch: Partial<FormSection>) => {
    const tabs = getTabs();
    const tab = tabs[tabIndex];
    if (!tab || tab.type !== "form") return;

    const sections = getTabFormSections(tab);
    if (!sections[sectionIndex]) return;

    const next = [...sections];
    next[sectionIndex] = { ...next[sectionIndex], ...patch };
    setTabFormSections(tabIndex, next);
  };

  const removeTabSection = (tabIndex: number, sectionIndex: number) => {
    const tabs = getTabs();
    const tab = tabs[tabIndex];
    if (!tab || tab.type !== "form") return;

    const sections = getTabFormSections(tab);
    setTabFormSections(tabIndex, sections.filter((_, i) => i !== sectionIndex));
  };

  const moveTabSection = (tabIndex: number, sectionIndex: number, dir: -1 | 1) => {
    const tabs = getTabs();
    const tab = tabs[tabIndex];
    if (!tab || tab.type !== "form") return;

    const sections = [...getTabFormSections(tab)];
    const nextIndex = sectionIndex + dir;
    if (nextIndex < 0 || nextIndex >= sections.length) return;

    const copy = [...sections];
    const [item] = copy.splice(sectionIndex, 1);
    copy.splice(nextIndex, 0, item);

    setTabFormSections(tabIndex, copy);
  };

  // =========================
  // Fields helpers (globales del módulo)
  // =========================
  const updateField = (idx: number, patch: Field) => {
    const nextFields = [...propsObj.fields];
    nextFields[idx] = patch;
    const nextObj = { ...propsObj, fields: nextFields };
    setPropsObj(nextObj);
    setRawText(JSON.stringify(nextObj, null, 2));
  };

  const removeField = (idx: number) => {
    const nextFields = propsObj.fields.filter((_, i) => i !== idx);
    const nextObj = { ...propsObj, fields: nextFields };
    setPropsObj(nextObj);
    setRawText(JSON.stringify(nextObj, null, 2));
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    const next = [...propsObj.fields];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    const nextObj = { ...propsObj, fields: next };
    setPropsObj(nextObj);
    setRawText(JSON.stringify(nextObj, null, 2));
  };

  const addField = () => {
    const base: Field = {
      name: `campo_${propsObj.fields.length + 1}`,
      label: "Nuevo campo",
      type: "text",
    } as Field;

    const next = [...propsObj.fields, base];
    const nextObj = { ...propsObj, fields: next };
    setPropsObj(nextObj);
    setRawText(JSON.stringify(nextObj, null, 2));
  };

  // =========================
  // Open/close secciones (clave compuesta)
  // =========================
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const isSectionOpen = (key: string) => !!openSections[key];
  const toggleSectionOpen = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // =========================
  // Submit
  // =========================
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

    toSave = { ...toSave, ui: { ...(toSave.ui || {}), sidebar } };

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

      const res = await onSave(fd);
      setMsg({ ok: res.ok, text: res.detail });
    });
  };

  const readOnlyAttr = { disabled: readOnly } as const;

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      {/* Cabecera */}
      <div className={styles.card}>
        <div className={styles.grid}>
          <div>
            <label className={styles.label}>Nombre</label>
            <input
              className={styles.input}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              {...readOnlyAttr}
            />
          </div>

          <div>
            <label className={styles.label}>Slug/Xml</label>
            <input
              className={styles.input}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              {...readOnlyAttr}
            />
          </div>

          <div>
            <label className={styles.label}>Tipo</label>
            <select
              className={styles.input}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              {...readOnlyAttr}
            >
              <option value="carpeta">carpeta</option>
              <option value="tabla">tabla</option>
              <option value="subtabla">subtabla</option>
              <option value="vista">vista</option>
            </select>
          </div>
        </div>

        <div>
          <label className={styles.label}>Orden</label>
          <input
            type="number"
            className={styles.input}
            value={orden}
            onChange={(e) => setOrden(Number(e.target.value))}
            {...readOnlyAttr}
          />
        </div>

        <div>
          <label className={styles.label}>Ruta (route)</label>
          <input
            className={styles.input}
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            {...readOnlyAttr}
          />
        </div>

        <div className={styles.switchRow}>
          <label className={styles.label}>Activo</label>
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            {...readOnlyAttr}
          />
        </div>

        <div className={styles.switchRow}>
          <label className={styles.label}>Sidebar</label>
          <input
            type="checkbox"
            checked={sidebar}
            onChange={(e) => setSidebar(e.target.checked)}
            {...readOnlyAttr}
          />
        </div>

        <div>
          <label className={styles.label}>Parent ID (opcional)</label>
          <input
            className={styles.input}
            value={parentId ?? ""}
            onChange={(e) => setParentId(e.target.value || null)}
            {...readOnlyAttr}
          />
        </div>
      </div>

      {/* DB */}
      <Section title="Sección: DB">
        <div className={styles.grid}>
          <div>
            <label className={styles.label}>db.table</label>
            <input
              className={styles.input}
              value={propsObj.db.table}
              onChange={(e) => {
                const db = { ...propsObj.db, table: e.target.value };
                const next = { ...propsObj, db };
                setPropsObj(next);
                setRawText(JSON.stringify(next, null, 2));
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
                const next = { ...propsObj, db };
                setPropsObj(next);
                setRawText(JSON.stringify(next, null, 2));
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
                const next = { ...propsObj, db };
                setPropsObj(next);
                setRawText(JSON.stringify(next, null, 2));
              }}
              {...readOnlyAttr}
            />
          </div>
        </div>
      </Section>

      {/* UI */}
      <Section title="Sección: UI">
        <div className={styles.grid}>
          <div>
            <input
              type="color"
              className={styles.color}
              value={propsObj.ui?.color || "#2b2b2b"}
              onChange={(e) => {
                const ui = { ...(propsObj.ui || {}), color: e.target.value };
                const next = { ...propsObj, ui };
                setPropsObj(next);
                setRawText(JSON.stringify(next, null, 2));
              }}
              {...readOnlyAttr}
              style={{ padding: 0, height: 42 }}
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className={styles.label}>ui.icon</label>
            <IconPicker
              value={propsObj.ui?.icon}
              onChange={(icon: string) => {
                const ui = { ...(propsObj.ui || {}), icon };
                const next = { ...propsObj, ui };
                setPropsObj(next);
                setRawText(JSON.stringify(next, null, 2));
              }}
            />
          </div>
        </div>
      </Section>

      {/* Pestañas / Vistas */}
      <Section title="Pestañas / Vistas">
        <div className={styles.actionsRow} style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              const tabs = getTabs();
              const n = tabs.length + 1;
              setTabs([
                ...tabs,
                { id: `tab_${n}`, label: `Pestaña ${n}`, type: "form", config: { formSections: [] } },
              ]);
            }}
            disabled={readOnly}
          >
            + Añadir pestaña
          </button>
        </div>

        {getTabs().length === 0 && (
          <div className={styles.hint}>
            Si no defines pestañas, (de momento) no se renderiza editor por pestaña.
            Añade una pestaña tipo <b>form</b>.
          </div>
        )}

        {getTabs().map((t, idx) => {
          const tabs = getTabs();

          // ✅ Evita contaminar el union: actualiza con updater
          const updateTab = (updater: (prev: UiTab) => UiTab) => {
            const nextTabs = [...tabs];
            nextTabs[idx] = updater(nextTabs[idx]);
            setTabs(nextTabs);
          };

          const removeTab = () => setTabs(tabs.filter((_, i) => i !== idx));

          return (
            <div key={t.id} className={styles.card} style={{ marginTop: 12 }}>
              <div className={styles.grid}>
                <div>
                  <label className={styles.label}>ID</label>
                  <input
                    className={styles.input}
                    value={t.id}
                    onChange={(e) => updateTab((prev) => ({ ...prev, id: e.target.value }))}
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <label className={styles.label}>Label</label>
                  <input
                    className={styles.input}
                    value={t.label}
                    onChange={(e) => updateTab((prev) => ({ ...prev, label: e.target.value }))}
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <label className={styles.label}>Tipo</label>
                  <select
                    className={styles.input}
                    value={t.type}
                    onChange={(e) => {
                      const nextType = e.target.value as UiTab["type"];

                      // ✅ REEMPLAZA el tab completo al cambiar type (evita el error TS)
                      updateTab((prev) => {
                        if (nextType === "form") {
                          const keepSections =
                            prev.type === "form" ? prev.config?.formSections ?? [] : [];
                          return {
                            id: prev.id,
                            label: prev.label,
                            type: "form",
                            config: { formSections: keepSections },
                          };
                        }

                        if (nextType === "treeview") {
                          return {
                            id: prev.id,
                            label: prev.label,
                            type: "treeview",
                            config: { sourceTable: "", groupBy: [], columns: [] },
                          };
                        }

                        // calendar
                        return {
                          id: prev.id,
                          label: prev.label,
                          type: "calendar",
                          config: {
                            sourceTable: "",
                            startField: "",
                            endField: "",
                            titleField: "",
                            colorField: "",
                          },
                        };
                      });
                    }}
                    disabled={readOnly}
                  >
                    <option value="form">form</option>
                    <option value="treeview">treeview</option>
                    <option value="calendar">calendar</option>
                  </select>
                </div>
              </div>

              {/* Config TreeView */}
              {t.type === "treeview" && (
                <div className={styles.card} style={{ marginTop: 12 }}>
                  <h4 style={{ marginTop: 0 }}>Config TreeView</h4>
                  <div className={styles.grid}>
                    <div>
                      <label className={styles.label}>Tabla destino (sourceTable)</label>
                      <input
                        className={styles.input}
                        value={t.config?.sourceTable || ""}
                        onChange={(e) =>
                          updateTab((prev) => {
                            if (prev.type !== "treeview") return prev;
                            return {
                              ...prev,
                              config: { ...(prev.config || {}), sourceTable: e.target.value },
                            };
                          })
                        }
                        disabled={readOnly}
                      />
                    </div>

                    <div>
                      <label className={styles.label}>groupBy (coma)</label>
                      <input
                        className={styles.input}
                        value={(t.config?.groupBy || []).join(",")}
                        onChange={(e) =>
                          updateTab((prev) => {
                            if (prev.type !== "treeview") return prev;
                            return {
                              ...prev,
                              config: {
                                ...(prev.config || {}),
                                groupBy: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              },
                            };
                          })
                        }
                        disabled={readOnly}
                      />
                    </div>

                    <div>
                      <label className={styles.label}>columns (coma)</label>
                      <input
                        className={styles.input}
                        value={(t.config?.columns || []).join(",")}
                        onChange={(e) =>
                          updateTab((prev) => {
                            if (prev.type !== "treeview") return prev;
                            return {
                              ...prev,
                              config: {
                                ...(prev.config || {}),
                                columns: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              },
                            };
                          })
                        }
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Config Calendario */}
              {t.type === "calendar" && (
                <div className={styles.card} style={{ marginTop: 12 }}>
                  <h4 style={{ marginTop: 0 }}>Config Calendario</h4>
                  <div className={styles.grid}>
                    <div>
                      <label className={styles.label}>Tabla (sourceTable)</label>
                      <input
                        className={styles.input}
                        value={t.config?.sourceTable || ""}
                        onChange={(e) =>
                          updateTab((prev) => {
                            if (prev.type !== "calendar") return prev;
                            return { ...prev, config: { ...(prev.config || {}), sourceTable: e.target.value } };
                          })
                        }
                        disabled={readOnly}
                      />
                    </div>

                    <div>
                      <label className={styles.label}>startField</label>
                      <input
                        className={styles.input}
                        value={t.config?.startField || ""}
                        onChange={(e) =>
                          updateTab((prev) => {
                            if (prev.type !== "calendar") return prev;
                            return { ...prev, config: { ...(prev.config || {}), startField: e.target.value } };
                          })
                        }
                        disabled={readOnly}
                      />
                    </div>

                    <div>
                      <label className={styles.label}>endField</label>
                      <input
                        className={styles.input}
                        value={t.config?.endField || ""}
                        onChange={(e) =>
                          updateTab((prev) => {
                            if (prev.type !== "calendar") return prev;
                            return { ...prev, config: { ...(prev.config || {}), endField: e.target.value } };
                          })
                        }
                        disabled={readOnly}
                      />
                    </div>

                    <div>
                      <label className={styles.label}>titleField</label>
                      <input
                        className={styles.input}
                        value={t.config?.titleField || ""}
                        onChange={(e) =>
                          updateTab((prev) => {
                            if (prev.type !== "calendar") return prev;
                            return { ...prev, config: { ...(prev.config || {}), titleField: e.target.value } };
                          })
                        }
                        disabled={readOnly}
                      />
                    </div>

                    <div>
                      <label className={styles.label}>colorField</label>
                      <input
                        className={styles.input}
                        value={t.config?.colorField || ""}
                        onChange={(e) =>
                          updateTab((prev) => {
                            if (prev.type !== "calendar") return prev;
                            return { ...prev, config: { ...(prev.config || {}), colorField: e.target.value } };
                          })
                        }
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ✅ Formulario por pestaña */}
              {t.type === "form" && (
                <div className={styles.card} style={{ marginTop: 12 }}>
                  <h4 style={{ marginTop: 0 }}>Formulario (pestaña: {t.label})</h4>

                  <div className={styles.actionsRow} style={{ justifyContent: "space-between", gap: 12 }}>
                    <button type="button" className={styles.btnAdd} onClick={addField} disabled={readOnly}>
                      + Añadir campo (global)
                    </button>

                    <button
                      type="button"
                      className={styles.btnAdd}
                      onClick={() => addSectionToTab(idx)}
                      disabled={readOnly}
                    >
                      + Añadir sección (esta pestaña)
                    </button>
                  </div>

                  {propsObj.fields.length === 0 && getTabFormSections(t).length === 0 && (
                    <div className={styles.hint}>
                      Aún no hay campos ni secciones en esta pestaña.
                    </div>
                  )}

                  {getTabFormSections(t).map((section, sIdx) => {
                    const allFieldNames = propsObj.fields.map((f) => f.name);
                    const fieldsInSection = propsObj.fields.filter((f) => (section.fields || []).includes(f.name));
                    const openKey = `${t.id}__${section.id}`;

                    return (
                      <div key={section.id} className={styles.sectionRow}>
                        <div className={styles.sectionHeader}>
                          <button
                            type="button"
                            className={styles.sectionToggle}
                            onClick={() => toggleSectionOpen(openKey)}
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
                                {section.description.length > 80
                                  ? section.description.slice(0, 80) + "…"
                                  : section.description}
                              </div>
                            ) : null}
                          </button>

                          <div className={styles.sectionActions}>
                            <button
                              type="button"
                              className={styles.iconBtn}
                              onClick={() => moveTabSection(idx, sIdx, -1)}
                              disabled={readOnly || sIdx === 0}
                              title="Subir sección"
                            >
                              ↑
                            </button>

                            <button
                              type="button"
                              className={styles.iconBtn}
                              onClick={() => moveTabSection(idx, sIdx, +1)}
                              disabled={readOnly || sIdx === getTabFormSections(t).length - 1}
                              title="Bajar sección"
                            >
                              ↓
                            </button>

                            <button
                              type="button"
                              className={styles.dangerBtn}
                              onClick={() => removeTabSection(idx, sIdx)}
                              disabled={readOnly}
                              title="Eliminar sección"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>

                        {isSectionOpen(openKey) && (
                          <div className={styles.sectionBody}>
                            <div className={styles.grid}>
                              <div>
                                <label className={styles.label}>Label sección</label>
                                <input
                                  className={styles.input}
                                  value={section.label}
                                  onChange={(e) => updateTabSection(idx, sIdx, { label: e.target.value })}
                                  disabled={readOnly}
                                />
                              </div>

                              <div>
                                <label className={styles.label}>ID</label>
                                <input
                                  className={styles.input}
                                  value={section.id}
                                  onChange={(e) =>
                                    updateTabSection(idx, sIdx, {
                                      id: e.target.value || `section_${sIdx + 1}`,
                                    })
                                  }
                                  disabled={readOnly}
                                />
                              </div>
                            </div>

                            <div>
                              <label className={styles.label}>Descripción</label>
                              <input
                                className={styles.input}
                                value={section.description || ""}
                                onChange={(e) => updateTabSection(idx, sIdx, { description: e.target.value })}
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
                                  const selected = Array.from(e.currentTarget.selectedOptions).map(
                                    (opt) => opt.value
                                  );
                                  updateTabSection(idx, sIdx, { fields: selected });
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

                            <div style={{ marginTop: 14 }}>
                              {fieldsInSection.length === 0 ? (
                                <div className={styles.hint}>No hay campos asignados a esta sección.</div>
                              ) : (
                                fieldsInSection.map((f) => {
                                  const fieldIdx = propsObj.fields.findIndex((x) => x.name === f.name);
                                  if (fieldIdx === -1) return null;

                                  return (
                                    <FieldRow
                                      key={fieldIdx}
                                      field={propsObj.fields[fieldIdx]}
                                      onChange={(patch: Field) => updateField(fieldIdx, patch)}
                                      onRemove={() => removeField(fieldIdx)}
                                      onMoveUp={() => moveField(fieldIdx, -1)}
                                      onMoveDown={() => moveField(fieldIdx, +1)}
                                      canUp={fieldIdx > 0}
                                      canDown={fieldIdx < propsObj.fields.length - 1}
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

                  {/* Campos sin sección (esta pestaña) */}
                  {(() => {
                    const sections = getTabFormSections(t);
                    const inSections = getSectionFieldSet(sections);
                    const unassigned = propsObj.fields
                      .map((f, idx2) => ({ f, idx2 }))
                      .filter(({ f }) => !inSections.has(f.name));

                    if (unassigned.length === 0) return null;

                    return (
                      <div className={styles.sectionRow} style={{ marginTop: 12 }}>
                        <div className={styles.sectionHeader}>
                          <div className={styles.sectionTitleLine}>
                            <span className={styles.sectionTitle}>Campos sin sección (esta pestaña)</span>
                            <span className={styles.sectionMeta}>
                              <span className={styles.badgeSoft}>{unassigned.length} campos</span>
                            </span>
                          </div>
                        </div>

                        <div className={styles.sectionBody}>
                          {unassigned.map(({ idx2 }) => (
                            <FieldRow
                              key={idx2}
                              field={propsObj.fields[idx2]}
                              onChange={(patch: Field) => updateField(idx2, patch)}
                              onRemove={() => removeField(idx2)}
                              onMoveUp={() => moveField(idx2, -1)}
                              onMoveDown={() => moveField(idx2, +1)}
                              canUp={idx2 > 0}
                              canDown={idx2 < propsObj.fields.length - 1}
                              readOnly={readOnly}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className={styles.actionsRow} style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={removeTab}
                  disabled={readOnly}
                  style={{ background: "#fc0505ff", borderColor: "#ffb3b3" }}
                >
                  Eliminar pestaña
                </button>
              </div>
            </div>
          );
        })}
      </Section>

      {/* JSON avanzado */}
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
          <a className={styles.btn} href={`?edit=true`}>
            Editar
          </a>
        ) : (
          <button type="submit" disabled={pending} className={styles.btn}>
            {msg ? (msg.ok ? "Guardado" : "Guardando...") : "Guardar"}
          </button>
        )}

        <a className={styles.btn} href="/system/modulos">
          ← Volver
        </a>

        {msg && <span className={msg.ok ? styles.msgOk : styles.msgErr}>{msg.text}</span>}
      </div>
    </form>
  );
}


