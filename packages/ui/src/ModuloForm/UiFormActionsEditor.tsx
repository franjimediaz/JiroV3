"use client";

import React, { useMemo, useState, useEffect } from "react";
import  Selector from "../Selector";

type UiMode = "view" | "edit" | "create";
type UiActionType = "recalculate" | "createRelated" | "navigate" | "duplicate" | "external" |"workflow";
type SimpleField = { name: string; label?: string };
type WorkflowCatalogItem = {
  key: string;
  label: string;
};

export type UiFormAction = {
  id: string;
  label: string;
  type: UiActionType;
  icon?: string;
  variant?: "primary" | "secondary" | "success" | "warning" | "danger" | "info" | "light" | "dark";
  showIn?: UiMode[];
  confirm?: { text?: string };

  // payloads según type
  target?: { table?: string };
  afterCreate?: { navigateTo?: "record" | "list" | "none" };
  fieldMap?: any;
  defaults?: any;

  hrefTemplate?: string;

  includeChildren?: boolean;
  omitFields?: any;
};

type Props = {
  value: UiFormAction[];
  onChange: (next: UiFormAction[]) => void;
  readOnly?: boolean;

  // Reutilizas tu CSS Modules de ModuloForm:
  styles: Record<string, string>;

  // Para reutilizar tu IconPicker real:
  IconPicker: React.ComponentType<{ value?: string; onChange: (icon: string) => void }>;
   sourceFields: SimpleField[];

  // ✅ NUEVO: función para obtener campos de cualquier tabla (destino)
  getTableFields: (table: string) => SimpleField[];

  // ✅ OPCIONAL: para ir cargando campos al escribir target.table
  ensureTableFields?: (table: string) => void;
  loadingTableFields?: (table: string) => boolean;

  workflowCatalog?: WorkflowCatalogItem[];

};

const TYPE_LABEL: Record<UiActionType, string> = {
  recalculate: "Recalcular",
  createRelated: "Crear relacionado",
  navigate: "Navegar",
  duplicate: "Duplicar",
  external: "Externa",
  workflow: "Flujo",
};

const TYPE_HINT: Record<UiActionType, string> = {
  recalculate: "Recalcula campos calculados / aggregates.",
  createRelated: "Crea un registro relacionado y puede navegar tras crear.",
  navigate: "Navega a una ruta/href basada en plantilla.",
  duplicate: "Duplica el registro (y opcionalmente hijos).",
  external: "Acción externa (PDF/email/print) — preparada para futuro.",
  workflow: "Crea registros en base a un padre y sus relacionados",
};

function groupByType(actions: UiFormAction[]) {
  const groups: Record<UiActionType, { idx: number; action: UiFormAction }[]> = {
    recalculate: [],
    createRelated: [],
    navigate: [],
    duplicate: [],
    external: [],
    workflow: [],
  };
  actions.forEach((a, idx) => groups[a.type].push({ idx, action: a }));
  return groups;
}

const safeJson = (v: any) => (v ? JSON.stringify(v, null, 2) : "");
const parseJson = (txt: string) => {
  if (!txt.trim()) return undefined;
  return JSON.parse(txt);
};

