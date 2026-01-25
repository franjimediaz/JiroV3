"use client";

import React, { useMemo, useState, useEffect } from "react";
import Selector from "../Selector";

type UiMode = "view" | "edit" | "create";
type UiActionType =
  | "recalculate"
  | "createRelated"
  | "navigate"
  | "duplicate"
  | "external"
  | "workflow";

type SimpleField = { name: string; label?: string };

type WorkflowCatalogItem = {
  key: string;
  label: string;
};

export type DeriveChildSpec = {
  sourceTable: string;
  sourceFkToParent: string;
  targetTable: string;
  targetFkToParent: string;
  map?: Record<string, string>;
  defaults?: Record<string, any>;
};

type DeriveWorkflowInput = {
  kind: "derive";
  source: {
    parentTable: string; // tabla origen padre (slug o db.table)
    parentIdTemplate: string; // default: "{{id}}"
    // legacy (modo rápido 1 hijo). Se mantiene por compatibilidad
    children?: {
      table: string;
      fkToParent: string;
    };
  };
  target: {
    parentTable: string; // tabla destino padre
    // legacy (modo rápido 1 hijo). Se mantiene por compatibilidad
    children?: {
      table: string;
      fkToParent: string;
    };
  };
  maps: {
    parent?: Record<string, string>; // destField -> srcField
    // legacy para 1 hijo (se usará como child[0].map si existe)
    child?: Record<string, string>;
  };
  defaults?: {
    parent?: Record<string, any>;
    // legacy para 1 hijo (se usará como child[0].defaults si existe)
    child?: Record<string, any>;
  };

  // ✅ NUEVO: múltiples hijos (la UI ahora lo edita)
  children?: DeriveChildSpec[];
};

export type UiFormAction = {
  id: string;
  label: string;
  type: UiActionType;
  icon?: string;
  variant?:
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "light"
    | "dark";
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

  // workflow
  workflowKey?: string;
  input?: Record<string, any>;
  after?: { navigateTo?: string };
};

