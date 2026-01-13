"use client";

import { useState, useTransition, useEffect} from "react";
import styles from "./modulo-detalle.module.css";
import  Selector from "../Selector";
import {IconPicker} from "@repo/ui";
import type { Field as FieldSchema, FieldType, ModuleSchema, Field, FormSection, UiTab, FormAction} from "@repo/types";
import {VALID_FIELD_TYPES} from "@repo/types";
import { FieldPickerModal, type TableField } from "../modals/FieldPickerModal";
import {FieldRow} from "./FieldRow"

type PickTarget = "columns" | "groupByField" | "parentFilterField" | "sumField";


const isPickMultiple = (target: PickTarget) => target === "columns";

const getPickValue = (target: PickTarget, t: any) => {
  switch (target) {
    case "columns":
      return extractColumnFields(t.config?.columns); // 👈 usa el helper bueno
    case "groupByField":
      return t.config?.grouping?.groupByField || (t.config?.groupBy || [])[0] || "";
    case "parentFilterField":
      return (t.config?.filters?.[0]?.field as string) || "";
    case "sumField":
      return t.config?.totals?.sumField || "";
    default:
      return "";
  }
};

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

// —— Subcomponentes UI simples ————————————————————————————————
function getSectionFieldSet(sections: Array<{ fields: string[] }>) {
  const set = new Set<string>();
  for (const s of sections) {
    for (const name of s.fields || []) set.add(name);
  }
  return set;
}
function extractColumnFields(columns: any): string[] {
  if (!columns) return [];

  // Formato nuevo: [{field,label,...}]
  if (Array.isArray(columns) && columns[0] && typeof columns[0] === "object") {
    return columns.map((c: any) => String(c.field)).filter(Boolean);
  }

  // Legacy: string[]
  if (Array.isArray(columns)) {
    return columns.map((x: any) => String(x)).filter(Boolean);
  }

  return [];
}

function buildColumnsObjects(selectedNames: string[], availableFields: TableField[]) {
  const byName = new Map(availableFields.map((f) => [f.name, f]));
  return selectedNames.map((name) => ({
    field: name,
    label: byName.get(name)?.label || name,
  }));
}

// Helpers para el selector de modo
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.card} style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </div>
  );
}

// —— Form principal ————————————————————————————————————————————————


