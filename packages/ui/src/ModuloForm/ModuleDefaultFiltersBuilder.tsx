import React, { useEffect, useMemo, useState } from "react";
import styles from "./modulo-detalle.module.css";
import {
  createEmptyModuleDefaultFilterCondition,
  createEmptyModuleDefaultFilterGroup,
  normalizeModuleDefaultFilters,
  serializeModuleDefaultFilters,
  type ModuleDefaultFilterCondition,
  type ModuleDefaultFilterFunction,
  type ModuleDefaultFilterGroup,
  type ModuleDefaultFilterLiteralType,
  type ModuleDefaultFilterNode,
  type ModuleDefaultFilterOperator,
  type ModuleDefaultFiltersInput,
} from "@repo/types";

type FieldOption = {
  name: string;
  label?: string;
  type?: string;
};

type Props = {
  value?: ModuleDefaultFiltersInput;
  fields: FieldOption[];
  readOnly?: boolean;
  onChange: (next: ModuleDefaultFilterGroup) => void;
};

const OPERATORS: Array<{ value: ModuleDefaultFilterOperator; label: string }> = [
  { value: "=", label: "=" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: ">=", label: ">=" },
  { value: "<", label: "<" },
  { value: "<=", label: "<=" },
  { value: "contains", label: "contains" },
  { value: "in", label: "in" },
  { value: "isNull", label: "isNull" },
  { value: "isNotNull", label: "isNotNull" },
];

const LITERAL_TYPES: Array<{ value: ModuleDefaultFilterLiteralType; label: string }> = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Numero" },
  { value: "boolean", label: "Booleano" },
];

const FUNCTIONS: Array<{ value: ModuleDefaultFilterFunction; label: string }> = [
  { value: "CurrentUser", label: "CurrentUser()" },
  { value: "CurrentUserEmail", label: "CurrentUserEmail()" },
  { value: "CurrentUserRole", label: "CurrentUserRole()" },
  { value: "Today", label: "Today()" },
  { value: "Now", label: "Now()" },
];

type GroupPath = number[];