type Props = {
  value: UiFormAction[];
  onChange: (next: UiFormAction[]) => void;
  readOnly?: boolean;

  styles: Record<string, string>;

  IconPicker: React.ComponentType<{ value?: string; onChange: (icon: string) => void }>;
  sourceFields: SimpleField[];

  // ✅ para obtener fields de cualquier tabla (destino/origen)
  getTableFields: (table: string) => SimpleField[];

  // ✅ opcional para precargar fields cuando eliges tabla
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

/* -------------------------------------------------------
   Helpers derive (normalización + compatibilidad legacy)
-------------------------------------------------------- */

function normalizeChildSpec(x: any): DeriveChildSpec {
  const obj = x && typeof x === "object" ? x : {};
  return {
    sourceTable: String(obj.sourceTable || ""),
    sourceFkToParent: String(obj.sourceFkToParent || ""),
    targetTable: String(obj.targetTable || ""),
    targetFkToParent: String(obj.targetFkToParent || ""),
    map: obj.map && typeof obj.map === "object" ? obj.map : {},
    defaults: obj.defaults && typeof obj.defaults === "object" ? obj.defaults : {},
  };
}

function ensureChildrenFromLegacy(p: any): DeriveChildSpec[] {
  // 1) Si ya existe children[] válido, úsalo
  if (Array.isArray(p?.children) && p.children.length > 0) {
    return p.children.map(normalizeChildSpec);
  }

  // 2) Si viene legacy source.children/target.children, conviértelo a children[0]
  const sc = p?.source?.children?.table || "";
  const sfk = p?.source?.children?.fkToParent || "";
  const tc = p?.target?.children?.table || "";
  const tfk = p?.target?.children?.fkToParent || "";

  const legacyMap = p?.maps?.child && typeof p.maps.child === "object" ? p.maps.child : {};
  const legacyDefaults =
    p?.defaults?.child && typeof p.defaults.child === "object" ? p.defaults.child : {};

  const hasAny = Boolean(sc || tc || sfk || tfk) || Object.keys(legacyMap || {}).length > 0 || Object.keys(legacyDefaults || {}).length > 0;
  if (!hasAny) return [];

  return [
    {
      sourceTable: String(sc),
      sourceFkToParent: String(sfk),
      targetTable: String(tc),
      targetFkToParent: String(tfk),
      map: legacyMap || {},
      defaults: legacyDefaults || {},
    },
  ];
}

function makeDeriveInput(prev: any): DeriveWorkflowInput {
  const p = prev && typeof prev === "object" ? prev : {};

  const children = ensureChildrenFromLegacy(p);

  // ✅ También mantenemos legacy source.children/target.children alineados con children[0]
  const first = children[0];

  return {
    kind: "derive",
    source: {
      parentTable: p?.source?.parentTable || "",
      parentIdTemplate: p?.source?.parentIdTemplate || "{{id}}",
      children: first?.sourceTable
        ? { table: first.sourceTable, fkToParent: first.sourceFkToParent || "" }
        : p?.source?.children
        ? {
            table: p?.source?.children?.table || "",
            fkToParent: p?.source?.children?.fkToParent || "",
          }
        : undefined,
    },
    target: {
      parentTable: p?.target?.parentTable || "",
      children: first?.targetTable
        ? { table: first.targetTable, fkToParent: first.targetFkToParent || "" }
        : p?.target?.children
        ? {
            table: p?.target?.children?.table || "",
            fkToParent: p?.target?.children?.fkToParent || "",
          }
        : undefined,
    },
    maps: {
      parent: p?.maps?.parent || {},
      child: p?.maps?.child || {}, // legacy
    },
    defaults: {
      parent: p?.defaults?.parent || {},
      child: p?.defaults?.child || {}, // legacy
    },
    children,
  };
}

function filterFkCandidates(fields: SimpleField[]) {
  return (fields || []).filter((f) => f.name.toLowerCase().endsWith("id"));
}

/* -------------------------------------------------------
   Editor principal de acciones
-------------------------------------------------------- */

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
            workflowKey: "derive.createFromParent",
            input: {
              kind: "derive",
              source: { parentTable: "", parentIdTemplate: "{{id}}" },
              target: { parentTable: "" },
              maps: { parent: {}, child: {} },
              defaults: { parent: {}, child: {} },
              children: [],
            } satisfies DeriveWorkflowInput,
            after: { navigateTo: "" },
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
            {(["createRelated", "navigate", "recalculate", "duplicate", "external", "workflow"] as UiActionType[]).map(
              (t) => (
                <option key={t} value={t}>
                  + {TYPE_LABEL[t]}
                </option>
              )
            )}
          </select>

          <button type="button" className={styles.btnAdd} onClick={() => addFormAction(newActionType)} disabled={readOnly}>
            + Añadir
          </button>
        </div>
      </div>

      {actions.length === 0 && (
        <div className={styles.hint}>No hay acciones configuradas. Añade botones y quedarán agrupados por tipo.</div>
      )}

      {(Object.keys(groups) as UiActionType[]).map((type) => {
        const items = groups[type];
        if (items.length === 0) return null;

        const isOpen = openGroup === type;

        return (
          <div key={type} className={styles.card} style={{ marginTop: 12 }}>
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

              <button type="button" className={styles.btnAdd} onClick={() => addFormAction(type)} disabled={readOnly}>
                + Añadir {TYPE_LABEL[type]}
              </button>
            </div>

            {isOpen && (
              <div style={{ marginTop: 10 }}>
                {items.map(({ idx, action: a }) => {
                  const isActionOpen = openAction === idx;
                  const showIn = (a as any).showIn || (["view", "edit", "create"] as UiMode[]);

                  return (
                    <div key={a.id || idx} className={styles.card} style={{ marginTop: 10 }}>
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
                          <button type="button" className={styles.btn} onClick={() => setOpenAction(isActionOpen ? null : idx)}>
                            {isActionOpen ? "Ocultar" : "Configurar"}
                          </button>

                          <button
                            type="button"
                            className={styles.btn}
                            onClick={() => {
                              const nextType = prompt(`Nuevo type (${Object.keys(TYPE_LABEL).join(", ")}):`, a.type) as
                                | UiActionType
                                | null;

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
                              {["primary", "secondary", "success", "warning", "danger", "info", "light", "dark"].map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div style={{ gridColumn: "1 / -1" }}>
                            <label className={styles.label}>icon (Bootstrap Icons)</label>
                            <IconPicker value={(a as any).icon || ""} onChange={(icon: string) => updateFormAction(idx, { icon })} />
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
                                    confirm: text.trim() ? { ...((a as any).confirm || {}), text } : undefined,
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
                              <div style={{ gridColumn: "1 / -1" }}>
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
                                  onChange={(table: string) => {
                                    const next = (table || "").trim();
                                    const prev = String((a as any).target?.table || "").trim();
                                    if (next === prev) return;
                                    updateFormAction(idx, { target: { ...((a as any).target || {}), table: next } } as any);
                                  }}
                                />
                              </div>

                              <div>
                                <label className={styles.label}>afterCreate.navigateTo</label>
                                <select
                                  className={styles.input}
                                  value={(a as any).afterCreate?.navigateTo || "record"}
                                  onChange={(e) => {
                                    const navigateTo = e.target.value;
                                    updateFormAction(idx, { afterCreate: { ...((a as any).afterCreate || {}), navigateTo } } as any);
                                  }}
                                  disabled={readOnly}
                                >
                                  <option value="record">record</option>
                                  <option value="list">list</option>
                                  <option value="none">none</option>
                                </select>
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
                                placeholder="/tareas/new?obraId={{id}}"
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
                                  onChange={(e) => updateFormAction(idx, { includeChildren: e.target.checked } as any)}
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

                          {/* ---- workflow ---- */}
                          {a.type === "workflow" && (
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

/* -------------------------------------------------------
   FieldMapEditor (igual que el tuyo, sin cambios funcionales)
-------------------------------------------------------- */

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
  sourceLabel: string;
  targetLabel: string;
  sourceFields: SimpleField[];
  targetFields: SimpleField[];
}) {
  const [pairs, setPairs] = useState(() => normalizePairs(value));

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
  const removeRow = (i: number) => commit(pairs.filter((_, idx) => idx !== i));

  return (
    <div style={{ background: "#ffffff07" }}>
      <div className={styles.actionsRow} style={{ justifyContent: "space-between", marginBottom: 8 }}>
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
          <div className={styles.grid}>
            <div>
              <label className={styles.label}>{targetLabel}</label>
              <select className={styles.input} value={p.dest} disabled={readOnly} onChange={(e) => updateRow(i, { dest: e.target.value })}>
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
              <select className={styles.input} value={p.src} disabled={readOnly} onChange={(e) => updateRow(i, { src: e.target.value })}>
                <option value="">— Selecciona campo origen —</option>
                {sourceFields.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.label ? `${f.label} (${f.name})` : f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.actionsRow} style={{ justifyContent: "flex-start" }}>
              <button type="button" className={styles.btnDel} onClick={() => removeRow(i)} disabled={readOnly} title="Eliminar fila">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------
   DefaultsEditor (igual que el tuyo, sin cambios funcionales)
-------------------------------------------------------- */

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

    const raw = p.val;

    if (raw === "true") out[k] = true;
    else if (raw === "false") out[k] = false;
    else if (raw.trim() !== "" && !Number.isNaN(Number(raw)) && String(Number(raw)) === raw.trim()) out[k] = Number(raw);
    else if (raw === "null") out[k] = null;
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

  useEffect(() => {
    setRows(normalizeDefaults(value));
  }, [JSON.stringify(value)]);

  const commit = (nextRows: Array<{ field: string; val: string }>) => {
    setRows(nextRows);
    const obj = pairsToDefaults(nextRows);
    onChange(Object.keys(obj).length ? obj : undefined);
  };

  const addRow = () => commit([...(rows || []), { field: "", val: "" }]);
  const updateRow = (i: number, patch: Partial<{ field: string; val: string }>) => commit(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => commit(rows.filter((_, idx) => idx !== i));

  return (
    <div style={{ background: "#ffffff07" }}>
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
          Tip: usa <code>true</code>, <code>false</code>, <code>null</code> o números.
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
              <select className={styles.input} value={r.field} disabled={readOnly} onChange={(e) => updateRow(i, { field: e.target.value })}>
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
              <input className={styles.input} value={r.val} disabled={readOnly} onChange={(e) => updateRow(i, { val: e.target.value })} placeholder='Ej: "pendiente" | true | 10 | null' />
            </div>

            <div className={styles.actionsRow} style={{ justifyContent: "flex-start" }}>
              <button type="button" className={styles.btnDel} onClick={() => removeRow(i)} disabled={readOnly}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------
   UiFormActionItem: createRelated + workflow
-------------------------------------------------------- */

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
  const targetFieldsForThisAction = targetTable ? getTableFields(targetTable) : [];

  return (
    <>
      {/* ---- createRelated ---- */}
      {a.type === "createRelated" && (
        <>
          <FieldMapEditor
            value={a.fieldMap}
            onChange={(next) => updateFormAction(idx, { fieldMap: next })}
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
                placeholder="Ej: derive.createFromParent"
              />
            )}

            <div className={styles.hint} style={{ marginTop: 6 }}>
              Para derivaciones pro usa <code>derive.createFromParent</code>.
            </div>
          </div>

          {String((a as any).workflowKey || "") === "derive.createFromParent" ? (
            <WorkflowDeriveEditor
              idx={idx}
              action={a}
              readOnly={readOnly}
              styles={styles}
              updateFormAction={updateFormAction}
              getTableFields={getTableFields}
              ensureTableFields={ensureTableFields}
            />
          ) : (
            <WorkflowInputEditor
              value={(a as any).input}
              onChange={(next) => updateFormAction(idx, { input: next } as any)}
              readOnly={readOnly}
              styles={styles}
              sourceFields={sourceFields} // fallback
            />
          )}

          <div style={{ gridColumn: "1 / -1", marginTop: 10 }}>
            <label className={styles.label}>after.navigateTo (opcional)</label>
            <input
              className={styles.input}
              value={(a as any).after?.navigateTo || ""}
              onChange={(e) => updateFormAction(idx, { after: { ...((a as any).after || {}), navigateTo: e.target.value } } as any)}
              disabled={readOnly}
              placeholder="/presupuestos/{{result.parent.id}}?view=1"
            />
          </div>
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------
   WorkflowDeriveEditor: padre + hijos múltiples
-------------------------------------------------------- */

function WorkflowDeriveEditor({
  idx,
  action,
  readOnly,
  styles,
  updateFormAction,
  getTableFields,
  ensureTableFields,
}: {
  idx: number;
  action: UiFormAction;
  readOnly?: boolean;
  styles: Record<string, string>;
  updateFormAction: (idx: number, patch: Partial<UiFormAction>) => void;
  getTableFields: (table: string) => SimpleField[];
  ensureTableFields?: (table: string) => void;
}) {
  const input = useMemo(() => makeDeriveInput((action as any).input), [(action as any).input]);

  const sp = input.source.parentTable;
  const tp = input.target.parentTable;

  // quick child legacy -> children[0]
  const firstChild = (input.children || [])[0];

  const scQuick = firstChild?.sourceTable || input.source.children?.table || "";
  const tcQuick = firstChild?.targetTable || input.target.children?.table || "";

  useEffect(() => {
    if (sp) ensureTableFields?.(sp);
  }, [sp, ensureTableFields]);

  useEffect(() => {
    if (tp) ensureTableFields?.(tp);
  }, [tp, ensureTableFields]);

  const spFields = sp ? getTableFields(sp) : [];
  const tpFields = tp ? getTableFields(tp) : [];

  const patchInput = (patch: Partial<DeriveWorkflowInput>) => {
    // ✅ Si se toca children[], mantenemos legacy source/target children alineados con children[0]
    const nextInput: DeriveWorkflowInput = { ...input, ...patch };
    const ch0 = (nextInput.children || [])[0];

    const nextSource = { ...nextInput.source };
    const nextTarget = { ...nextInput.target };

    if (ch0 && (ch0.sourceTable || ch0.targetTable)) {
      nextSource.children = ch0.sourceTable
        ? { table: ch0.sourceTable, fkToParent: ch0.sourceFkToParent || "" }
        : undefined;
      nextTarget.children = ch0.targetTable
        ? { table: ch0.targetTable, fkToParent: ch0.targetFkToParent || "" }
        : undefined;

      // legacy map/defaults child también se mantienen (para no romper)
      nextInput.maps = { ...(nextInput.maps || {}), child: ch0.map || {} };
      nextInput.defaults = { ...(nextInput.defaults || {}), child: ch0.defaults || {} };
    } else {
      nextSource.children = undefined;
      nextTarget.children = undefined;
    }

    nextInput.source = nextSource;
    nextInput.target = nextTarget;

    updateFormAction(idx, { input: nextInput as any });
  };

  const patchSource = (patch: Partial<DeriveWorkflowInput["source"]>) => patchInput({ source: { ...input.source, ...patch } });
  const patchTarget = (patch: Partial<DeriveWorkflowInput["target"]>) => patchInput({ target: { ...input.target, ...patch } });

  const upsertFirstChildFromQuick = (patch: Partial<DeriveChildSpec>) => {
    const current = normalizeChildSpec(firstChild || {});
    const next = { ...current, ...patch };

    const rest = (input.children || []).slice(1);
    const nextArr =
      next.sourceTable || next.targetTable || next.sourceFkToParent || next.targetFkToParent
        ? [next, ...rest]
        : rest; // si queda vacío, lo quitamos

    patchInput({ children: nextArr });
  };

  return (
    <div style={{ gridColumn: "1 / -2" }}>
      {/* --------- ORIGEN (padre) --------- */}
      <div className={styles.card} style={{ marginTop: 10 }}>
        <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>Origen</div>
          <div className={styles.hint}>Define de dónde se toma la info (padre).</div>
        </div>

        <div className={styles.grid} style={{ marginTop: 10 }}>
          <div style={{ gridColumn: "1 / -7" }}>
            <label className={styles.label}>source.parentTable</label>
            <Selector
              moduleSlug="modulos"
              displayField="nombre"
              valueField="slug"
              value={sp || ""}
              readOnly={readOnly}
              placeholder="— Seleccionar tabla origen —"
              label="Tabla origen (padre)"
              filters={[
                { field: "activo", op: "=", value: true },
                { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] },
              ]}
              sort={[{ field: "orden", direction: "asc" }]}
              onChange={(slugSel: string) => {
                const next = (slugSel || "").trim();
                const prev = (sp || "").trim();
                if (next === prev) return;

                patchInput({
                  source: { ...(input.source || {}), parentTable: next },
                  maps: { ...(input.maps || {}), parent: {} },
                  defaults: { ...(input.defaults || {}), parent: {} },
                });
              }}
            />

            <div className={styles.hint} style={{ marginTop: 6 }}>
              Tip: aquí puedes guardar db.table o slug. Lo importante es que <code>getTableFields()</code> lo soporte.
            </div>
          </div>

          <div style={{ gridColumn: "1 / -7" }}>
            <label className={styles.label}>source.parentIdTemplate</label>
            <input
              className={styles.input}
              value={input.source.parentIdTemplate}
              disabled={readOnly}
              onChange={(e) => patchSource({ parentIdTemplate: e.target.value })}
              placeholder="{{id}}"
            />
            <div className={styles.hint} style={{ marginTop: 6 }}>
              Normalmente será <code>{"{{id}}"}</code>.
            </div>
          </div>
        </div>
      </div>

      {/* --------- DESTINO (padre) --------- */}
      <div className={styles.card} style={{ marginTop: 10 }}>
        <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>Destino</div>
          <div className={styles.hint}>Define dónde se crean los registros (padre).</div>
        </div>

        <div className={styles.grid} style={{ marginTop: 10 }}>
          <div style={{ gridColumn: "1 / -7" }}>
            <label className={styles.label}>target.parentTable</label>

            <Selector
              moduleSlug="modulos"
              displayField="nombre"
              valueField="slug"
              value={tp || ""}
              readOnly={readOnly}
              placeholder="— Seleccionar tabla destino (padre) —"
              label="Tabla destino (padre) - target.parentTable"
              filters={[
                { field: "activo", op: "=", value: true },
                { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] },
              ]}
              sort={[{ field: "orden", direction: "asc" }]}
              onChange={(slugSel: string) => {
                const next = (slugSel || "").trim();
                const prev = (tp || "").trim();
                if (next === prev) return;

                patchInput({
                  target: { ...(input.target || {}), parentTable: next },
                  maps: { ...(input.maps || {}), parent: {} },
                  defaults: { ...(input.defaults || {}), parent: {} },
                });
              }}
            />
          </div>
        </div>
      </div>

      {/* --------- MAPEOS PADRE --------- */}
      <div className={styles.card} style={{ marginTop: 10 }}>
        <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>Mapeo de campos</div>
          <div className={styles.hint}>Destino ← Origen (campo a campo).</div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className={styles.hint} style={{ marginBottom: 8 }}>
            <b>Mapeo padre</b> (de <code>{sp || "source.parentTable"}</code> a <code>{tp || "target.parentTable"}</code>)
          </div>

          <FieldMapEditor
            value={input.maps.parent}
            onChange={(next) => patchInput({ maps: { ...input.maps, parent: next || {} } })}
            readOnly={readOnly}
            styles={styles}
            targetLabel={`Destino (${tp || "—"})`}
            sourceLabel={`Origen (${sp || "—"})`}
            sourceFields={spFields}
            targetFields={tpFields}
          />
        </div>
      </div>

      {/* --------- DEFAULTS PADRE --------- */}
      <div className={styles.card} style={{ marginTop: 10 }}>
        <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>Defaults</div>
          <div className={styles.hint}>Valores por defecto en destino.</div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className={styles.hint} style={{ marginBottom: 8 }}>
            <b>Defaults padre</b> (en <code>{tp || "target.parentTable"}</code>)
          </div>

          <DefaultsEditor
            value={input.defaults?.parent}
            onChange={(next) => patchInput({ defaults: { ...(input.defaults || {}), parent: next } })}
            readOnly={readOnly}
            styles={styles}
            targetLabel={`Destino (${tp || "—"})`}
            targetFields={tpFields}
          />
        </div>
      </div>

      {/* --------- MODO RÁPIDO (legacy 1 hijo) --------- */}
      <div className={styles.card} style={{ marginTop: 10 }}>
        <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>Hijo (modo rápido)</div>
          <div className={styles.hint}>
            Compatible con lo anterior. Esto edita <code>children[0]</code>.
          </div>
        </div>

        <div className={styles.grid} style={{ marginTop: 10 }}>
          <div style={{ gridColumn: "1 / -7" }}>
            <Selector
              moduleSlug="modulos"
              displayField="nombre"
              valueField="slug"
              value={scQuick || ""}
              readOnly={readOnly}
              placeholder="— Seleccionar tabla hijos (origen) —"
              label="Tabla hijos (origen)"
              filters={[
                { field: "activo", op: "=", value: true },
                { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] },
              ]}
              sort={[{ field: "orden", direction: "asc" }]}
              onChange={(slugSel: string) => {
                const next = (slugSel || "").trim();
                if (next === (scQuick || "").trim()) return;
                upsertFirstChildFromQuick({ sourceTable: next, sourceFkToParent: "" });
              }}
            />
          </div>

          <div style={{ gridColumn: "1 / -7" }}>
            <Selector
              moduleSlug="modulos"
              displayField="nombre"
              valueField="slug"
              value={tcQuick || ""}
              readOnly={readOnly}
              placeholder="— Seleccionar tabla hijos (destino) —"
              label="Tabla hijos (destino)"
              filters={[
                { field: "activo", op: "=", value: true },
                { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] },
              ]}
              sort={[{ field: "orden", direction: "asc" }]}
              onChange={(slugSel: string) => {
                const next = (slugSel || "").trim();
                if (next === (tcQuick || "").trim()) return;
                upsertFirstChildFromQuick({ targetTable: next, targetFkToParent: "" });
              }}
            />
          </div>
        </div>
      </div>

      {/* --------- HIJOS MÚLTIPLES (NUEVO) --------- */}
      <DeriveChildrenEditor
        styles={styles}
        readOnly={readOnly}
        input={input}
        patchInput={patchInput}
        getTableFields={getTableFields}
        ensureTableFields={ensureTableFields}
      />
    </div>
  );
}

/* -------------------------------------------------------
   Editor de múltiples hijos
-------------------------------------------------------- */

function DeriveChildrenEditor({
  input,
  patchInput,
  readOnly,
  styles,
  getTableFields,
  ensureTableFields,
}: {
  input: DeriveWorkflowInput;
  patchInput: (patch: Partial<DeriveWorkflowInput>) => void;
  readOnly?: boolean;
  styles: Record<string, string>;
  getTableFields: (table: string) => SimpleField[];
  ensureTableFields?: (table: string) => void;
}) {
  const children = Array.isArray(input.children) ? input.children : [];

  const addChild = () => {
    const next = [
      ...children,
      {
        sourceTable: "",
        sourceFkToParent: "",
        targetTable: "",
        targetFkToParent: "",
        map: {},
        defaults: {},
      } as DeriveChildSpec,
    ];
    patchInput({ children: next });
  };

  const updateChild = (i: number, patch: Partial<DeriveChildSpec>) => {
    const next = children.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    patchInput({ children: next });
  };

  const removeChild = (i: number) => {
    const next = children.filter((_, idx) => idx !== i);
    patchInput({ children: next });
  };

  // precarga campos de tablas usadas
  useEffect(() => {
    children.forEach((c) => {
      if (c.sourceTable) ensureTableFields?.(c.sourceTable);
      if (c.targetTable) ensureTableFields?.(c.targetTable);
    });
  }, [JSON.stringify(children.map((c) => [c.sourceTable, c.targetTable])), ensureTableFields]);

  return (
    <div className={styles.card} style={{ marginTop: 10 }}>
      <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700 }}>Derivaciones hijas (múltiples)</div>
        <button type="button" className={styles.btnAdd} onClick={addChild} disabled={readOnly}>
          + Añadir hijo
        </button>
      </div>

      <div className={styles.hint} style={{ marginTop: 6 }}>
        Aquí defines múltiples “copias” (source → target) para subtablas distintas, cada una con su FK, mapeos y defaults.
      </div>

      {children.length === 0 && (
        <div className={styles.hint} style={{ marginTop: 10 }}>
          No hay hijos configurados. Si tu caso solo tiene 1, puedes usar el “modo rápido” o añadirlo aquí.
        </div>
      )}

      {children.map((c, i) => {
        const sourceFields = c.sourceTable ? getTableFields(c.sourceTable) : [];
        const targetFields = c.targetTable ? getTableFields(c.targetTable) : [];

        const fkSourceCandidates = filterFkCandidates(sourceFields);
        const fkTargetCandidates = filterFkCandidates(targetFields);

        return (
          <div key={`${i}-${c.sourceTable}-${c.targetTable}`} className={styles.card} style={{ marginTop: 12 }}>
            <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700 }}>Hijo #{i + 1}</div>
              <button
                type="button"
                className={styles.btn}
                style={{ background: "#fc0505ff", borderColor: "#ffb3b3" }}
                onClick={() => removeChild(i)}
                disabled={readOnly}
              >
                Eliminar
              </button>
            </div>

            <div className={styles.grid} style={{ marginTop: 10 }}>
              <div style={{ gridColumn: "1 / -7" }}>
                <Selector
                  moduleSlug="modulos"
                  displayField="nombre"
                  valueField="slug"
                  value={c.sourceTable || ""}
                  readOnly={readOnly}
                  placeholder="— Seleccionar tabla origen (hijo) —"
                  label="sourceTable"
                  filters={[
                    { field: "activo", op: "=", value: true },
                    { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] },
                  ]}
                  sort={[{ field: "orden", direction: "asc" }]}
                  onChange={(slugSel: string) => {
                    const next = (slugSel || "").trim();
                    if (next === (c.sourceTable || "").trim()) return;
                    updateChild(i, { sourceTable: next, sourceFkToParent: "" });
                  }}
                />
              </div>

              <div style={{ gridColumn: "1 / -7" }}>
                <label className={styles.label}>sourceFkToParent</label>
                <select
                  className={styles.input}
                  value={c.sourceFkToParent || ""}
                  disabled={readOnly || !c.sourceTable}
                  onChange={(e) => updateChild(i, { sourceFkToParent: e.target.value })}
                >
                  <option value="">— Selecciona FK (hijo → padre origen) —</option>
                  {(fkSourceCandidates.length ? fkSourceCandidates : sourceFields).map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.label ? `${f.label} (${f.name})` : f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: "1 / -7" }}>
                <Selector
                  moduleSlug="modulos"
                  displayField="nombre"
                  valueField="slug"
                  value={c.targetTable || ""}
                  readOnly={readOnly}
                  placeholder="— Seleccionar tabla destino (hijo) —"
                  label="targetTable"
                  filters={[
                    { field: "activo", op: "=", value: true },
                    { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] },
                  ]}
                  sort={[{ field: "orden", direction: "asc" }]}
                  onChange={(slugSel: string) => {
                    const next = (slugSel || "").trim();
                    if (next === (c.targetTable || "").trim()) return;
                    updateChild(i, { targetTable: next, targetFkToParent: "" });
                  }}
                />
              </div>

              <div style={{ gridColumn: "1 / -7" }}>
                <label className={styles.label}>targetFkToParent</label>
                <select
                  className={styles.input}
                  value={c.targetFkToParent || ""}
                  disabled={readOnly || !c.targetTable}
                  onChange={(e) => updateChild(i, { targetFkToParent: e.target.value })}
                >
                  <option value="">— Selecciona FK (hijo → padre destino) —</option>
                  {(fkTargetCandidates.length ? fkTargetCandidates : targetFields).map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.label ? `${f.label} (${f.name})` : f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className={styles.hint} style={{ marginBottom: 8 }}>
                <b>Mapeo hijo</b> (de <code>{c.sourceTable || "sourceTable"}</code> a <code>{c.targetTable || "targetTable"}</code>)
              </div>

              <FieldMapEditor
                value={c.map}
                onChange={(next) => updateChild(i, { map: next || {} })}
                readOnly={readOnly}
                styles={styles}
                targetLabel={`Destino (${c.targetTable || "—"})`}
                sourceLabel={`Origen (${c.sourceTable || "—"})`}
                sourceFields={sourceFields}
                targetFields={targetFields}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <div className={styles.hint} style={{ marginBottom: 8 }}>
                <b>Defaults hijo</b> (en <code>{c.targetTable || "targetTable"}</code>)
              </div>

              <DefaultsEditor
                value={c.defaults}
                onChange={(next) => updateChild(i, { defaults: next || {} })}
                readOnly={readOnly}
                styles={styles}
                targetLabel={`Destino (${c.targetTable || "—"})`}
                targetFields={targetFields}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------
   WorkflowInputEditor (genérico) - tu versión
-------------------------------------------------------- */

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
  workflowKey,
  value,
  onChange,
  readOnly,
  styles,
  sourceFields,
}: {
  workflowKey?: string;
  value: Record<string, any> | undefined;
  onChange: (next: Record<string, any> | undefined) => void;
  readOnly?: boolean;
  styles: Record<string, string>;
  sourceFields: SimpleField[];
}) {
  const [rows, setRows] = useState(() => normalizeInput(value));

  useEffect(() => {
    setRows(normalizeInput(value));
  }, [JSON.stringify(value)]);

  const commit = (nextRows: typeof rows) => {
    setRows(nextRows);
    const obj = rowsToInput(nextRows);
    onChange(Object.keys(obj).length ? obj : undefined);
  };

  const addRow = () => commit([...(rows || []), { key: "", mode: "field", field: "", literal: "" }]);
  const updateRow = (i: number, patch: Partial<(typeof rows)[number]>) => commit(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
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
            <input className={styles.input} value={r.key} disabled={readOnly} onChange={(e) => updateRow(i, { key: e.target.value })} placeholder="Ej: obraId, clienteId, iva" />
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
              <select className={styles.input} value={r.field} disabled={readOnly} onChange={(e) => updateRow(i, { field: e.target.value })}>
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
              <input className={styles.input} value={r.literal} disabled={readOnly} onChange={(e) => updateRow(i, { literal: e.target.value })} placeholder='Ej: 21 | "pendiente" | true | null' />
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
