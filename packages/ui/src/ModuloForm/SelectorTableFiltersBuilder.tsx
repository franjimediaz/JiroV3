import React, { useEffect, useMemo, useState } from "react";
import styles from "./modulo-detalle.module.css";
import {
  createEmptySelectorTableFilterCondition,
  createEmptySelectorTableFilterGroup,
  normalizeSelectorTableFilters,
  serializeSelectorTableFilters,
  type SelectorTableFilterCondition,
  type SelectorTableFilterGroup,
  type SelectorTableFilterLiteralType,
  type SelectorTableFilterNode,
  type SelectorTableFilterOperator,
  type SelectorTableFiltersInput,
} from "@repo/types";

type FieldOption = {
  name: string;
  label?: string;
  type?: string;
};

type Props = {
  value?: SelectorTableFiltersInput;
  onChange: (next: SelectorTableFilterGroup) => void;
  readOnly?: boolean;
  targetModuleSlug?: string;
  targetFields: FieldOption[];
  currentFields: FieldOption[];
  targetLoading?: boolean;
  onRequestTargetFields?: () => void;
};

const CONDITION_OPERATORS: Array<{ value: SelectorTableFilterOperator; label: string }> = [
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

const LITERAL_TYPES: Array<{ value: SelectorTableFilterLiteralType; label: string }> = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Numero" },
  { value: "boolean", label: "Booleano" },
];

type GroupPath = number[];