export default function ModuleDefaultFiltersBuilder({ value, fields, readOnly, onChange }: Props) {
  const normalizedValue = useMemo(() => normalizeModuleDefaultFilters(value), [value]);
  const [mode, setMode] = useState<"visual" | "advanced">("visual");
  const [rawText, setRawText] = useState(() => JSON.stringify(normalizedValue, null, 2));
  const [rawError, setRawError] = useState<string | null>(null);

  useEffect(() => {
    setRawText(JSON.stringify(normalizedValue, null, 2));
    setRawError(null);
  }, [normalizedValue]);

  const updateGroup = (path: GroupPath, updater: (group: ModuleDefaultFilterGroup) => ModuleDefaultFilterGroup) => {
    onChange(updateGroupAtPath(normalizedValue, path, updater));
  };

  const updateCondition = (
    path: number[],
    updater: (condition: ModuleDefaultFilterCondition) => ModuleDefaultFilterCondition
  ) => {
    onChange(updateConditionAtPath(normalizedValue, path, updater));
  };

  const commitRaw = (text: string) => {
    try {
      const parsed = JSON.parse(text || "{}");
      const next = serializeModuleDefaultFilters(parsed);
      setRawError(null);
      onChange(next);
    } catch (error: any) {
      setRawError(error?.message || "JSON invalido");
    }
  };

  return (
    <div className={styles.card} style={{ marginTop: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <h4 style={{ margin: 0 }}>Filtros por defecto del listado</h4>
          <div className={styles.hint}>
            Estos filtros se aplican por defecto al listado del modulo. Util para vistas como Mis tareas, Mis obras o registros activos.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className={styles.btn} onClick={() => setMode("visual")} disabled={mode === "visual"}>
            Editor visual
          </button>
          <button type="button" className={styles.btn} onClick={() => setMode("advanced")} disabled={mode === "advanced"}>
            JSON avanzado
          </button>
        </div>
      </div>

      <div className={styles.hint} style={{ marginBottom: 12 }}>
        Presets utiles: <code>responsableId = CurrentUser()</code> o <code>activo = true</code>.
      </div>

      {mode === "visual" ? (
        renderGroupEditor({
          group: normalizedValue,
          path: [],
          depth: 0,
          fields,
          readOnly,
          onUpdateGroup: updateGroup,
          onUpdateCondition: updateCondition,
        })
      ) : (
        <div>
          <textarea
            className={styles.textarea}
            rows={10}
            value={rawText}
            onChange={(event) => {
              const next = event.target.value;
              setRawText(next);
              commitRaw(next);
            }}
            onBlur={() => commitRaw(rawText)}
            spellCheck={false}
            disabled={readOnly}
          />
          <div className={styles.hint} style={{ marginTop: 8 }}>
            Tambien acepta arrays legacy con filtros planos.
          </div>
          {rawError ? <div style={{ marginTop: 8, fontSize: 12, color: "#fca5a5" }}>{rawError}</div> : null}
        </div>
      )}
    </div>
  );
}

function renderGroupEditor(args: {
  group: ModuleDefaultFilterGroup;
  path: GroupPath;
  depth: number;
  fields: FieldOption[];
  readOnly?: boolean;
  onUpdateGroup: (path: GroupPath, updater: (group: ModuleDefaultFilterGroup) => ModuleDefaultFilterGroup) => void;
  onUpdateCondition: (
    path: number[],
    updater: (condition: ModuleDefaultFilterCondition) => ModuleDefaultFilterCondition
  ) => void;
}) {
  const { group, path, depth, fields, readOnly, onUpdateGroup, onUpdateCondition } = args;

  return (
    <div
      style={{
        border: "1px solid rgba(148, 163, 184, 0.35)",
        borderRadius: 12,
        padding: 12,
        background: depth === 0 ? "rgba(15, 23, 42, 0.18)" : "rgba(15, 23, 42, 0.12)",
      }}
    >
      <div className={styles.grid} style={{ alignItems: "end" }}>
        <div>
          <label className={styles.label}>Logica del grupo</label>
          <select
            className={styles.input}
            value={group.logic}
            disabled={readOnly}
            onChange={(event) =>
              onUpdateGroup(path, (current) => ({
                ...current,
                logic: event.target.value === "OR" ? "OR" : "AND",
              }))
            }
          >
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.btn}
            disabled={readOnly}
            onClick={() =>
              onUpdateGroup(path, (current) => ({
                ...current,
                items: [...current.items, createEmptyModuleDefaultFilterCondition()],
              }))
            }
          >
            Añadir condicion
          </button>
          <button
            type="button"
            className={styles.btn}
            disabled={readOnly}
            onClick={() =>
              onUpdateGroup(path, (current) => ({
                ...current,
                items: [...current.items, createEmptyModuleDefaultFilterGroup()],
              }))
            }
          >
            Añadir grupo
          </button>
        </div>
      </div>

      <div className="d-flex flex-column gap-2" style={{ marginTop: 12 }}>
        {group.items.length === 0 ? <div className={styles.hint}>Este grupo esta vacio.</div> : null}

        {group.items.map((item, index) => {
          const itemPath = [...path, index];
          const controls = {
            canMoveUp: index > 0,
            canMoveDown: index < group.items.length - 1,
            onMoveUp: () =>
              onUpdateGroup(path, (current) => ({
                ...current,
                items: moveItem(current.items, index, -1),
              })),
            onMoveDown: () =>
              onUpdateGroup(path, (current) => ({
                ...current,
                items: moveItem(current.items, index, 1),
              })),
            onRemove: () =>
              onUpdateGroup(path, (current) => ({
                ...current,
                items: current.items.filter((_, currentIndex) => currentIndex !== index),
              })),
          };

          if (item.kind === "group") {
            return (
              <div key={itemPath.join(".")} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  {renderGroupEditor({
                    group: item,
                    path: itemPath,
                    depth: depth + 1,
                    fields,
                    readOnly,
                    onUpdateGroup,
                    onUpdateCondition,
                  })}
                </div>
                <ActionButtons readOnly={readOnly} {...controls} />
              </div>
            );
          }

          return (
            <ConditionEditor
              key={itemPath.join(".")}
              condition={item}
              path={itemPath}
              fields={fields}
              readOnly={readOnly}
              onUpdateCondition={onUpdateCondition}
              {...controls}
            />
          );
        })}
      </div>
    </div>
  );
}

function ConditionEditor(props: {
  condition: ModuleDefaultFilterCondition;
  path: number[];
  fields: FieldOption[];
  readOnly?: boolean;
  onUpdateCondition: (
    path: number[],
    updater: (condition: ModuleDefaultFilterCondition) => ModuleDefaultFilterCondition
  ) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const {
    condition,
    path,
    fields,
    readOnly,
    onUpdateCondition,
    canMoveUp,
    canMoveDown,
    onMoveUp,
    onMoveDown,
    onRemove,
  } = props;

  const selectedField = fields.find((field) => field.name === condition.field);
  const hideValue = condition.op === "isNull" || condition.op === "isNotNull";
  const literalType = condition.valueType || inferLiteralType(selectedField?.type);

  const update = (patch: Partial<ModuleDefaultFilterCondition>) =>
    onUpdateCondition(path, (current) => normalizeCondition({ ...current, ...patch }));

  return (
    <div
      style={{
        border: "1px solid rgba(148, 163, 184, 0.3)",
        borderRadius: 10,
        padding: 12,
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        background: "rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div className={styles.grid}>
          <div>
            <label className={styles.label}>Campo</label>
            <select
              className={styles.input}
              value={condition.field}
              disabled={readOnly}
              onChange={(event) => {
                const nextField = fields.find((field) => field.name === event.target.value);
                update({ field: event.target.value, valueType: inferLiteralType(nextField?.type) });
              }}
            >
              <option value="">Selecciona un campo de la tabla</option>
              {buildFieldOptions(fields, condition.field).map((field) => (
                <option key={field.name} value={field.name}>
                  {field.label || field.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={styles.label}>Operador</label>
            <select
              className={styles.input}
              value={condition.op}
              disabled={readOnly}
              onChange={(event) => update({ op: event.target.value as ModuleDefaultFilterOperator })}
            >
              {OPERATORS.map((operator) => (
                <option key={operator.value} value={operator.value}>
                  {operator.label}
                </option>
              ))}
            </select>
          </div>

          {!hideValue ? (
            <div>
              <label className={styles.label}>Origen del valor</label>
              <select
                className={styles.input}
                value={condition.valueSource || "literal"}
                disabled={readOnly}
                onChange={(event) => update({ valueSource: event.target.value === "function" ? "function" : "literal" })}
              >
                <option value="literal">Valor fijo</option>
                <option value="function">Funcion</option>
              </select>
            </div>
          ) : null}
        </div>

        {!hideValue && (condition.valueSource || "literal") === "literal" ? (
          <div className={styles.grid} style={{ marginTop: 10 }}>
            <div>
              <label className={styles.label}>Tipo del valor</label>
              <select
                className={styles.input}
                value={literalType}
                disabled={readOnly}
                onChange={(event) => update({ valueType: event.target.value as ModuleDefaultFilterLiteralType })}
              >
                {LITERAL_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={styles.label}>{condition.op === "in" ? "Valores" : "Valor"}</label>
              {renderLiteralInput({
                condition: { ...condition, valueType: literalType },
                readOnly,
                onChange: (value) => update({ value, valueType: literalType }),
              })}
            </div>
          </div>
        ) : null}

        {!hideValue && condition.valueSource === "function" ? (
          <div style={{ marginTop: 10 }}>
            <label className={styles.label}>Funcion dinamica</label>
            <select
              className={styles.input}
              value={condition.fn || "CurrentUser"}
              disabled={readOnly}
              onChange={(event) => update({ fn: event.target.value as ModuleDefaultFilterFunction })}
            >
              {FUNCTIONS.map((fn) => (
                <option key={fn.value} value={fn.value}>
                  {fn.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {hideValue ? <div className={styles.hint} style={{ marginTop: 10 }}>Este operador no requiere valor.</div> : null}
      </div>

      <ActionButtons
        readOnly={readOnly}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onRemove={onRemove}
      />
    </div>
  );
}

function ActionButtons(props: {
  readOnly?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const { readOnly, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onRemove } = props;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button type="button" className={styles.btn} onClick={onMoveUp} disabled={readOnly || !canMoveUp}>
        ↑
      </button>
      <button type="button" className={styles.btn} onClick={onMoveDown} disabled={readOnly || !canMoveDown}>
        ↓
      </button>
      <button type="button" className={styles.btn} onClick={onRemove} disabled={readOnly}>
        Eliminar
      </button>
    </div>
  );
}

function renderLiteralInput(args: {
  condition: ModuleDefaultFilterCondition;
  readOnly?: boolean;
  onChange: (nextValue: any) => void;
}) {
  const { condition, readOnly, onChange } = args;
  const isMultiple = condition.op === "in";
  const literalType = condition.valueType || "text";

  if (literalType === "boolean" && !isMultiple) {
    return (
      <select
        className={styles.input}
        value={String(condition.value ?? false)}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.value === "true")}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (literalType === "number" && !isMultiple) {
    return (
      <input
        type="number"
        className={styles.input}
        value={condition.value ?? ""}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
      />
    );
  }

  return (
    <input
      type="text"
      className={styles.input}
      value={isMultiple ? stringifyListValue(condition.value) : String(condition.value ?? "")}
      disabled={readOnly}
      placeholder={isMultiple ? "Separar por comas" : ""}
      onChange={(event) => {
        const raw = event.target.value;
        if (isMultiple) {
          onChange(parseListValue(raw, literalType));
          return;
        }

        if (literalType === "boolean") {
          onChange(raw.trim().toLowerCase() === "true");
          return;
        }

        onChange(raw);
      }}
    />
  );
}

function updateGroupAtPath(
  root: ModuleDefaultFilterGroup,
  path: GroupPath,
  updater: (group: ModuleDefaultFilterGroup) => ModuleDefaultFilterGroup
): ModuleDefaultFilterGroup {
  if (path.length === 0) return updater(root);

  const [index, ...rest] = path;
  const current = root.items[index];
  if (!current || current.kind !== "group") return root;

  return {
    ...root,
    items: root.items.map((item, itemIndex) =>
      itemIndex !== index || item.kind !== "group" ? item : updateGroupAtPath(item, rest, updater)
    ),
  };
}

function updateConditionAtPath(
  root: ModuleDefaultFilterGroup,
  path: number[],
  updater: (condition: ModuleDefaultFilterCondition) => ModuleDefaultFilterCondition
): ModuleDefaultFilterGroup {
  const [index, ...rest] = path;
  if (index === undefined) return root;

  return {
    ...root,
    items: root.items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (rest.length === 0 && item.kind === "condition") return updater(item);
      if (item.kind === "group") return updateConditionAtPath(item, rest, updater);
      return item;
    }),
  };
}

function moveItem<T>(items: T[], index: number, delta: number) {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

function buildFieldOptions(fields: FieldOption[], selectedName?: string) {
  const output = [...fields];
  if (selectedName && !output.some((field) => field.name === selectedName)) {
    output.push({ name: selectedName, label: selectedName });
  }
  return output;
}

function inferLiteralType(fieldType?: string): ModuleDefaultFilterLiteralType {
  if (["number", "money", "percent"].includes(String(fieldType || ""))) return "number";
  if (fieldType === "boolean") return "boolean";
  return "text";
}

function normalizeCondition(condition: ModuleDefaultFilterCondition): ModuleDefaultFilterCondition {
  const next: ModuleDefaultFilterCondition = {
    ...condition,
    valueSource: condition.valueSource || "literal",
    valueType: condition.valueType || "text",
  };

  if (next.op === "isNull" || next.op === "isNotNull") {
    delete next.value;
    delete next.fn;
    return next;
  }

  if (next.valueSource === "function") {
    next.fn = next.fn || "CurrentUser";
    next.value = undefined;
    return next;
  }

  delete next.fn;
  return next;
}

function stringifyListValue(value: any) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseListValue(raw: string, literalType: ModuleDefaultFilterLiteralType) {
  const items = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (literalType === "number") {
    return items.map((entry) => Number(entry)).filter((entry) => !Number.isNaN(entry));
  }

  if (literalType === "boolean") {
    return items.map((entry) => entry.toLowerCase() === "true");
  }

  return items;
}
