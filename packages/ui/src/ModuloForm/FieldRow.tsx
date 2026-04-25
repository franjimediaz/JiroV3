import { useState, useEffect } from "react";
import styles from "./modulo-detalle.module.css";
import  Selector from "../Selector";
import type {
  Field as FieldSchema,
  FieldType,
  Field,
  Appareance,
  Compute,
  VisibilityConfig,
  VisibilityOperator,
  VisibilityRule,
} from "@repo/types";
import {VALID_FIELD_TYPES,Appareance_Valid_Types} from "@repo/types";
import { FieldPickerModal} from "../modals/FieldPickerModal";
import SelectorTableFiltersBuilder from "./SelectorTableFiltersBuilder";

type RefPickCtx = null | { kind: "refDisplayField" };

const visibilityOperators: VisibilityOperator[] = [
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "contains",
  "notContains",
  "empty",
  "notEmpty",
];

const emptyVisibilityRule: VisibilityRule = {
  source: "currentRecord",
  field: "",
  op: "=",
  value: "",
};

function ensureVisibilityConfig(field: FieldSchema): VisibilityConfig {
  const current = (field as any).visibility;
  return {
    enabled: !!current?.enabled,
    mode: current?.mode === "hide" ? "hide" : "show",
    logic: current?.logic === "OR" ? "OR" : "AND",
    rules: Array.isArray(current?.rules) ? current.rules : [],
  };
}

function parseRuleValue(raw: string): any {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return raw;
}

function formatRuleValue(value: any): string {
  if (value === undefined || value === null) return value === null ? "null" : "";
  if (typeof value === "string") return value;
  return String(value);
}