export default function SelectorTableFiltersBuilder({
  value,
  onChange,
  readOnly,
  targetModuleSlug,
  targetFields,
  currentFields,
  targetLoading,
  onRequestTargetFields,
}: Props) {
  const normalizedValue = useMemo(() => normalizeSelectorTableFilters(value), [value]);
  const [editorMode, setEditorMode] = useState<"visual" | "advanced">("visual");
  const [advancedText, setAdvancedText] = useState(() => JSON.stringify(normalizedValue, null, 2));
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  useEffect(() => {
    setAdvancedText(JSON.stringify(normalizedValue, null, 2));
    setAdvancedError(null);
  }, [normalizedValue]);

  const applyVisualChange = (next: SelectorTableFilterGroup) => {
    onChange(serializeSelectorTableFilters(next));
  };

  const updateGroup = (path: GroupPath, updater: (group: SelectorTableFilterGroup) => SelectorTableFilterGroup) => {
    applyVisualChange(updateGroupAtPath(normalizedValue, path, updater));
  };

  const updateCondition = (
    path: number[],
    updater: (condition: SelectorTableFilterCondition) => SelectorTableFilterCondition
  ) => {
    applyVisualChange(updateConditionAtPath(normalizedValue, path, updater));
  };

  const handleAdvancedCommit = (text: string) => {
    try {
      const parsed = JSON.parse(text || "{}");
      const next = serializeSelectorTableFilters(parsed);
      setAdvancedError(null);
      onChange(next);
    } catch (error: any) {
      setAdvancedError(error?.message || "JSON invalido");
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
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h4 style={{ margin: 0 }}>Filtros del selector</h4>
          <div className={styles.hint}>
            Define reglas como <code>activo = true</code>, <code>clienteId = registroActual.clienteId</code> o{" "}
            <code>estado != cerrado</code>.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={styles.btn}
            onClick={() => setEditorMode("visual")}
            disabled={editorMode === "visual"}
          >
            Editor visual
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={() => setEditorMode("advanced")}
            disabled={editorMode === "advanced"}
          >
            JSON avanzado
          </button>
        </div>
      </div>

      {editorMode === "visual" ? (
        <div className="d-flex flex-column gap-3">
          <div className={styles.hint}>
            Selecciona un campo de la tabla relacionada, el operador y de donde sale el valor.
          </div>

          {targetModuleSlug && targetFields.length === 0 && (
            <div className={styles.hint}>
              {targetLoading ? "Cargando campos de la tabla relacionada..." : "Aun no hay campos cargados para la tabla relacionada."}
              {!targetLoading && onRequestTargetFields ? (
                <>
                  {" "}
                  <button type="button" className={styles.btn} onClick={onRequestTargetFields} disabled={readOnly}>
                    Cargar campos
                  </button>
                </>
              ) : null}
            </div>
          )}

          {renderGroupEditor({
            group: normalizedValue,
            path: [],
            depth: 0,
            readOnly,
            targetFields,
            currentFields,
            onUpdateGroup: updateGroup,
            onUpdateCondition: updateCondition,
          })}
        </div>
      ) : (
        <div>
          <textarea
            className={styles.textarea}
            rows={12}
            value={advancedText}
            onChange={(event) => {
              const next = event.target.value;
              setAdvancedText(next);
              handleAdvancedCommit(next);
            }}
            onBlur={() => handleAdvancedCommit(advancedText)}
            spellCheck={false}
            disabled={readOnly}
          />
          <div className={styles.hint} style={{ marginTop: 8 }}>
            Se guarda como un grupo con <code>logic</code> e <code>items</code>. Los filtros legacy en array se convierten automaticamente.
          </div>
          {advancedError ? (
            <div style={{ marginTop: 8, color: "#fca5a5", fontSize: 12 }}>{advancedError}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function renderGroupEditor(args: {
  group: SelectorTableFilterGroup;
  path: GroupPath;
  depth: number;
  readOnly?: boolean;
  targetFields: FieldOption[];
  currentFields: FieldOption[];
  onUpdateGroup: (path: GroupPath, updater: (group: SelectorTableFilterGroup) => SelectorTableFilterGroup) => void;
  onUpdateCondition: (
    path: number[],
    updater: (condition: SelectorTableFilterCondition) => SelectorTableFilterCondition
  ) => void;
}): React.ReactNode {
  const { group, path, depth, readOnly, targetFields, currentFields, onUpdateGroup, onUpdateCondition } = args;

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
                items: [...current.items, createEmptySelectorTableFilterCondition()],
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
                items: [...current.items, createEmptySelectorTableFilterGroup()],
              }))
            }
          >
            Añadir grupo
          </button>
        </div>
      </div>

      <div className={styles.hint} style={{ marginTop: 8 }}>
        {group.logic === "AND"
          ? "Todas las condiciones del grupo deben cumplirse."
          : "Basta con que se cumpla una de las condiciones del grupo."}
      </div>

      <div className="d-flex flex-column gap-2" style={{ marginTop: 12 }}>
        {group.items.length === 0 ? (
          <div className={styles.hint}>Este grupo esta vacio.</div>
        ) : null}

        {group.items.map((item, index) => {
          const itemPath = [...path, index];
          const commonActions = {
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
                    readOnly,
                    targetFields,
                    currentFields,
                    onUpdateGroup,
                    onUpdateCondition,
                  })}
                </div>
                <ItemActionButtons readOnly={readOnly} {...commonActions} />
              </div>
            );
          }

          return (
            <ConditionEditor
              key={itemPath.join(".")}
              condition={item}
              path={itemPath}
              readOnly={readOnly}
              targetFields={targetFields}
              currentFields={currentFields}
              onUpdateCondition={onUpdateCondition}
              {...commonActions}
            />
          );
        })}
      </div>
    </div>
  );
}