export default function ModuloForm({
  initialData,
  mode,
  onSave,
  loadFieldsForTable,
}: {
  initialData: any;
  mode: "view" | "edit" | "create";
  onSave: (fd: FormData) => Promise<{ ok: boolean; detail: string; id?: string }>;
  loadFieldsForTable?: (tableSlug: string) => Promise<{ name: string; label?: string }[]>;
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
  const [pickOpen, setPickOpen] = useState(false);
  const [pickTarget, setPickTarget] = useState<PickTarget>("columns");
  const [fieldsByTable, setFieldsByTable] = useState<Record<string, { name: string; label?: string }[]>>({});
  const [loadingByTable, setLoadingByTable] = useState<Record<string, boolean>>({});

  const ensureFieldsLoaded = async (tableSlug: string) => {
    if (!tableSlug) return;
    if (!loadFieldsForTable) return;

    // cache
    if (fieldsByTable[tableSlug]) return;

    setLoadingByTable((p) => ({ ...p, [tableSlug]: true }));
    try {
      const fields = await loadFieldsForTable(tableSlug);
      setFieldsByTable((p) => ({ ...p, [tableSlug]: Array.isArray(fields) ? fields : [] }));
    } catch (e) {
      console.error("loadFieldsForTable failed:", tableSlug, e);
      setFieldsByTable((p) => ({ ...p, [tableSlug]: [] }));
    } finally {
      setLoadingByTable((p) => ({ ...p, [tableSlug]: false }));
    }
  };
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

  // =========================Button Actions
  const getFormActions = (): FormAction[] => {
    const uiAny = (propsObj.ui || {}) as any;
    return Array.isArray(uiAny.formActions) ? uiAny.formActions : [];
  };

  const setFormActions = (actions: FormAction[]) => {
    const ui = { ...(propsObj.ui || {}), formActions: actions as any };
    const next = { ...propsObj, ui };
    setPropsObj(next);
    setRawText(JSON.stringify(next, null, 2));
  };

  const addFormAction = () => {
    const list = getFormActions();
    const n = list.length + 1;

    const newAction: FormAction = {
      id: `action_${n}`,
      type: "recalculate",
      label: `Acción ${n}`,
      icon: "bi bi-lightning",
      variant: "secondary",
      showIn: ["view", "edit", "create"],
    };

    setFormActions([...list, newAction]);
  };

  const updateFormAction = (idx: number, patch: Partial<FormAction>) => {
    const list = getFormActions();
    if (!list[idx]) return;
    const next = [...list];
    next[idx] = { ...(next[idx] as any), ...(patch as any) } as FormAction;
    setFormActions(next);
  };

  const removeFormAction = (idx: number) => {
    const list = getFormActions();
    setFormActions(list.filter((_, i) => i !== idx));
  };



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
  //const [activeTabId, setActiveTabId] = useState<string>(() => getTabs()[0]?.id || "");


  const readOnlyAttr = { disabled: readOnly } as const;
  const [activeTabId, setActiveTabId] = useState<string>("");
      useEffect(() => {
      const tabs = getTabs();
      if (!tabs.length) {
        if (activeTabId) setActiveTabId("");
        return;
      }
      // si no hay activa o ya no existe, seleccionar la primera
      if (!activeTabId || !tabs.some((t) => t.id === activeTabId)) {
        setActiveTabId(tabs[0].id);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propsObj.ui]);



  return (
    <form className={styles.card} onSubmit={onSubmit}>
      {/* Cabecera */}
      <div className={styles.card}>
        <div className={styles.grid}>
          
          {/* Name */}
          <div>
            <label className={styles.label}>Nombre</label>
            <input
              className={styles.input}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              {...readOnlyAttr}
            />
          </div>
          {/* Slug/Xml */}
          <div>
            <label className={styles.label}>Slug/Xml</label>
            <input
              className={styles.input}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              {...readOnlyAttr}
            />
          </div>
          {/* Tipo */}
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
          {/* Orden */}
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
          {/* Orden */}
          <div>
            <label className={styles.label}>Ruta (route)</label>
            <input
              className={styles.input}
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              {...readOnlyAttr}
            />
          </div>
          {/* Parent */}
          <div>
            <label className={styles.label}>Parent (carpeta módulo)</label>

            <Selector
              moduleSlug="modulos"          
              displayField="nombre"
              valueField="id"
              value={parentId ?? ""}
              readOnly={readOnly}
              placeholder="— Sin parent —"
              label="Selecciona el parent"
              filters={[
                { field: "activo", op: "=", value: true },
                { field: "tipo", op: "=", value: "carpeta" }, // solo permite carpetas
                // evitar que un módulo sea parent de sí mismo
                ...(initialData?.id ? [{ field: "id", op: "!=", value: initialData.id }] : []),
              ]}
              sort={[{ field: "orden", direction: "asc" }]}
              onChange={(nextId: string) => setParentId(nextId ? nextId : null)}
            />
          </div>
          {/* Activo */}
          <div className={styles.switchRow}>
            <label className={styles.label}>Activo</label>
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              {...readOnlyAttr}
            />
          </div>
          {/* Sidebar*/}
          <div className={styles.switchRow}>
            <label className={styles.label}>Sidebar</label>
            <input
              type="checkbox"
              checked={sidebar}
              onChange={(e) => setSidebar(e.target.checked)}
              {...readOnlyAttr}
            />
          </div>
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
            {/* Color */}
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
            {/* ui.icon */}
            <div>
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
          <div style={{ gridColumn: "1 / -1", marginTop: 12 }}>
          <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600 }}>ui.formActions</div>

            <button
              type="button"
              className={styles.btn}
              onClick={addFormAction}
              disabled={readOnly}
            >
              + Añadir botón
            </button>
          </div>

          {getFormActions().length === 0 && (
            <div className={styles.hint}>
              No hay acciones configuradas. Añade botones para “crear relacionado”, “navegar”, “recalcular”, “duplicar”, etc.
            </div>
          )}

          {getFormActions().map((a, idx) => {
            // helpers rápidos para JSON (fieldMap/defaults)
            const safeJson = (v: any) => (v ? JSON.stringify(v, null, 2) : "");
            const parseJson = (txt: string) => {
              if (!txt.trim()) return undefined;
              return JSON.parse(txt);
            };

            return (
              <div key={a.id || idx} className={styles.card} style={{ marginTop: 12 }}>
                <div className={styles.grid}>
                  
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
                    <label className={styles.label}>type</label>
                    <select
                      className={styles.input}
                      value={a.type}
                      onChange={(e) => updateFormAction(idx, { type: e.target.value as any })}
                      disabled={readOnly}
                    >
                      <option value="recalculate">recalculate</option>
                      <option value="createRelated">createRelated</option>
                      <option value="navigate">navigate</option>
                      <option value="duplicate">duplicate</option>
                      <option value="external">external</option>
                    </select>
                  </div>

                  <div>
                    <label className={styles.label}>variant</label>
                    <select
                      className={styles.input}
                      value={(a as any).variant || "secondary"}
                      onChange={(e) => updateFormAction(idx, { variant: e.target.value as any })}
                      disabled={readOnly}
                    >
                      {["primary","secondary","success","warning","danger","info","light","dark"].map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
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
                        const showIn = (a as any).showIn || ["view", "edit", "create"];
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
                            <span className={styles.label} style={{ margin: 0 }}>{m}</span>
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
                        updateFormAction(idx, {
                          confirm: text.trim()
                            ? { ...((a as any).confirm || {}), text }
                            : undefined,
                        } as any);
                      }}
                      disabled={readOnly}
                      placeholder="Ej: ¿Seguro que quieres generar el presupuesto?"
                    />
                  </div>

                  {/* ---- Tipo: createRelated ---- */}
                  {a.type === "createRelated" && (
                    <>
                      <div>
                        <label className={styles.label}>target.table</label>
                        <input
                          className={styles.input}
                          value={(a as any).target?.table || ""}
                          onChange={(e) => {
                            const table = e.target.value;
                            updateFormAction(idx, { target: { ...((a as any).target || {}), table } } as any);
                          }}
                          disabled={readOnly}
                          placeholder="Ej: tareas"
                        />
                      </div>

                      <div>
                        <label className={styles.label}>afterCreate.navigateTo</label>
                        <select
                          className={styles.input}
                          value={(a as any).afterCreate?.navigateTo || "record"}
                          onChange={(e) => {
                            const navigateTo = e.target.value;
                            updateFormAction(idx, {
                              afterCreate: { ...((a as any).afterCreate || {}), navigateTo },
                            } as any);
                          }}
                          disabled={readOnly}
                        >
                          <option value="record">record</option>
                          <option value="list">list</option>
                          <option value="none">none</option>
                        </select>
                      </div>

                      <div style={{ gridColumn: "1 / -1" }}>
                        <label className={styles.label}>fieldMap (JSON) — {"{destino: \"origen\"}"}</label>
                        <textarea
                          className={styles.textarea}
                          value={safeJson((a as any).fieldMap)}
                          disabled={readOnly}
                          rows={4}
                          onChange={(e) => {
                            try {
                              const obj = parseJson(e.target.value);
                              updateFormAction(idx, { fieldMap: obj } as any);
                            } catch {
                              // no rompas el formulario: si está mal, no actualices
                            }
                          }}
                          placeholder={`{\n  "obraId": "id",\n  "clienteId": "clienteId"\n}`}
                        />
                      </div>

                      <div style={{ gridColumn: "1 / -1" }}>
                        <label className={styles.label}>defaults (JSON)</label>
                        <textarea
                          className={styles.textarea}
                          value={safeJson((a as any).defaults)}
                          disabled={readOnly}
                          rows={4}
                          onChange={(e) => {
                            try {
                              const obj = parseJson(e.target.value);
                              updateFormAction(idx, { defaults: obj } as any);
                            } catch {}
                          }}
                          placeholder={`{\n  "estado": "pendiente"\n}`}
                        />
                      </div>
                    </>
                  )}

                  {/* ---- Tipo: navigate ---- */}
                  {a.type === "navigate" && (
                    <>
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
                    </>
                  )}

                  {/* ---- Tipo: duplicate ---- */}
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

                  {/* ---- Tipo: external (placeholder) ---- */}
                  {a.type === "external" && (
                    <div style={{ gridColumn: "1 / -1" }} className={styles.hint}>
                      Acción externa (PDF/email/print) — la dejamos lista para implementar más adelante.
                    </div>
                  )}
                </div>

                <div className={styles.actionsRow} style={{ justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className={styles.btnDanger}
                    onClick={() => removeFormAction(idx)}
                    disabled={readOnly}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })}
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

        {getTabs().length > 0 && (
            <div className={styles.card} style={{ marginTop: 12 }}>
              <div className={styles.grid}>
                <div className="full">
                  <label className={styles.label}>Pestaña activa</label>
                  <select
                    className={styles.input}
                    value={activeTabId || getTabs()[0]?.id}
                    onChange={(e) => setActiveTabId(e.target.value)}
                    disabled={readOnly}
                  >
                    {getTabs().map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} — ({t.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}


        {(() => {
                  const tabs = getTabs();
                  if (tabs.length === 0) return null;

                  const idx = Math.max(
                    0,
                    tabs.findIndex((t) => t.id === (activeTabId || tabs[0].id))
                  );

                  const t = tabs[idx];
                  const updateTab = (updater: (prev: UiTab) => UiTab) => {
                    const nextTabs = [...tabs];
                    nextTabs[idx] = updater(nextTabs[idx]);
                    setTabs(nextTabs);
                    const nextId = nextTabs[idx]?.id;
                    if (nextId && nextId !== activeTabId) setActiveTabId(nextId);
                  };

                  const removeTab = () => {
                    const next = tabs.filter((_, i) => i !== idx);
                    setTabs(next);
                    setActiveTabId(next[0]?.id || "");
                  };

                  return (
                    <div key={t.id} className={styles.card} style={{ marginTop: 12 }}>

                      <div className={styles.grid}>
                          {/* ID */}
                          <div>
                            <label className={styles.label}>ID</label>
                            <input
                              className={styles.input}
                              value={t.id}
                              onChange={(e) => updateTab((prev) => ({ ...prev, id: e.target.value }))}
                              disabled={readOnly}
                            />
                          </div>
                          {/* Label */}
                          <div>
                            <label className={styles.label}>Label</label>
                            <input
                              className={styles.input}
                              value={t.label}
                              onChange={(e) => updateTab((prev) => ({ ...prev, label: e.target.value }))}
                              disabled={readOnly}
                            />
                          </div>
                          {/* Tipo */}
                          <div>
                            <label className={styles.label}>Tipo</label>
                            <select
                              className={styles.input}
                              value={t.type}
                              onChange={(e) => {
                                const nextType = e.target.value as UiTab["type"];

                                updateTab((prev) => {
                                  if (nextType === "form") {
                                    const keepSections = prev.type === "form" ? prev.config?.formSections ?? [] : [];
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

                                  return {
                                    id: prev.id,
                                    label: prev.label,
                                    type: "calendar",
                                    config: { sourceTable: "", startField: "", endField: "", titleField: "", colorField: "" },
                                  };
                                });
                              }}
                              disabled={readOnly}
                            >
                              <option value="form">Formulario</option>
                              <option value="treeview">Tree View</option>
                              <option value="calendar">Calendario</option>
                            </select>
                          </div>
                      </div>
                        {/* Config TreeView */}
                        {t.type === "treeview" && (
                          <div className={styles.card} style={{ marginTop: 12 }}>
                            <h4 style={{ marginTop: 0 }}>Config TreeView</h4>

                            <div className={styles.grid}>
                              <div>
                                <label className={styles.label}>Tabla destino (source.table)</label>

                                <Selector
                                  moduleSlug="modulos"
                                  displayField="nombre"
                                  valueField="slug"
                                  value={t.config?.source?.table || t.config?.sourceTable || ""}
                                  readOnly={readOnly}
                                  placeholder="— Seleccionar —"
                                  label="Selecciona la tabla destino"
                                  filters={[
                                    { field: "activo", op: "=", value: true },
                                    { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] },
                                  ]}
                                  sort={[{ field: "orden", direction: "asc" }]}
                                  onChange={(slugSel: string) =>
                                    updateTab((prev) => {
                                      if (prev.type !== "treeview") return prev;

                                      const table = slugSel || "";
                                      ensureFieldsLoaded(table);

                                      return {
                                        ...prev,
                                        config: {
                                          ...(prev.config || {}),

                                          // ✅ nuevo
                                          source: { ...(prev.config?.source || {}), table },

                                          // ✅ legacy
                                          sourceTable: table,
                                        },
                                      };
                                    })
                                  }
                                />
                              </div>

                              <div>
                                
                                  <label className={styles.label}>columns</label>

                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <input
                                      className={styles.input}
                                      value={extractColumnFields(t.config?.columns).join(", ")}
                                      readOnly
                                      disabled={readOnly}
                                      placeholder="Sin columnas seleccionadas"
                                    />

                                    <button
                                      type="button"
                                      className="btn btn-outline-light"
                                      onClick={() =>{ 
                                        const table = t.config?.source?.table || t.config?.sourceTable || "";
                                        if (table) ensureFieldsLoaded(table);
                                        setPickTarget("columns");
                                        setPickOpen(true)
                                      }}
                                      disabled={readOnly}
                                      
                                    >
                                      Elegir…
                                    </button>
                              </div>

                                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75}}>
                                    Se guardará como <code>columns: [{"{ field, label }"}]</code>
                                  </div>

                            

                  {(() => {
                              const sourceTable = t.config?.source?.table || t.config?.sourceTable || "";
                              const availableFields = fieldsByTable[sourceTable] || [];
                              const fieldsLoading = !!loadingByTable[sourceTable];
                              const applyPick = (target: PickTarget, selected: any, availableFields: any[]) => {
                          updateTab((prev) => {
                            if (prev.type !== "treeview") return prev;

                            if (target === "columns") {
                              const selectedNames = Array.isArray(selected) ? selected : [];
                              return {
                                ...prev,
                                config: {
                                  ...(prev.config || {}),
                                  columns: buildColumnsObjects(selectedNames, availableFields),
                                },
                              };
                            }

                            if (target === "groupByField") {
                              const groupByField = String(selected || "").trim();
                              return {
                                ...prev,
                                config: {
                                  ...(prev.config || {}),
                                  grouping: { ...(prev.config?.grouping || {}), groupByField },
                                  groupBy: groupByField ? [groupByField] : [],
                                },
                              };
                            }

                            if (target === "parentFilterField") {
                              const field = String(selected || "").trim();
                              return {
                                ...prev,
                                config: {
                                  ...(prev.config || {}),
                                  filters: field ? [{ op: "eq", field, valueFromParent: "id" }] : [],
                                },
                              };
                            }

                            if (target === "sumField") {
                              const sumField = String(selected || "").trim();
                              return {
                                ...prev,
                                config: {
                                  ...(prev.config || {}),
                                  totals: sumField
                                    ? {
                                        ...(prev.config?.totals || {}),
                                        enabled: true,
                                        sumField,
                                        showGroupTotals: true,
                                        showGrandTotal: true,
                                      }
                                    : { enabled: false, sumField: "" },
                                },
                              };
                            }

                            return prev;
                          });
                        };

                              if (!sourceTable) {
                                return <div className={styles.help}>Selecciona primero una tabla destino…</div>;
                              }

                              return (
                                <>
                                  <div>
                                    <label className={styles.label}>groupBy (campo)</label>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                      <input
                                        className={styles.input}
                                        value={t.config?.grouping?.groupByField || (t.config?.groupBy || [])[0] || ""}
                                        readOnly
                                        disabled={readOnly}
                                      />
                                      <button
                                        type="button"
                                        className="btn btn-outline-light"
                                        disabled={readOnly}
                                        onClick={() => {
                                          setPickTarget("groupByField");
                                          setPickOpen(true);
                                        }}
                                      >
                                        Elegir…
                                      </button>
                                    </div>
                                  </div>

                                  <div>
                                    <label className={styles.label}>Filtro por padre (campo FK en source)</label>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                      <input
                                        className={styles.input}
                                        value={(t.config?.filters?.[0]?.field as string) || ""}
                                        readOnly
                                        disabled={readOnly}
                                      />
                                      <button
                                        type="button"
                                        className="btn btn-outline-light"
                                        disabled={readOnly}
                                        onClick={() => {
                                          setPickTarget("parentFilterField");
                                          setPickOpen(true);
                                        }}
                                      >
                                        Elegir…
                                      </button>
                                    </div>
                                    <div className={styles.help}>Se aplicará: field = parentRecord.id</div>
                                  </div>

                                  <div>
                                    <label className={styles.label}>Sum Field (opcional)</label>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                      <input
                                        className={styles.input}
                                        value={t.config?.totals?.sumField || ""}
                                        readOnly
                                        disabled={readOnly}
                                      />
                                      <button
                                        type="button"
                                        className="btn btn-outline-light"
                                        disabled={readOnly}
                                        onClick={() => {
                                          setPickTarget("sumField");
                                          setPickOpen(true);
                                        }}
                                      >
                                        Elegir…
                                      </button>
                                    </div>
                                  </div>

                                  <FieldPickerModal
                                    open={pickOpen}
                                    title={
                                      pickTarget === "columns"
                                        ? "Seleccionar columnas"
                                        : pickTarget === "groupByField"
                                        ? "Seleccionar campo groupBy"
                                        : pickTarget === "parentFilterField"
                                        ? "Seleccionar campo FK (filtro padre)"
                                        : "Seleccionar sumField"
                                    }
                                    multiple={isPickMultiple(pickTarget)}
                                    value={getPickValue(pickTarget, t)}
                                    fields={availableFields}
                                    loading={fieldsLoading}
                                    onClose={() => setPickOpen(false)}
                                    onApply={(next) => applyPick(pickTarget, next, availableFields)}
                                  />
                                </>
                              );
                            })()}
                        <div>
                      </div>
                    </div>
                  </div>
                        <div className="small text-muted mt-2">
                          Nota: el TreeView genérico espera <code>source.table</code>, <code>grouping.groupByField</code> y{" "}
                          <code>columns</code> como objetos.
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
                        {/* Formulario por pestaña */}
                        {t.type === "form" && (
                            <div className={styles.card} style={{ marginTop: 12 }}>
                              <div className={styles.actionsRow} style={{ justifyContent: "space-between", gap: 12 }}>
                                <div>
                                  <h4 style={{ margin: 0 }}>Formulario</h4>
                                  <div className={styles.hint} style={{ marginTop: 4 }}>
                                    Pestaña: <strong>{t.label}</strong>
                                  </div>
                                </div>

                                <div className={styles.actionsRow} style={{ justifyContent: "flex-end", gap: 8 }}>
                                  <button
                                    type="button"
                                    className={styles.btnAdd}
                                    onClick={addField}
                                    disabled={readOnly}
                                    title="Añade un campo global (aparece en el dropdown de campos)"
                                  >
                                    + Añadir campo (global)
                                  </button>

                                  <button
                                    type="button"
                                    className={styles.btnAdd}
                                    onClick={() => addSectionToTab(idx)}
                                    disabled={readOnly}
                                    title="Añade una sección a esta pestaña"
                                  >
                                    + Añadir sección (esta pestaña)
                                  </button>
                                </div>
                              </div>

                              {propsObj.fields.length === 0 && getTabFormSections(t).length === 0 && (
                                <div className={styles.hint}>Aún no hay campos ni secciones en esta pestaña.</div>
                              )}

                              {/* SECCIONES (dropdown/accordion) */}
                              <div className="d-flex flex-column gap-2" style={{ marginTop: 12 }}>
                                {getTabFormSections(t).map((section, sIdx) => {
                                  const allFieldNames = propsObj.fields.map((f) => f.name);
                                  const fieldsInSection = propsObj.fields.filter((f) => (section.fields || []).includes(f.name));

                                  return (
                                    <details key={section.id} className={styles.sectionRow}>
                                      <summary className={styles.sectionHeader} style={{ cursor: "pointer", listStyle: "none" as any }}>
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

                                        {/* Acciones sección */}
                                        <div className={styles.sectionActions} onClick={(e) => e.preventDefault()}>
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
                                      </summary>

                                      {/* CUERPO SECCIÓN */}
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
                                                updateTabSection(idx, sIdx, { id: e.target.value || `section_${sIdx + 1}` })
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
                                              const selected = Array.from(e.currentTarget.selectedOptions).map((opt) => opt.value);
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

                                        {/* CAMPOS DENTRO DE LA SECCIÓN (dropdown por campo) */}
                                        <div style={{ marginTop: 14 }}>
                                          {fieldsInSection.length === 0 ? (
                                            <div className={styles.hint}>No hay campos asignados a esta sección.</div>
                                          ) : (
                                            <div className="d-flex flex-column gap-2">
                                              {fieldsInSection.map((f) => {
                                                const fieldIdx = propsObj.fields.findIndex((x) => x.name === f.name);
                                                if (fieldIdx === -1) return null;

                                                const summaryLabel = propsObj.fields[fieldIdx].label?.trim() || "Sin label";
                                                const summaryName = propsObj.fields[fieldIdx].name?.trim() || "sin_name";

                                                return (
                                                  <details key={fieldIdx} className={styles.card} style={{ marginBottom: 0 }}>
                                                    <summary style={{ cursor: "pointer", padding: 10 }}>
                                                      <div className="d-flex justify-content-between align-items-center gap-2">
                                                        <div>
                                                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                                                            {summaryLabel} <span className={styles.badgeSoft}>{summaryName}</span>
                                                          </div>
                                                          <div className={styles.hint} style={{ marginTop: 2 }}>
                                                            type: {propsObj.fields[fieldIdx].type}
                                                          </div>
                                                        </div>
                                                        <span className={styles.badgeSoft}>Abrir</span>
                                                      </div>
                                                    </summary>

                                                    <div style={{ padding: 10 }}>
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
                                                        fieldsByTable={fieldsByTable}
                                                        loadingByTable={loadingByTable}
                                                        ensureFieldsLoaded={ensureFieldsLoaded}
                                                      />
                                                    </div>
                                                  </details>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </details>
                                  );
                                })}
                              </div>

                              {/* CAMPOS SIN SECCIÓN (dropdown) */}
                              {(() => {
                                const sections = getTabFormSections(t);
                                const inSections = getSectionFieldSet(sections);
                                const unassigned = propsObj.fields
                                  .map((f, idx2) => ({ f, idx2 }))
                                  .filter(({ f }) => !inSections.has(f.name));

                                if (unassigned.length === 0) return null;

                                return (
                                  <details className={styles.sectionRow} style={{ marginTop: 12 }}>
                                    <summary className={styles.sectionHeader} style={{ cursor: "pointer", listStyle: "none" as any }}>
                                      <div className={styles.sectionTitleLine}>
                                        <span className={styles.sectionTitle}>Campos sin sección (esta pestaña)</span>
                                        <span className={styles.sectionMeta}>
                                          <span className={styles.badgeSoft}>{unassigned.length} campos</span>
                                        </span>
                                      </div>
                                    </summary>

                                    <div className={styles.sectionBody}>
                                      <div className="d-flex flex-column gap-2">
                                        {unassigned.map(({ idx2 }) => {
                                          const summaryLabel = propsObj.fields[idx2].label?.trim() || "Sin label";
                                          const summaryName = propsObj.fields[idx2].name?.trim() || "sin_name";

                                          return (
                                            <details key={idx2} className={styles.card} style={{ marginBottom: 0 }}>
                                              <summary style={{ cursor: "pointer", padding: 10 }}>
                                                <div className="d-flex justify-content-between align-items-center gap-2">
                                                  <div>
                                                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                                                      {summaryLabel} <span className={styles.badgeSoft}>{summaryName}</span>
                                                    </div>
                                                    <div className={styles.hint} style={{ marginTop: 2 }}>
                                                      type: {propsObj.fields[idx2].type}
                                                    </div>
                                                  </div>
                                                  <span className={styles.badgeSoft}>Abrir</span>
                                                </div>
                                              </summary>

                                              <div style={{ padding: 10 }}>
                                                <FieldRow
                                                  field={propsObj.fields[idx2]}
                                                  onChange={(patch: Field) => updateField(idx2, patch)}
                                                  onRemove={() => removeField(idx2)}
                                                  onMoveUp={() => moveField(idx2, -1)}
                                                  onMoveDown={() => moveField(idx2, +1)}
                                                  canUp={idx2 > 0}
                                                  canDown={idx2 < propsObj.fields.length - 1}
                                                  readOnly={readOnly}
                                                  fieldsByTable={fieldsByTable}
                                                  loadingByTable={loadingByTable}
                                                  ensureFieldsLoaded={ensureFieldsLoaded}
                                                />
                                              </div>
                                            </details>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </details>
                                );
                              })()}
                            </div>
                          )}
                        {/* Botón eliminar pestaña */}
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
                })()}

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