export default function UiFormActionsEditor({
  value,
  onChange,
  readOnly,
  styles,
  IconPicker,
  sourceFields,
  getTableFields,
  ensureTableFields,
  loadingTableFields,
  workflowCatalog,
}: Props) {
  const actions = Array.isArray(value) ? value : [];

  const [openGroup, setOpenGroup] = useState<UiActionType | null>(null);
  const [openAction, setOpenAction] = useState<number | null>(null);
  const [newActionType, setNewActionType] = useState<UiActionType>("createRelated");

  const groups = useMemo(() => groupByType(actions), [actions]);

  const addFormAction = (type: UiActionType) => {
  const n = actions.length + 1;

  const base: UiFormAction = {
    id: `action_${n}`,
    label: `Acción ${n}`,
    type,
    variant: "secondary",
    showIn: ["view", "edit", "create"],
  };

  const next: UiFormAction =
    type === "workflow"
      ? ({
          ...base,
          workflowKey: "",
          input: {},
          after: { navigateTo: "" }, // si tu type incluye after; si no, bórralo
        } as any)
      : base;

  const nextActions = [...actions, next];
  onChange(nextActions);

  setOpenGroup(type);
  setOpenAction(actions.length);
};


  const updateFormAction = (idx: number, patch: Partial<UiFormAction>) => {
    const next = [...actions];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeFormAction = (idx: number) => {
    const next = actions.filter((_, i) => i !== idx);
    onChange(next);

    // si eliminaste la acción abierta, ciérrala
    setOpenAction((prev) => (prev === idx ? null : prev));
  };

  

  return (
    <div style={{ gridColumn: "1 / -1", marginTop: 12 }}>
      <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
        <div style={{ fontWeight: 600 }}>ui.formActions</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select
            className={styles.input}
            value={newActionType}
            onChange={(e) => setNewActionType(e.target.value as UiActionType)}
            disabled={readOnly}
            style={{ width: 220 }}
          >
            {(["createRelated", "navigate", "recalculate", "duplicate", "external","workflow"] as UiActionType[]).map(
              (t) => (
                <option key={t} value={t}>
                  + {TYPE_LABEL[t]}
                </option>
              )
            )}
          </select>

          <button
            type="button"
            className={styles.btnAdd}
            onClick={() => addFormAction(newActionType)}
            disabled={readOnly}
          >
            + Añadir
          </button>
        </div>
      </div>

      {actions.length === 0 && (
        <div className={styles.hint}>
          No hay acciones configuradas. Añade botones y quedarán agrupados por tipo.
        </div>
      )}

      {(Object.keys(groups) as UiActionType[]).map((type) => {
        const items = groups[type];
        if (items.length === 0) return null;

        const isOpen = openGroup === type;

        return (
          <div key={type} className={styles.card} style={{ marginTop: 12 }}>
            {/* Header de grupo */}
            <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => setOpenGroup(isOpen ? null : type)}
                    style={{ padding: "6px 10px" }}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                  <span>{TYPE_LABEL[type]}</span>
                  <span className={styles.badge} style={{ marginLeft: 6 }}>
                    {items.length}
                  </span>
                </div>
                <div className={styles.hint} style={{ marginTop: 6 }}>
                  {TYPE_HINT[type]}
                </div>
              </div>

              <button
                type="button"
                className={styles.btnAdd}
                onClick={() => addFormAction(type)}
                disabled={readOnly}
              >
                + Añadir {TYPE_LABEL[type]}
              </button>
            </div>

            {/* Contenido grupo */}
            {isOpen && (
              <div style={{ marginTop: 10 }}>
                {items.map(({ idx, action: a }) => {
                  const isActionOpen = openAction === idx;
                  const showIn = (a as any).showIn || (["view", "edit", "create"] as UiMode[]);

                  return (
                    <div key={a.id || idx} className={styles.card} style={{ marginTop: 10 }}>
                      {/* Resumen plegable */}
                      <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <div style={{ fontWeight: 700 }}>
                            {a.label || "Sin label"}{" "}
                            <span className={styles.hint} style={{ marginLeft: 8 }}>
                              ({a.id || "sin_id"})
                            </span>
                          </div>
                          
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                          <button
                            type="button"
                            className={styles.btn}
                            onClick={() => setOpenAction(isActionOpen ? null : idx)}
                          >
                            {isActionOpen ? "Ocultar" : "Configurar"}
                          </button>

                          <button
                            type="button"
                            className={styles.btn}
                            onClick={() => {
                              const nextType = prompt(
                                `Nuevo type (${Object.keys(TYPE_LABEL).join(", ")}):`,
                                a.type
                              ) as UiActionType | null;

                              if (!nextType) return;
                              if (!TYPE_LABEL[nextType]) return;
                              updateFormAction(idx, { type: nextType });
                            }}
                            disabled={readOnly}
                            title="Cambiar type (rápido)"
                          >
                            Cambiar type
                          </button>

                          <button
                            type="button"
                            className={styles.btn}
                            style={{ background: "#fc0505ff", borderColor: "#ffb3b3" }}
                            onClick={() => removeFormAction(idx)}
                            disabled={readOnly}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>

                      {/* Config desplegada */}
                      {isActionOpen && (
                        <div className={styles.grid} style={{ marginTop: 10 }}>
                          <div>
                            <label className={styles.label}>id</label>
                            <input
                              className={styles.input}
                              value={a.id}
                              onChange={(e) => updateFormAction(idx, { id: e.target.value })}
                              disabled={readOnly}
                            />
                          </div>

                          <div>
                            <label className={styles.label}>label</label>
                            <input
                              className={styles.input}
                              value={a.label}
                              onChange={(e) => updateFormAction(idx, { label: e.target.value })}
                              disabled={readOnly}
                            />
                          </div>

                          <div>
                            <label className={styles.label}>variant</label>
                            <select
                              className={styles.input}
                              value={(a as any).variant || "secondary"}
                              onChange={(e) => updateFormAction(idx, { variant: e.target.value as any })}
                              disabled={readOnly}
                            >
                              {["primary", "secondary", "success", "warning", "danger", "info", "light", "dark"].map(
                                (v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                )
                              )}
                            </select>
                          </div>

                          <div style={{ gridColumn: "1 / -1" }}>
                            <label className={styles.label}>icon (Bootstrap Icons)</label>
                            <IconPicker
                              value={(a as any).icon || ""}
                              onChange={(icon: string) => updateFormAction(idx, { icon })}
                            />
                          </div>

                          <div style={{ gridColumn: "1 / -1" }}>
                            <label className={styles.label}>showIn</label>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                              {(["view", "edit", "create"] as const).map((m) => {
                                const checked = showIn.includes(m);
                                return (
                                  <label key={m} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={readOnly}
                                      onChange={(e) => {
                                        const next = e.target.checked
                                          ? Array.from(new Set([...showIn, m]))
                                          : showIn.filter((x: string) => x !== m);

                                        updateFormAction(idx, { showIn: next as any });
                                      }}
                                    />
                                    <span className={styles.label} style={{ margin: 0 }}>
                                      {m}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          <div style={{ gridColumn: "1 / -1" }}>
                            <label className={styles.label}>confirm.text (opcional)</label>
                            <input
                              className={styles.input}
                              value={(a as any).confirm?.text || ""}
                              onChange={(e) => {
                                const text = e.target.value;
                                updateFormAction(
                                  idx,
                                  {
                                    confirm: text.trim()
                                      ? { ...((a as any).confirm || {}), text }
                                      : undefined,
                                  } as any
                                );
                              }}
                              disabled={readOnly}
                              placeholder="Ej: ¿Seguro que quieres generar el presupuesto?"
                            />
                          </div>

                          {/* ---- createRelated ---- */}
                          {a.type === "createRelated" && (
                            <>
                            <div>
                            <Selector
                            moduleSlug="modulos"
                            displayField="nombre"
                            valueField="slug"
                            value={(a as any).target?.table || ""}
                            readOnly={readOnly}
                            placeholder="— Seleccionar —"
                            label="Selecciona la tabla destino"
                            filters={[
                            { field: "activo", op: "=", value: true },
                            { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] },
                            ]}
                            sort={[{ field: "orden", direction: "asc" }]}
                            onChange={(e) => {
                                    const table = e.target.value;
                                    updateFormAction(
                                      idx,
                                      { target: { ...((a as any).target || {}), table } } as any
                                    );
                                  }}
                            />
                              
                            <div>
                            <label className={styles.label}>afterCreate.navigateTo</label>
                            <select
                                className={styles.input}
                                value={(a as any).afterCreate?.navigateTo || "record"}
                                onChange={(e) => {
                                const navigateTo = e.target.value;
                                updateFormAction(
                                    idx,
                                    {
                                    afterCreate: { ...((a as any).afterCreate || {}), navigateTo },
                                    } as any
                                );
                                }}
                                disabled={readOnly}
                            >
                                <option value="record">record</option>
                                <option value="list">list</option>
                                <option value="none">none</option>
                            </select>
                            </div>
                            </div>
                              
                            
                            <UiFormActionItem
                                idx={idx}
                                action={a}
                                readOnly={readOnly}
                                styles={styles}
                                IconPicker={IconPicker}
                                updateFormAction={updateFormAction}
                                removeFormAction={removeFormAction}
                                sourceFields={sourceFields}
                                getTableFields={getTableFields}
                                ensureTableFields={ensureTableFields}
                                workflowCatalog={workflowCatalog}
                                />
                    
                            
                            </>
                          )}

                          {/* ---- navigate ---- */}
                          {a.type === "navigate" && (
                            <div style={{ gridColumn: "1 / -1" }}>
                              <label className={styles.label}>hrefTemplate</label>
                              <input
                                className={styles.input}
                                value={(a as any).hrefTemplate || ""}
                                onChange={(e) => updateFormAction(idx, { hrefTemplate: e.target.value } as any)}
                                disabled={readOnly}
                                placeholder='/tareas/new?obraId={{id}}'
                              />
                            </div>
                          )}

                          {/* ---- duplicate ---- */}
                          {a.type === "duplicate" && (
                            <>
                              <div className={styles.switchRow}>
                                <label className={styles.label}>includeChildren</label>
                                <input
                                  type="checkbox"
                                  checked={!!(a as any).includeChildren}
                                  onChange={(e) =>
                                    updateFormAction(idx, { includeChildren: e.target.checked } as any)
                                  }
                                  disabled={readOnly}
                                />
                              </div>

                              <div style={{ gridColumn: "1 / -1" }}>
                                <label className={styles.label}>omitFields (JSON array)</label>
                                <input
                                  className={styles.input}
                                  value={safeJson((a as any).omitFields)}
                                  onChange={(e) => {
                                    try {
                                      const arr = parseJson(e.target.value);
                                      updateFormAction(idx, { omitFields: arr } as any);
                                    } catch {}
                                  }}
                                  disabled={readOnly}
                                  placeholder='["id","createdAt","updatedAt"]'
                                />
                              </div>
                            </>
                          )}

                          {/* ---- external ---- */}
                          {a.type === "external" && (
                            <div style={{ gridColumn: "1 / -1" }} className={styles.hint}>
                              Acción externa (PDF/email/print) — la dejamos lista para implementar más adelante.
                            </div>
                          )}

                          {/* ---- recalculate ---- */}
                          {a.type === "recalculate" && (
                            <div style={{ gridColumn: "1 / -1" }} className={styles.hint}>
                              No requiere configuración adicional por ahora.
                            </div>
                          )}

                          {a.type === "workflow" && (
                            <>
                            <div>
                              
                            <div>
                            <label className={styles.label}>afterCreate.navigateTo</label>
                            <select
                                className={styles.input}
                                value={(a as any).afterCreate?.navigateTo || "record"}
                                onChange={(e) => {
                                const navigateTo = e.target.value;
                                updateFormAction(
                                    idx,
                                    {
                                    afterCreate: { ...((a as any).afterCreate || {}), navigateTo },
                                    } as any
                                );
                                }}
                                disabled={readOnly}
                            >
                                <option value="record">record</option>
                                <option value="list">list</option>
                                <option value="none">none</option>
                            </select>
                            </div>
                            </div>
                              
                            
                            <UiFormActionItem
                                idx={idx}
                                action={a}
                                readOnly={readOnly}
                                styles={styles}
                                IconPicker={IconPicker}
                                updateFormAction={updateFormAction}
                                removeFormAction={removeFormAction}
                                sourceFields={sourceFields}
                                getTableFields={getTableFields}
                                ensureTableFields={ensureTableFields}
                                workflowCatalog={workflowCatalog}
                                />
                    
                            
                            </>
                          )}

                          
                          
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

//-------- Field MAP Editor

function normalizePairs(fieldMap: any): Array<{ dest: string; src: string }> {
  if (!fieldMap || typeof fieldMap !== "object") return [];
  return Object.entries(fieldMap)
    .map(([dest, src]) => ({ dest: String(dest), src: String(src) }))
    .filter((x) => x.dest && x.src);
}

function pairsToMap(pairs: Array<{ dest: string; src: string }>) {
  const out: Record<string, string> = {};
  for (const p of pairs) {
    const d = p.dest?.trim();
    const s = p.src?.trim();
    if (!d || !s) continue;
    out[d] = s;
  }
  return out;
}

function FieldMapEditor({
  value,
  onChange,
  readOnly,
  styles,
  sourceLabel,
  targetLabel,
  sourceFields,
  targetFields,
}: {
  value: Record<string, string> | undefined;
  onChange: (next: Record<string, string> | undefined) => void;
  readOnly?: boolean;
  styles: Record<string, string>;
  sourceLabel: string; // ej: "Origen (tabla actual)"
  targetLabel: string; // ej: "Destino (tabla target)"
  sourceFields: SimpleField[];
  targetFields: SimpleField[];
}) {
  const [pairs, setPairs] = useState(() => normalizePairs(value));

  // Si cambia value desde fuera (ej: cargar módulo), sincroniza
  useEffect(() => {
    setPairs(normalizePairs(value));
  }, [JSON.stringify(value)]);

  const commit = (nextPairs: Array<{ dest: string; src: string }>) => {
    setPairs(nextPairs);
    const map = pairsToMap(nextPairs);
    onChange(Object.keys(map).length ? map : undefined);
  };

  const addRow = () => commit([...pairs, { dest: "", src: "" }]);

  const updateRow = (i: number, patch: Partial<{ dest: string; src: string }>) => {
    const next = pairs.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    commit(next);
  };

  const removeRow = (i: number) => {
    const next = pairs.filter((_, idx) => idx !== i);
    commit(next);
  };

  return (
    <div style={{  background:"#ffffff07"}}>
      <div className={styles.actionsRow} style={{ justifyContent: "space-between", marginBottom: 8}}>
        <label className={styles.label} style={{ margin: 0 }}>
          fieldMap (asistente)
        </label>

        <button type="button" className={styles.btnAdd} onClick={addRow} disabled={readOnly}>
          + Añadir mapeo
        </button>
      </div>

      {pairs.length === 0 && (
        <div className={styles.hint} style={{ marginBottom: 10 }}>
          Añade filas para mapear campos de <b>{targetLabel}</b> a <b>{sourceLabel}</b>.
        </div>
      )}

      {pairs.map((p, i) => (
        <div 
          key={`${i}-${p.dest}-${p.src}`}
          className={styles.grid}
          style={{
            gridTemplateColumns: "1fr 1fr auto",
            alignItems: "end",
            gap: 10,
            marginTop: 10,
          }}
        >
        <div className ={styles.grid} >
          <div>
            <label className={styles.label}>{targetLabel}</label>
            <select
              className={styles.input}
              value={p.dest}
              disabled={readOnly}
              onChange={(e) => updateRow(i, { dest: e.target.value })}
            >
              <option value="">— Selecciona campo destino —</option>
              {targetFields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label ? `${f.label} (${f.name})` : f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={styles.label}>{sourceLabel}</label>
            <select
              className={styles.input}
              value={p.src}
              disabled={readOnly}
              onChange={(e) => updateRow(i, { src: e.target.value })}
            >
              <option value="">— Selecciona campo origen —</option>
              {sourceFields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label ? `${f.label} (${f.name})` : f.name}
                </option>
              ))}
            </select>
          </div>
          
            <div className={styles.actionsRow} style={{ justifyContent: "flex-start" }}>
                <button
                    type="button"
                    className={styles.btnDel}
                    
                    onClick={() => removeRow(i)}
                    disabled={readOnly}
                    title="Eliminar fila"
                >
                    Eliminar
                </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UiFormActionItem({
  idx,
  action: a,
  readOnly,
  styles,
  IconPicker,
  updateFormAction,
  removeFormAction,
  sourceFields,
  getTableFields,
  ensureTableFields,
  workflowCatalog,
}: {
  idx: number;
  action: UiFormAction;
  readOnly?: boolean;
  styles: Record<string, string>;
  IconPicker: React.ComponentType<{ value?: string; onChange: (icon: string) => void }>;
  updateFormAction: (idx: number, patch: Partial<UiFormAction>) => void;
  removeFormAction: (idx: number) => void;

  sourceFields: SimpleField[];
  getTableFields: (table: string) => SimpleField[];
  ensureTableFields?: (table: string) => void;
  workflowCatalog?: WorkflowCatalogItem[];
}) {
  const targetTable = a.target?.table || "";


  useEffect(() => {
    if (!targetTable) return;
    ensureTableFields?.(targetTable);
  }, [targetTable, ensureTableFields]);

  const sourceFieldsForCurrentModule = sourceFields;
  const targetFieldsForThisAction = targetTable
    ? getTableFields(targetTable)
    : [];

  return (
    <>
      {/* ---- createRelated ---- */}
      {a.type === "createRelated" && (
        
        <>
             
          <FieldMapEditor
            value={a.fieldMap}
            onChange={(next) =>
              updateFormAction(idx, { fieldMap: next })
            }
            readOnly={readOnly}
            styles={styles}
            targetLabel={`Destino (${targetTable || "—"})`}
            sourceLabel="Origen (registro actual)"
            targetFields={targetFieldsForThisAction}
            sourceFields={sourceFieldsForCurrentModule}
          />
          <DefaultsEditor
            value={(a as any).defaults}
            onChange={(next) => updateFormAction(idx, { defaults: next } as any)}
            readOnly={readOnly}
            styles={styles}
            targetLabel={`Destino (${targetTable || "—"})`}
            targetFields={targetFieldsForThisAction}
            />
        
        </> 
        
      )}

      {/* ---- workflow ---- */}

      
      {a.type === "workflow" && (
  <>
    <div style={{ gridColumn: "1 / -1" }}>
      <label className={styles.label}>workflowKey</label>

      {workflowCatalog && workflowCatalog.length > 0 ? (
        <select
          className={styles.input}
          value={(a as any).workflowKey || ""}
          onChange={(e) => updateFormAction(idx, { workflowKey: e.target.value } as any)}
          disabled={readOnly}
        >
          <option value="">— Selecciona workflow —</option>
          {workflowCatalog.map((w) => (
            <option key={w.key} value={w.key}>
              {w.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={styles.input}
          value={(a as any).workflowKey || ""}
          onChange={(e) => updateFormAction(idx, { workflowKey: e.target.value } as any)}
          disabled={readOnly}
          placeholder="Ej: budget.generateFromTasks"
        />
      )}

      <div className={styles.hint} style={{ marginTop: 6 }}>
        Clave del workflow en backend. Ejemplos: <code>budget.generateFromTasks</code>, <code>invoice.generateFromBudget</code>.
      </div>
    </div>

    <WorkflowInputEditor
      value={(a as any).input}
      onChange={(next) => updateFormAction(idx, { input: next } as any)}
      readOnly={readOnly}
      styles={styles}
      sourceFields={sourceFieldsForCurrentModule}
    />

    <div style={{ gridColumn: "1 / -1" }}>
      <label className={styles.label}>after.navigateTo (opcional)</label>
      <input
        className={styles.input}
        value={(a as any).after?.navigateTo || ""}
        onChange={(e) =>
          updateFormAction(idx, { after: { ...((a as any).after || {}), navigateTo: e.target.value } } as any)
        }
        disabled={readOnly}
        placeholder="/budgets/{{result.id}}?view=1"
      />
    </div>
  </>
)}


    </>
  );
}

//-------- Default Editor

function normalizeDefaults(value: any): Array<{ field: string; val: string }> {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .map(([field, val]) => ({
      field: String(field),
      val: val === null || val === undefined ? "" : String(val),
    }))
    .filter((x) => x.field);
}

function pairsToDefaults(pairs: Array<{ field: string; val: string }>) {
  const out: Record<string, any> = {};
  for (const p of pairs) {
    const k = p.field?.trim();
    if (!k) continue;

    // ✅ intenta tipar el valor (muy útil)
    const raw = p.val;

    // boolean
    if (raw === "true") out[k] = true;
    else if (raw === "false") out[k] = false;
    // number (si es número limpio)
    else if (raw.trim() !== "" && !Number.isNaN(Number(raw)) && String(Number(raw)) === raw.trim()) out[k] = Number(raw);
    // null
    else if (raw === "null") out[k] = null;
    // string
    else out[k] = raw;
  }
  return out;
}

function DefaultsEditor({
  value,
  onChange,
  readOnly,
  styles,
  targetLabel,
  targetFields,
}: {
  value: Record<string, any> | undefined;
  onChange: (next: Record<string, any> | undefined) => void;
  readOnly?: boolean;
  styles: Record<string, string>;
  targetLabel: string;
  targetFields: { name: string; label?: string }[];
}) {
  const [rows, setRows] = useState(() => normalizeDefaults(value));

  // sincroniza si cambia desde fuera
  useEffect(() => {
    setRows(normalizeDefaults(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  const commit = (nextRows: Array<{ field: string; val: string }>) => {
    setRows(nextRows);
    const obj = pairsToDefaults(nextRows);
    onChange(Object.keys(obj).length ? obj : undefined);
  };

  const addRow = () => commit([...(rows || []), { field: "", val: "" }]);

  const updateRow = (i: number, patch: Partial<{ field: string; val: string }>) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    commit(next);
  };

  const removeRow = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    commit(next);
  };

  return (
    <div style={{ background:"#ffffff07" }}>
      <div className={styles.actionsRow} style={{ justifyContent: "space-between", marginBottom: 15 }}>
        <label className={styles.label} style={{ margin: 0 }}>
          defaults (asistente)
        </label>

        <button type="button" className={styles.btnAdd} onClick={addRow} disabled={readOnly}>
          + Añadir default
        </button>
      </div>

      {rows.length === 0 && (
        <div className={styles.hint} style={{ marginBottom: 10 }}>
          Añade valores por defecto para campos de <b>{targetLabel}</b>. <br />
          Tip: usa <code>true</code>, <code>false</code>, <code>null</code> o números para que se guarden tipados.
        </div>
      )}

      {rows.map((r, i) => (
        <div
          key={`${i}-${r.field}`}
          className={styles.grid}
          style={{
            gridTemplateColumns: "1fr 1fr auto",
            alignItems: "end",
            gap: 10,
            marginTop: 10,
          }}
        >
        <div className={styles.grid}> 
          <div>
            <label className={styles.label}>{targetLabel}</label>
            <select
              className={styles.input}
              value={r.field}
              disabled={readOnly}
              onChange={(e) => updateRow(i, { field: e.target.value })}
            >
              <option value="">— Selecciona campo —</option>
              {targetFields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label ? `${f.label} (${f.name})` : f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={styles.label}>Valor</label>
            <input
              className={styles.input}
              value={r.val}
              disabled={readOnly}
              onChange={(e) => updateRow(i, { val: e.target.value })}
              placeholder='Ej: "pendiente" | true | 10 | null'
            />
          </div>
        <div className={styles.actionsRow} style={{ justifyContent: "flex-start" }}>
          <button
            type="button"
            className={styles.btnDel}
            onClick={() => removeRow(i)}
            disabled={readOnly}
          >
            Eliminar
          </button>
          </div>
        </div>
        </div>
      ))}
    </div>
  );
}


//----------- Workflow Editor


function normalizeInput(value: any): Array<{ key: string; mode: "field" | "literal"; field: string; literal: string }> {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).map(([k, v]) => {
    const raw = v == null ? "" : String(v);
    const m = raw.startsWith("{{") && raw.endsWith("}}") ? "field" : "literal";
    const field = m === "field" ? raw.slice(2, -2).trim() : "";
    return { key: String(k), mode: m, field, literal: m === "literal" ? raw : "" };
  });
}

function rowsToInput(rows: Array<{ key: string; mode: "field" | "literal"; field: string; literal: string }>) {
  const out: Record<string, any> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;

    if (r.mode === "field") {
      const f = r.field.trim();
      if (!f) continue;
      out[k] = `{{${f}}}`;
    } else {
      const lit = r.literal;
      if (lit === "") continue;

      // tipado básico (igual que defaults)
      if (lit === "true") out[k] = true;
      else if (lit === "false") out[k] = false;
      else if (lit === "null") out[k] = null;
      else if (lit.trim() !== "" && !Number.isNaN(Number(lit)) && String(Number(lit)) === lit.trim()) out[k] = Number(lit);
      else out[k] = lit;
    }
  }
  return out;
}

function WorkflowInputEditor({
  value,
  onChange,
  readOnly,
  styles,
  sourceFields,
}: {
  value: Record<string, any> | undefined;
  onChange: (next: Record<string, any> | undefined) => void;
  readOnly?: boolean;
  styles: Record<string, string>;
  sourceFields: SimpleField[];
}) {
  const [rows, setRows] = useState(() => normalizeInput(value));

  useEffect(() => {
    setRows(normalizeInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  const commit = (nextRows: typeof rows) => {
    setRows(nextRows);
    const obj = rowsToInput(nextRows);
    onChange(Object.keys(obj).length ? obj : undefined);
  };

  const addRow = () => commit([...(rows || []), { key: "", mode: "field", field: "", literal: "" }]);

  const updateRow = (i: number, patch: Partial<(typeof rows)[number]>) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    commit(next);
  };

  const removeRow = (i: number) => commit(rows.filter((_, idx) => idx !== i));

  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <div className={styles.actionsRow} style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <label className={styles.label} style={{ margin: 0 }}>
          input (workflow)
        </label>

        <button type="button" className={styles.btnAdd} onClick={addRow} disabled={readOnly}>
          + Añadir parámetro
        </button>
      </div>

      {rows.length === 0 && (
        <div className={styles.hint} style={{ marginBottom: 10 }}>
          Define parámetros de entrada para el workflow. Puedes tomar valores del registro actual o usar literales.
        </div>
      )}

      {rows.map((r, i) => (
        <div
          key={`${i}-${r.key}`}
          className={styles.grid}
          style={{
            gridTemplateColumns: "1fr 160px 1fr auto",
            alignItems: "end",
            gap: 10,
            marginTop: 10,
          }}
        >
          <div>
            <label className={styles.label}>Param</label>
            <input
              className={styles.input}
              value={r.key}
              disabled={readOnly}
              onChange={(e) => updateRow(i, { key: e.target.value })}
              placeholder="Ej: obraId, clienteId, iva"
            />
          </div>

          <div>
            <label className={styles.label}>Origen</label>
            <select
              className={styles.input}
              value={r.mode}
              disabled={readOnly}
              onChange={(e) => updateRow(i, { mode: e.target.value as any, field: "", literal: "" })}
            >
              <option value="field">campo</option>
              <option value="literal">literal</option>
            </select>
          </div>

          {r.mode === "field" ? (
            <div>
              <label className={styles.label}>Campo</label>
              <select
                className={styles.input}
                value={r.field}
                disabled={readOnly}
                onChange={(e) => updateRow(i, { field: e.target.value })}
              >
                <option value="">— Selecciona campo —</option>
                {sourceFields.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.label ? `${f.label} (${f.name})` : f.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className={styles.label}>Valor</label>
              <input
                className={styles.input}
                value={r.literal}
                disabled={readOnly}
                onChange={(e) => updateRow(i, { literal: e.target.value })}
                placeholder='Ej: 21 | "pendiente" | true | null'
              />
            </div>
          )}

          <button
            type="button"
            className={styles.btn}
            style={{ background: "#fc0505ff", borderColor: "#ffb3b3", height: 42 }}
            onClick={() => removeRow(i)}
            disabled={readOnly}
          >
            Eliminar
          </button>
        </div>
      ))}
    </div>
  );
}