function ConditionEditor(props: {
  condition: SelectorTableFilterCondition;
  path: number[];
  readOnly?: boolean;
  targetFields: FieldOption[];
  currentFields: FieldOption[];
  onUpdateCondition: (
    path: number[],
    updater: (condition: SelectorTableFilterCondition) => SelectorTableFilterCondition
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
    readOnly,
    targetFields,
    currentFields,
    onUpdateCondition,
    canMoveUp,
    canMoveDown,
    onMoveUp,
    onMoveDown,
    onRemove,
  } = props;

  const targetField = targetFields.find((field) => field.name === condition.field);
  const hideValue = condition.op === "isNull" || condition.op === "isNotNull";
  const literalType = condition.valueType || inferLiteralTypeFromField(targetField?.type);

  const update = (patch: Partial<SelectorTableFilterCondition>) =>
    onUpdateCondition(path, (current) => normalizeConditionShape({ ...current, ...patch }));

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
            <label className={styles.label}>Campo destino</label>
            <select
              className={styles.input}
              value={condition.field}
              disabled={readOnly}
              onChange={(event) => {
                const nextField = targetFields.find((field) => field.name === event.target.value);
                update({
                  field: event.target.value,
                  valueType: inferLiteralTypeFromField(nextField?.type),
                });
              }}
            >
              <option value="">Selecciona un campo de la tabla relacionada</option>
              {buildFieldOptions(targetFields, condition.field).map((field) => (
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
              onChange={(event) => update({ op: event.target.value as SelectorTableFilterOperator })}
            >
              {CONDITION_OPERATORS.map((operator) => (
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
                onChange={(event) => update({ valueSource: event.target.value === "recordField" ? "recordField" : "literal" })}
              >
                <option value="literal">Valor fijo</option>
                <option value="recordField">Campo del registro actual</option>
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
                onChange={(event) => update({ valueType: event.target.value as SelectorTableFilterLiteralType })}
              >
                {LITERAL_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={styles.label}>{condition.op === "in" ? "Valores" : "Valor"}</label>
              {renderLiteralInput({
                condition: { ...condition, valueType: literalType },
                readOnly,
                onChange: (nextValue) => update({ value: nextValue, valueType: literalType }),
              })}
            </div>
          </div>
        ) : null}

        {!hideValue && condition.valueSource === "recordField" ? (
          <div style={{ marginTop: 10 }}>
            <label className={styles.label}>Campo del registro actual</label>
            <select
              className={styles.input}
              value={condition.valueField || ""}
              disabled={readOnly}
              onChange={(event) => update({ valueField: event.target.value })}
            >
              <option value="">Selecciona un campo del registro actual</option>
              {buildFieldOptions(currentFields, condition.valueField || "").map((field) => (
                <option key={field.name} value={field.name}>
                  {field.label || field.name}
                </option>
              ))}
            </select>
            <div className={styles.hint}>Usa un valor del formulario o del registro actual en tiempo de ejecucion.</div>
          </div>
        ) : null}

        {hideValue ? <div className={styles.hint} style={{ marginTop: 10 }}>Este operador no necesita valor.</div> : null}
      </div>

      <ItemActionButtons
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

function ItemActionButtons(props: {
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
  condition: SelectorTableFilterCondition;
  readOnly?: boolean;
  onChange: (nextValue: any) => void;
}) {
  const { condition, readOnly, onChange } = args;
  const literalType = condition.valueType || "text";
  const isMultiple = condition.op === "in";

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
      placeholder={isMultiple ? "Separar por comas" : literalType === "boolean" ? "true / false" : ""}
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
  root: SelectorTableFilterGroup,
  path: GroupPath,
  updater: (group: SelectorTableFilterGroup) => SelectorTableFilterGroup
): SelectorTableFilterGroup {
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
  root: SelectorTableFilterGroup,
  path: number[],
  updater: (condition: SelectorTableFilterCondition) => SelectorTableFilterCondition
): SelectorTableFilterGroup {
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

function inferLiteralTypeFromField(fieldType?: string): SelectorTableFilterLiteralType {
  if (["number", "money", "percent"].includes(String(fieldType || ""))) return "number";
  if (fieldType === "boolean") return "boolean";
  return "text";
}

function normalizeConditionShape(condition: SelectorTableFilterCondition): SelectorTableFilterCondition {
  const next: SelectorTableFilterCondition = {
    ...condition,
    valueType: condition.valueType || "text",
    valueSource: condition.valueSource || "literal",
  };

  if (next.op === "isNull" || next.op === "isNotNull") {
    delete next.value;
    delete next.valueField;
    return next;
  }

  if (next.valueSource === "recordField") {
    next.value = undefined;
    return next;
  }

  next.valueField = "";
  return next;
}

function stringifyListValue(value: any) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseListValue(raw: string, literalType: SelectorTableFilterLiteralType) {
  const items = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (literalType === "number") {
    return items
      .map((entry) => Number(entry))
      .filter((entry) => !Number.isNaN(entry));
  }

  if (literalType === "boolean") {
    return items.map((entry) => entry.toLowerCase() === "true");
  }

  return items;
}