function getRelatedModuleSlug(rule: VisibilityRule, fields: Array<{ name: string; type?: string; ref?: any }>) {
  if (rule.relatedModuleSlug) return rule.relatedModuleSlug;
  const relationField = fields.find((candidate) => candidate.name === rule.relationField);
  return relationField?.ref?.moduleSlug || "";
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

function VisibilityConfigEditor({
  field,
  allFields,
  fieldsByTable,
  loadingByTable,
  ensureFieldsLoaded,
  readOnly,
  onChange,
}: {
  field: FieldSchema;
  allFields: FieldSchema[];
  fieldsByTable: Record<string, { name: string; label?: string }[]>;
  loadingByTable: Record<string, boolean>;
  ensureFieldsLoaded: (tableSlug: string) => void;
  readOnly?: boolean;
  onChange: (field: FieldSchema) => void;
}) {
  const visibility = ensureVisibilityConfig(field);
  const relationFields = allFields.filter((candidate) => candidate.type === "selectorTabla");

  const updateVisibility = (next: VisibilityConfig) => {
    onChange({ ...field, visibility: next });
  };

  const updateRule = (index: number, nextRule: VisibilityRule) => {
    updateVisibility({
      ...visibility,
      rules: visibility.rules.map((rule, ruleIndex) => (ruleIndex === index ? nextRule : rule)),
    });
  };

  const removeRule = (index: number) => {
    updateVisibility({
      ...visibility,
      rules: visibility.rules.filter((_, ruleIndex) => ruleIndex !== index),
    });
  };

  return (
    <div className={styles.card} style={{ marginTop: 12 }}>
      <h4 style={{ marginTop: 0 }}>Visibilidad condicional</h4>

      <div className={styles.grid}>
        <div className={styles.switchRow}>
          <label className={styles.label}>Activar reglas</label>
          <input
            type="checkbox"
            checked={visibility.enabled}
            onChange={(event) => updateVisibility({ ...visibility, enabled: event.target.checked })}
            disabled={readOnly}
          />
        </div>

        <div>
          <label className={styles.label}>Modo</label>
          <select
            className={styles.input}
            value={visibility.mode || "show"}
            onChange={(event) => updateVisibility({ ...visibility, mode: event.target.value as "show" | "hide" })}
            disabled={readOnly || !visibility.enabled}
          >
            <option value="show">Mostrar campo cuando se cumplan reglas</option>
            <option value="hide">Ocultar campo cuando se cumplan reglas</option>
          </select>
        </div>

        <div>
          <label className={styles.label}>Lógica</label>
          <select
            className={styles.input}
            value={visibility.logic || "AND"}
            onChange={(event) => updateVisibility({ ...visibility, logic: event.target.value as "AND" | "OR" })}
            disabled={readOnly || !visibility.enabled}
          >
            <option value="AND">Todas las condiciones (AND)</option>
            <option value="OR">Cualquier condición (OR)</option>
          </select>
        </div>
      </div>

      {visibility.enabled && (
        <div className="d-flex flex-column gap-2">
          {visibility.rules.map((rule, index) => (
            <VisibilityRuleEditor
              key={index}
              rule={rule}
              allFields={allFields}
              relationFields={relationFields}
              fieldsByTable={fieldsByTable}
              loadingByTable={loadingByTable}
              ensureFieldsLoaded={ensureFieldsLoaded}
              readOnly={readOnly}
              onChange={(nextRule) => updateRule(index, nextRule)}
              onRemove={() => removeRule(index)}
            />
          ))}

          <button
            type="button"
            className={styles.btnAdd}
            onClick={() => updateVisibility({ ...visibility, rules: [...visibility.rules, { ...emptyVisibilityRule }] })}
            disabled={readOnly}
          >
            Añadir regla
          </button>
        </div>
      )}
    </div>
  );
}

function VisibilityRuleEditor({
  rule,
  allFields,
  relationFields,
  fieldsByTable,
  loadingByTable,
  ensureFieldsLoaded,
  readOnly,
  onChange,
  onRemove,
}: {
  rule: VisibilityRule;
  allFields: FieldSchema[];
  relationFields: FieldSchema[];
  fieldsByTable: Record<string, { name: string; label?: string }[]>;
  loadingByTable: Record<string, boolean>;
  ensureFieldsLoaded: (tableSlug: string) => void;
  readOnly?: boolean;
  onChange: (rule: VisibilityRule) => void;
  onRemove: () => void;
}) {
  const relatedModuleSlug = getRelatedModuleSlug(rule, allFields as any);
  const relatedFields = relatedModuleSlug ? fieldsByTable[relatedModuleSlug] || [] : [];

  useEffect(() => {
    if (rule.source !== "relatedRecord" || !relatedModuleSlug) return;
    ensureFieldsLoaded(relatedModuleSlug);
  }, [rule.source, relatedModuleSlug, ensureFieldsLoaded]);

  const setSource = (source: VisibilityRule["source"]) => {
    if (source === "currentRecord") {
      onChange({
        source,
        field: rule.field || "",
        op: rule.op || "=",
        value: rule.value ?? "",
      });
      return;
    }

    const relationField = rule.relationField || relationFields[0]?.name || "";
    const moduleSlug = getRelatedModuleSlug({ ...rule, relationField }, allFields as any);
    onChange({
      source,
      field: "",
      relationField,
      relatedModuleSlug: rule.relatedModuleSlug || moduleSlug || undefined,
      relatedField: rule.relatedField || "",
      op: rule.op || "=",
      value: rule.value ?? "",
    });
  };

  return (
    <div className={styles.card}>
      <div className={styles.grid}>
        <div>
          <label className={styles.label}>Origen</label>
          <select
            className={styles.input}
            value={rule.source}
            onChange={(event) => setSource(event.target.value as VisibilityRule["source"])}
            disabled={readOnly}
          >
            <option value="currentRecord">Campo del formulario actual</option>
            <option value="relatedRecord">Registro relacionado</option>
          </select>
        </div>

        {rule.source === "currentRecord" ? (
          <div>
            <label className={styles.label}>Campo</label>
            <select
              className={styles.input}
              value={rule.field || ""}
              onChange={(event) => onChange({ ...rule, field: event.target.value })}
              disabled={readOnly}
            >
              <option value="">Seleccionar campo</option>
              {allFields.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>
                  {candidate.label || candidate.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div>
              <label className={styles.label}>Campo relación</label>
              <select
                className={styles.input}
                value={rule.relationField || ""}
                onChange={(event) => {
                  const relationField = event.target.value;
                  const nextModuleSlug = getRelatedModuleSlug({ ...rule, relationField }, allFields as any);
                  onChange({
                    ...rule,
                    relationField,
                    relatedModuleSlug: nextModuleSlug || undefined,
                    relatedField: "",
                  });
                }}
                disabled={readOnly}
              >
                <option value="">Seleccionar relación</option>
                {relationFields.map((candidate) => (
                  <option key={candidate.name} value={candidate.name}>
                    {candidate.label || candidate.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={styles.label}>Módulo relacionado</label>
              <input
                className={styles.input}
                value={rule.relatedModuleSlug || relatedModuleSlug}
                onChange={(event) => onChange({ ...rule, relatedModuleSlug: event.target.value || undefined })}
                placeholder="Deducido desde ref.moduleSlug"
                disabled={readOnly}
              />
              {relatedModuleSlug && !rule.relatedModuleSlug && (
                <div className={styles.hint} style={{ marginTop: 4 }}>
                  Deducido desde el selector: {relatedModuleSlug}
                </div>
              )}
            </div>

            <div>
              <label className={styles.label}>Campo relacionado</label>
              {relatedFields.length > 0 ? (
                <select
                  className={styles.input}
                  value={rule.relatedField || ""}
                  onChange={(event) => onChange({ ...rule, relatedField: event.target.value })}
                  disabled={readOnly}
                >
                  <option value="">Seleccionar campo</option>
                  {relatedFields.map((candidate) => (
                    <option key={candidate.name} value={candidate.name}>
                      {candidate.label || candidate.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={styles.input}
                  value={rule.relatedField || ""}
                  onChange={(event) => onChange({ ...rule, relatedField: event.target.value })}
                  placeholder={loadingByTable[relatedModuleSlug] ? "Cargando campos..." : "Ej: tipoCliente"}
                  disabled={readOnly}
                />
              )}
            </div>
          </>
        )}

        <div>
          <label className={styles.label}>Operador</label>
          <select
            className={styles.input}
            value={rule.op}
            onChange={(event) => onChange({ ...rule, op: event.target.value as VisibilityOperator })}
            disabled={readOnly}
          >
            {visibilityOperators.map((operator) => (
              <option key={operator} value={operator}>
                {operator}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={styles.label}>Valor</label>
          <input
            className={styles.input}
            value={formatRuleValue(rule.value)}
            onChange={(event) => onChange({ ...rule, value: parseRuleValue(event.target.value) })}
            disabled={readOnly || rule.op === "empty" || rule.op === "notEmpty"}
            placeholder={rule.op === "empty" || rule.op === "notEmpty" ? "No aplica" : "true, empresa, 10..."}
          />
        </div>

        <div className={styles.switchRow}>
          <button type="button" className={styles.btnDel} onClick={onRemove} disabled={readOnly}>
            Eliminar regla
          </button>
        </div>
      </div>
    </div>
  );
}


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
function getLabelForFieldName(
  fields: { name: string; label?: string }[],
  name: string
) {
  if (!name) return "";
  return fields.find((f) => f.name === name)?.label || name;
}



export function FieldRow({
  field,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canUp,
  canDown,
  readOnly,
  fieldsByTable,
  loadingByTable,
  ensureFieldsLoaded,
  currentFields,
}: {
  field: FieldSchema;
  onChange: (f: FieldSchema) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canUp: boolean;
  canDown: boolean;
  readOnly?: boolean;
  fieldsByTable: Record<string, { name: string; label?: string }[]>;
  loadingByTable: Record<string, boolean>;
  ensureFieldsLoaded: (tableSlug: string) => void;
  currentFields: FieldSchema[];
}) {
  
  const [open, setOpen] = useState(false);

  const summaryLabel = field.label?.trim() || "Sin label";
  const summaryName = field.name?.trim() || "sin_name";
  const summaryType = field.type || "text";
  const summaryCompute = getComputeKind(field);
  const [refPickCtx, setRefPickCtx] = useState<RefPickCtx>(null);
  const selectorModuleSlug = field.type === "selectorTabla" ? field.ref?.moduleSlug || "" : "";
  
  

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

useEffect(() => {
  if (!open) return;
  if (!selectorModuleSlug) return;
  ensureFieldsLoaded(selectorModuleSlug);
}, [open, selectorModuleSlug, ensureFieldsLoaded]);

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

      {/* ========= DETALLE PLEGABLE ========= */}
      {open && (
        <>
          {/* BLOQUE PRINCIPAL (grid 1 + grid 2) */}
          <div className={styles.card} style={{ marginTop: 12 }}>
            {/* ========= OPCIONES GENERALES ========= */}
            <h4 style={{ marginTop: 0 }}>Opciones Generales</h4>
            <div className={styles.grid}>
              {/* Modo de name */}
              <div>
                <label className={styles.label}>name</label>
                <input
                  className={styles.input}
                  value={field.name}
                  onChange={(e) => onChange({ ...field, name: e.target.value })}
                  disabled={readOnly}
                />
              </div>
              {/* Modo de label */}
              <div>
                <label className={styles.label}>label</label>
                <input
                  className={styles.input}
                  value={field.label}
                  onChange={(e) => onChange({ ...field, label: e.target.value })}
                  disabled={readOnly}
                />
              </div>
              {/* Modo de tipo */}
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
              {/* Modo visible */}
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
              {/* Modo appareance */}
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
            {/* Modo placeholder */}
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
                <label className={styles.label}>filter</label>
                <input
                  type="checkbox"
                  checked={!!field.filter}
                  onChange={(e) => onChange({ ...field, filter: e.target.checked })}
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
          <VisibilityConfigEditor
            field={field}
            allFields={currentFields as FieldSchema[]}
            fieldsByTable={fieldsByTable}
            loadingByTable={loadingByTable}
            ensureFieldsLoaded={ensureFieldsLoaded}
            readOnly={readOnly}
            onChange={onChange}
          />
          {/* OPCIONES UI */}
          <div className={styles.card} style={{ marginTop: 12 }}>
            <h4 style={{ marginTop: 0 }}>Opciones UI</h4>
            {/*   WIDTH */}
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
                  <option value="1/4">1/4</option>
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

          {/* ESPECIFICO POR TIPO */}

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

                {(() => {
                  const refModuleSlug = field.ref?.moduleSlug || "";
                  const refDisplayFieldName = field.ref?.displayField || "";

                  const refFields = fieldsByTable[refModuleSlug] || [];
                  const refLoading = !!loadingByTable[refModuleSlug];

                  const refDisplayFieldLabel = getLabelForFieldName(refFields, refDisplayFieldName);

                  return (
                    <div className={styles.grid}>
                      {/* ref.moduleSlug */}
                      <div>
                        <label className={styles.label}>ref.moduleSlug</label>

                        <Selector
                          moduleSlug="modulos"
                          displayField="nombre"
                          valueField="slug"
                          value={refModuleSlug}
                          readOnly={!!readOnly}
                          placeholder="— Seleccionar —"
                          label="Selecciona módulo (tabla)"
                          filters={[
                            { field: "activo", op: "=", value: true },
                            { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] },
                          ]}
                          sort={[{ field: "orden", direction: "asc" }]}
                          onChange={(slugSel: string) => {
                            const nextSlug = slugSel || "";

                            if (nextSlug) ensureFieldsLoaded(nextSlug);

                            onChange({
                              ...field,
                              ref: {
                                ...(field.ref || {}),
                                moduleSlug: nextSlug,
                                displayField: "", // ✅ reset al cambiar tabla
                              },
                            });
                          }}
                        />
                      </div>

                      {/* ref.displayField */}
                      <div>
                        <label className={styles.label}>ref.displayField</label>

                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            className={styles.input}
                            value={refDisplayFieldLabel || ""}
                            readOnly
                            disabled={!!readOnly || !refModuleSlug}
                            placeholder={
                              refModuleSlug ? "— Seleccionar campo —" : "Selecciona primero ref.moduleSlug"
                            }
                          />

                          <button
                            type="button"
                            className="btn btn-outline-light"
                            disabled={!!readOnly || !refModuleSlug}
                            onClick={() => {
                              if (!refModuleSlug) return;
                              ensureFieldsLoaded(refModuleSlug);
                              setRefPickCtx({ kind: "refDisplayField" });
                            }}
                          >
                            Elegir…
                          </button>
                        </div>

                        {refLoading && <div className={styles.help}>Cargando campos…</div>}
                      </div>

                      {/* Modal */}
                      {refPickCtx?.kind === "refDisplayField" && (
                        <FieldPickerModal
                          open={true}
                          title={`Seleccionar displayField (${refModuleSlug})`}
                          multiple={false}
                          value={refDisplayFieldName}
                          fields={refFields}
                          loading={refLoading}
                          onClose={() => setRefPickCtx(null)}
                          onApply={(nextName: string) => {
                            onChange({
                              ...field,
                              ref: {
                                ...(field.ref || {}),
                                moduleSlug: refModuleSlug,
                                displayField: nextName || "",
                              },
                            });
                            setRefPickCtx(null);
                          }}
                        />
                      )}
                    </div>
                  );
                })()}

                {/* Los otros campos ref.* siguen como inputs normales */}
                <div className={styles.grid} style={{ marginTop: 12 }}>
                  <div>
                    <label className={styles.label}>ref.valueField</label>
                    <input
                      className={styles.input}
                      value={field.ref?.valueField || "id"}
                      onChange={(e) =>
                        onChange({
                          ...field,
                          ref: { ...(field.ref || {}), valueField: e.target.value },
                        })
                      }
                      disabled={!!readOnly}
                    />
                  </div>

                  <div>
                    <label className={styles.label}>ref.multiple</label>
                    <input
                      type="checkbox"
                      checked={!!field.ref?.multiple}
                      onChange={(e) =>
                        onChange({
                          ...field,
                          ref: { ...(field.ref || {}), multiple: e.target.checked },
                        })
                      }
                      disabled={!!readOnly}
                    />
                  </div>

                  <div>
                    <label className={styles.label}>ref.hasStyle</label>
                    <input
                      type="checkbox"
                      checked={!!field.ref?.hasStyle}
                      onChange={(e) =>
                        onChange({
                          ...field,
                          ref: { ...(field.ref || {}), hasStyle: e.target.checked },
                        })
                      }
                      disabled={!!readOnly}
                    />
                  </div>
                </div>

                <SelectorTableFiltersBuilder
                  value={field.ref?.filters}
                  readOnly={readOnly}
                  targetModuleSlug={field.ref?.moduleSlug || ""}
                  targetFields={fieldsByTable[field.ref?.moduleSlug || ""] || []}
                  currentFields={currentFields}
                  targetLoading={!!loadingByTable[field.ref?.moduleSlug || ""]}
                  onRequestTargetFields={() => {
                    const slug = field.ref?.moduleSlug || "";
                    if (slug) ensureFieldsLoaded(slug);
                  }}
                  onChange={(filters) =>
                    onChange({
                      ...field,
                      ref: { ...(field.ref || {}), filters },
                    })
                  }
                />

                <div className={styles.card} style={{ marginTop: 12 }}>
                  <label className={styles.label}>ref.filters avanzado (JSON)</label>
                  <textarea
                    className={styles.textarea}
                    rows={6}
                    value={JSON.stringify(field.ref?.filters || { kind: "group", logic: "AND", items: [] }, null, 2)}
                    onChange={(e) => {
                      try {
                        const filters = JSON.parse(e.target.value || "{}");
                        onChange({
                          ...field,
                          ref: { ...(field.ref || {}), filters },
                        });
                      } catch {}
                    }}
                    spellCheck={false}
                    disabled={!!readOnly}
                  />
                  <div className={styles.hint}>
                    Modo avanzado. Tambien acepta arrays legacy como <code>[{"{"}"field":"activo","op":"=","value":true{"}"}]</code>.
                  </div>
                </div>

                <div className={styles.card} style={{ marginTop: 12 }}>
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
                    disabled={!!readOnly}
                  />
                  <div className={styles.hint}>Ej: [{"{"}"field":"created_at","direction":"desc"{""}{"}"}]</div>
                </div>
              </div>
            )}
          
          {field.type === "ReverseLink" && (
             <div className={styles.card} style={{ marginTop: 12 }}>
            <div className={styles.grid}>
              <div>
              <label className={styles.label}>ref.moduleSlug (tabla destino)</label>
                 <Selector
                    moduleSlug="modulos"          
                    displayField="nombre"         
                    valueField="slug"             // lo que se guarda en ref.moduleSlug
                    value={field.ref?.moduleSlug || ""}
                    readOnly={readOnly}
                    placeholder="— Seleccionar módulo —"
                    label="Selecciona el módulo destino"
                    filters={[
                      
                      { field: "activo", op: "=", value: true },
                      { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] },
                    ]}
                    sort={[{ field: "orden", direction: "asc" }]}
                    onChange={(slug: string) => {
                      onChange({
                        ...field,
                        ref: {
                          ...(field.ref || {}),
                          moduleSlug: slug,
                          // ✅ Recomendado: si cambias de módulo, resetea displayField para evitar inconsistencias
                          
                        },
                      });
                    }}
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
          {(field.type === "file" || field.type === "image") && (
              <div className={styles.card} style={{ marginTop: 12 }}>
                <h4 style={{ marginTop: 0 }}>File/Image</h4>
                <div className={styles.switchRow}>
                  <label className={styles.label}>multiple</label>
                  <input
                    type="checkbox"
                    checked={!!field.multiple}
                    onChange={(e) =>
                      onChange({ ...field, multiple: e.target.checked })
                    }
                  />
                </div>

                <div>
                  <label className={styles.label}>maxFiles</label>
                  <input
                    type="number"
                    min={1}
                    className={styles.input}
                    value={field.maxFiles ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...field,
                        maxFiles: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className={styles.label}>allowedMimeTypes</label>
                  <ArrayChips
                    value={field.allowedMimeTypes || []}
                    onChange={(allowedMimeTypes) =>
                      onChange({ ...field, allowedMimeTypes })
                    }
                    placeholder="Ej: image/png o application/pdf"
                  />
                  <div className={styles.hint}>
                    Ejemplos: image/jpeg, image/png, application/pdf,
                    application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
                  </div>
                </div>
              </div>
            )}

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

                  <Selector
                    moduleSlug="modulos"
                    displayField="nombre"
                    valueField="slug" // guardamos el slug como "sourceTable"
                    value={ensureAggregate(field).sourceTable || ""}
                    readOnly={readOnly}
                    placeholder="— Seleccionar —"
                    label="Selecciona la tabla origen (aggregate)"
                    filters={[
                      { field: "activo", op: "=", value: true },
                      { field: "tipo", op: "in", value: ["tabla", "subtabla"] },
                    ]}
                    sort={[{ field: "orden", direction: "asc" }]}
                    onChange={(slugSel: string) => {
                      const base = ensureAggregate(field);
                      onChange({
                        ...field,
                        compute: { ...base, sourceTable: slugSel || "" },
                      });
                    }}
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

          {/* ========= FOOTER DE ACCIONES ========= */}
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
