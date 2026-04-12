"use client";

import { useState, useTransition, useEffect, useRef, useCallback} from "react";
import styles from "./modulo-detalle.module.css";
import  Selector from "../Selector";
import {IconPicker} from "@repo/ui";
import type { CalendarSpecialViewConfig, CalendarViewMode, Field as FieldSchema, ModuleSchema, Field, FormPreviewTab, FormSection, SpecialViewConfig, UiTab} from "@repo/types";
import {VALID_FIELD_TYPES} from "@repo/types";
import { FieldPickerModal, type TableField } from "../modals/FieldPickerModal";
import {FieldRow} from "./FieldRow"
import UiFormActionsEditor, { type UiFormAction } from "./UiFormActionsEditor";
import { useSearchParams, useRouter } from "next/dist/client/components/navigation";

type PickTarget = "columns" | "groupByField" | "parentFilterField" | "sumField";
type ModuleFieldOption = { name: string; label?: string; type?: string };




// ---------- UI---------------



const isPickMultiple = (target: PickTarget) => target === "columns";

const getPickValue = (target: PickTarget, t: any) => {
  switch (target) {
    case "columns":
      return extractColumnFields(t.config?.columns); // usa el helper correcto
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

// Subcomponentes UI simples
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

function mapPreviewTabsToSpecialViews(previewTabs: FormPreviewTab[]): SpecialViewConfig[] {
  return previewTabs.map((tab, index) => ({
    id: String(tab.id || `special_view_${index + 1}`),
    label: String(tab.label || `Vista especial ${index + 1}`),
    type: "pdfPreview",
    config: {
      pdfTemplateId: String(tab.pdfTemplateId || ""),
    },
  }));
}

function defaultCalendarConfig(): CalendarSpecialViewConfig {
  return {
    sourceModuleSlug: "",
    titleField: "",
    startField: "",
    endField: "",
    allDayField: "",
    colorField: "",
    descriptionField: "",
    resourceField: "",
    parentLinkField: "",
    enabledViews: ["month", "week", "day"],
    defaultView: "month",
  };
}

function normalizeCalendarConfig(input: any): CalendarSpecialViewConfig {
  const cfg = input && typeof input === "object" ? input : {};
  const sourceModuleSlug = String(cfg.sourceModuleSlug || cfg.sourceTable || "").trim();
  const enabledViews = Array.isArray(cfg.enabledViews)
    ? cfg.enabledViews.filter((v: any) => ["month", "week", "day"].includes(String(v)))
    : ["month", "week", "day"];

  return {
    sourceModuleSlug,
    titleField: String(cfg.titleField || "").trim(),
    startField: String(cfg.startField || "").trim(),
    endField: String(cfg.endField || "").trim(),
    allDayField: String(cfg.allDayField || "").trim(),
    colorField: String(cfg.colorField || "").trim(),
    descriptionField: String(cfg.descriptionField || "").trim(),
    resourceField: String(cfg.resourceField || "").trim(),
    parentLinkField: String(cfg.parentLinkField || "").trim(),
    enabledViews: enabledViews.length ? (enabledViews as CalendarViewMode[]) : ["month", "week", "day"],
    defaultView: ["month", "week", "day"].includes(String(cfg.defaultView))
      ? (cfg.defaultView as CalendarViewMode)
      : "month",
  };
}

function sortFieldsForCalendar(fields: ModuleFieldOption[], preferredTypes: string[]) {
  const preferred = new Set(preferredTypes);
  return [...fields].sort((a, b) => {
    const aPref = a.type && preferred.has(a.type) ? 0 : 1;
    const bPref = b.type && preferred.has(b.type) ? 0 : 1;
    if (aPref !== bPref) return aPref - bPref;
    return (a.label || a.name).localeCompare(b.label || b.name, "es");
  });
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

// Form principal




export default function ModuloForm({
  initialData,
  mode,
  onSave,
  loadFieldsForTable,
}: {
  initialData: any;
  mode: "view" | "edit" | "create";
  onSave: (fd: FormData) => Promise<{ ok: boolean; detail: string; id?: string }>;
  loadFieldsForTable?: (tableSlug: string) => Promise<ModuleFieldOption[]>;
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
  const [fieldsByTable, setFieldsByTable] = useState<Record<string, ModuleFieldOption[]>>({});
  const [loadingByTable, setLoadingByTable] = useState<Record<string, boolean>>({});
  const fieldsCacheRef = useRef<Record<string, ModuleFieldOption[]>>({});
  const loadingCacheRef = useRef<Record<string, boolean>>({});
  const router = useRouter();
const searchParams = useSearchParams();

  useEffect(() => {
  fieldsCacheRef.current = fieldsByTable;
}, [fieldsByTable]);

useEffect(() => {
  loadingCacheRef.current = loadingByTable;
}, [loadingByTable]);

  const ensureFieldsLoaded = useCallback(async (tableSlug: string) => {
  const key = (tableSlug || "").trim();
  if (!key) return;
  if (!loadFieldsForTable) return;

  // cache estable (ref), no depende de fieldsByTable
  if (fieldsCacheRef.current[key]) return;

  // evita doble fetch si ya está cargando
  if (loadingCacheRef.current[key]) return;

  setLoadingByTable((p) => ({ ...p, [key]: true }));
  try {
    const fields = await loadFieldsForTable(key);
    const safe = Array.isArray(fields) ? fields : [];
    setFieldsByTable((p) => ({ ...p, [key]: safe }));
  } catch (e) {
    console.error("loadFieldsForTable failed:", key, e);
    setFieldsByTable((p) => ({ ...p, [key]: [] }));
  } finally {
    setLoadingByTable((p) => ({ ...p, [key]: false }));
  }
}, [loadFieldsForTable]);

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

      const specialViews = Array.isArray(uiAny.specialViews)
        ? (uiAny.specialViews as SpecialViewConfig[])
        : [];
      const legacyPreviewTabs = Array.isArray(uiAny.previewTabs)
        ? (uiAny.previewTabs as FormPreviewTab[])
        : [];

      if (specialViews.length === 0 && legacyPreviewTabs.length > 0) {
        next.ui = {
          ...(next.ui || {}),
          specialViews: mapPreviewTabsToSpecialViews(legacyPreviewTabs),
        };
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


// =========================Button Actions Legacy



const getFormActions = (): UiFormAction[] => {
  const uiAny = (propsObj.ui || {}) as any;
  return Array.isArray(uiAny.formActions) ? uiAny.formActions : [];
};

const setFormActions = (actions: UiFormAction[]) => {
  const ui = { ...(propsObj.ui || {}), formActions: actions as any };
  const next = { ...propsObj, ui };
  setPropsObj(next);
  setRawText(JSON.stringify(next, null, 2));
};

const getSpecialViews = (): SpecialViewConfig[] => {
  const uiAny = (propsObj.ui || {}) as any;
  if (Array.isArray(uiAny.specialViews)) return uiAny.specialViews as SpecialViewConfig[];
  if (Array.isArray(uiAny.previewTabs)) {
    return mapPreviewTabsToSpecialViews(uiAny.previewTabs as FormPreviewTab[]);
  }
  return [];
};

const setSpecialViews = (specialViews: SpecialViewConfig[]) => {
  const currentUi = { ...(propsObj.ui || {}) } as any;
  const { previewTabs: _legacyPreviewTabs, ...restUi } = currentUi;
  const ui = { ...restUi, specialViews };
  const next = { ...propsObj, ui };
  setPropsObj(next);
  setRawText(JSON.stringify(next, null, 2));
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
      fd.set("sidebar", String(sidebar));
      fd.set("props", JSON.stringify(toSave));

      const res = await onSave(fd);
      setMsg({ ok: res.ok, text: res.detail });
      if (res.ok) {
        const sp = new URLSearchParams(searchParams.toString());
        sp.set("edit", "false");

        const nextUrl = `/system/modulos/${res.id || initialData?.id}?${sp.toString()}`;
        router.replace(nextUrl);
        router.refresh();
      }
    });
  };
  //const [activeTabId, setActiveTabId] = useState<string>(() => getTabs()[0]?.id || "");


  const readOnlyAttr = { disabled: readOnly } as const;
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [activeViewEditorId, setActiveViewEditorId] = useState<string>("");
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

    useEffect(() => {
      const viewIds = [
        ...getTabs().filter((tab) => tab.type !== "form").map((tab) => `tab:${tab.id}`),
        ...getSpecialViews().map((view) => `special:${view.id}`),
      ];

      if (!viewIds.length) {
        if (activeViewEditorId) setActiveViewEditorId("");
        return;
      }

      if (!activeViewEditorId || !viewIds.includes(activeViewEditorId)) {
        setActiveViewEditorId(viewIds[0]);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propsObj.ui]);


type SimpleField = ModuleFieldOption;

const sourceFields: SimpleField[] = (propsObj.fields || []).map((f: any) => ({
  name: f.name,
  label: f.label,
}));

const getTableFields = useCallback((tableSlug: string): SimpleField[] => {
  const key = (tableSlug || "").trim();
  if (!key) return [];
  return fieldsByTable[key] || [];
}, [fieldsByTable]);

const ensureTableFields = useCallback((tableSlug: string) => {
  const key = (tableSlug || "").trim();
  if (!key) return;
  ensureFieldsLoaded(key);
}, [ensureFieldsLoaded]);

const [editorTab, setEditorTab] = useState<
  "general" | "db" | "ui" | "fields" | "layout" | "views" | "json"
>("general");
const editorTabs = [
  { id: "general", label: "General" },
  { id: "db", label: "Base de datos" },
  { id: "ui", label: "Apariencia" },
  { id: "fields", label: "Campos" },
  { id: "layout", label: "Formulario" },
  { id: "views", label: "Vistas especiales" },
  { id: "json", label: "JSON avanzado" },
] as const;

  return (
    <form className={styles.card} onSubmit={onSubmit}>
  <div className={styles.tabsBar}>
    {editorTabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        className={`${styles.btn} ${editorTab === tab.id ? styles.btnActive : ""}`}
        onClick={() => setEditorTab(tab.id)}
      >
        {tab.label}
      </button>
    ))}
  </div>

  {/* GENERAL */}
  {editorTab === "general" && (
    <Section title="General">
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
              { field: "tipo", op: "=", value: "carpeta" },
              ...(initialData?.id ? [{ field: "id", op: "!=", value: initialData.id }] : []),
            ]}
            sort={[{ field: "orden", direction: "asc" }]}
            onChange={(nextId: string) => setParentId(nextId ? nextId : null)}
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
          <label className={styles.label}>Quitar del sidebar</label>
          <input
            type="checkbox"
            checked={!!propsObj.ui?.sidebar}
            onChange={(e) => {
              const ui = { ...propsObj.ui, sidebar: e.target.checked };
              const next = { ...propsObj, ui };
              setPropsObj(next);
              setRawText(JSON.stringify(next, null, 2));
              setSidebar(e.target.checked);
            }}
            {...readOnlyAttr}
          />
        </div>
      </div>
    </Section>
  )}

  {/* DB */}
  {editorTab === "db" && (
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
  )}

  {/* UI */}
  {editorTab === "ui" && (
    <Section title="Sección: UI">
      <div className={styles.grid}>
        <div>
          <label className={styles.label}>ui.color</label>
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

        <div style={{ gridColumn: "1 / -1", marginTop: 12 }}>
          <UiFormActionsEditor
            value={getFormActions()}
            onChange={setFormActions}
            readOnly={readOnly}
            styles={styles}
            IconPicker={IconPicker}
            sourceFields={sourceFields}
            getTableFields={getTableFields}
            ensureTableFields={ensureTableFields}
            workflowCatalog={[
              { key: "derive.createFromParent", label: "Generar presupuesto (snapshot tareas)" },
              { key: "invoice.generateFromBudget", label: "Generar factura desde presupuesto" },
            ]}
          />
        </div>
      </div>
    </Section>
  )}

  {/* CAMPOS */}
  {editorTab === "fields" && (
    <Section title="Campos">
      <div className={styles.actionsRow} style={{ justifyContent: "flex-end" }}>
        <button
          type="button"
          className={styles.btnAdd}
          onClick={addField}
          disabled={readOnly}
        >
          + Añadir campo
        </button>
      </div>

      {propsObj.fields.length === 0 && (
        <div className={styles.hint}>Aún no hay campos.</div>
      )}

      <div className="d-flex flex-column gap-2" style={{ marginTop: 12 }}>
        {propsObj.fields.map((field, idx) => {
          const summaryLabel = field.label?.trim() || "Sin label";
          const summaryName = field.name?.trim() || "sin_name";

          return (
            <details key={idx} className={styles.card} style={{ marginBottom: 0 }}>
              <summary style={{ cursor: "pointer", padding: 10 }}>
                <div className="d-flex justify-content-between align-items-center gap-2">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {summaryLabel} <span className={styles.badgeSoft}>{summaryName}</span>
                    </div>
                    <div className={styles.hint} style={{ marginTop: 2 }}>
                      type: {field.type}
                    </div>
                  </div>
                  <span className={styles.badgeSoft}>Abrir</span>
                </div>
              </summary>

              <div style={{ padding: 10 }}>
                <FieldRow
                  field={field}
                  onChange={(patch: Field) => updateField(idx, patch)}
                  onRemove={() => removeField(idx)}
                  onMoveUp={() => moveField(idx, -1)}
                  onMoveDown={() => moveField(idx, +1)}
                  canUp={idx > 0}
                  canDown={idx < propsObj.fields.length - 1}
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
    </Section>
  )}

  {/* LAYOUT / FORMULARIO */}
  {editorTab === "layout" && (
    <Section title="Formulario">
      <div className={styles.actionsRow} style={{ justifyContent: "flex-end" }}>
        <button
          type="button"
          className={styles.btnAdd}
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
          + Añadir pestaña de formulario
        </button>
      </div>

      {getTabs().filter((tab) => tab.type === "form").length > 0 && (
        <div className={styles.card} style={{ marginTop: 12 }}>
          <div className={styles.grid}>
            <div className="full">
              <label className={styles.label}>Pestaña activa</label>
              <select
                className={styles.input}
                value={
                  (() => {
                    const formTabs = getTabs().filter((tab) => tab.type === "form");
                    const currentExists = formTabs.some((tab) => tab.id === activeTabId);
                    return currentExists ? activeTabId : formTabs[0]?.id || "";
                  })()
                }
                onChange={(e) => setActiveTabId(e.target.value)}
                disabled={readOnly}
              >
                {getTabs()
                  .filter((tab) => tab.type === "form")
                  .map((t) => (
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
        const tabs = getTabs().filter((tab) => tab.type === "form");
        if (tabs.length === 0) return null;

        const idx = Math.max(
          0,
          tabs.findIndex((t) => t.id === (activeTabId || tabs[0].id))
        );

        const t = tabs[idx];
        const realIdx = getTabs().findIndex((tab) => tab.id === t.id);

        const updateTab = (updater: (prev: UiTab) => UiTab) => {
          const allTabs = getTabs();
          const nextTabs = [...allTabs];
          nextTabs[realIdx] = updater(nextTabs[realIdx]);
          setTabs(nextTabs);
          const nextId = nextTabs[realIdx]?.id;
          if (nextId && nextId !== activeTabId) setActiveTabId(nextId);
        };

        const removeTab = () => {
          const allTabs = getTabs();
          const next = allTabs.filter((_, i) => i !== realIdx);
          setTabs(next);
          const nextFormTab = next.find((tab) => tab.type === "form");
          setActiveTabId(nextFormTab?.id || "");
        };

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
                <input
                  className={styles.input}
                  value="form"
                  disabled
                  readOnly
                />
              </div>
            </div>

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
                    onClick={() => addSectionToTab(realIdx)}
                    disabled={readOnly}
                    title="Añade una sección a esta pestaña"
                  >
                    + Añadir sección
                  </button>
                </div>
              </div>

              {propsObj.fields.length === 0 && getTabFormSections(t).length === 0 && (
                <div className={styles.hint}>Aún no hay campos ni secciones en esta pestaña.</div>
              )}

              <div className="d-flex flex-column gap-2" style={{ marginTop: 12 }}>
                {getTabFormSections(t).map((section, sIdx) => {
                  const allFieldNames = propsObj.fields.map((f) => f.name);
                  const fieldsInSection = propsObj.fields.filter((f) =>
                    (section.fields || []).includes(f.name)
                  );

                  return (
                    <details key={section.id} className={styles.sectionRow}>
                      <summary
                        className={styles.sectionHeader}
                        style={{ cursor: "pointer", listStyle: "none" as any }}
                      >
                        <div className={styles.sectionTitleLine}>
                          <span className={styles.sectionTitle}>
                            {section.label || "Sección sin label"}
                          </span>
                          <span className={styles.sectionMeta}>
                            <span className={styles.badgeSoft}>id: {section.id}</span>
                            <span className={styles.badgeSoft}>
                              {(section.fields || []).length} campos
                            </span>
                          </span>
                        </div>

                        {section.description ? (
                          <div className={styles.sectionDescPreview}>
                            {section.description.length > 80
                              ? section.description.slice(0, 80) + "…"
                              : section.description}
                          </div>
                        ) : null}

                        <div
                          className={styles.sectionActions}
                          onClick={(e) => e.preventDefault()}
                        >
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => moveTabSection(realIdx, sIdx, -1)}
                            disabled={readOnly || sIdx === 0}
                            title="Subir sección"
                          >
                            ↑
                          </button>

                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => moveTabSection(realIdx, sIdx, +1)}
                            disabled={readOnly || sIdx === getTabFormSections(t).length - 1}
                            title="Bajar sección"
                          >
                            ↓
                          </button>

                          <button
                            type="button"
                            className={styles.dangerBtn}
                            onClick={() => removeTabSection(realIdx, sIdx)}
                            disabled={readOnly}
                            title="Eliminar sección"
                          >
                            Eliminar
                          </button>
                        </div>
                      </summary>

                      <div className={styles.sectionBody}>
                        <div className={styles.grid}>
                          <div>
                            <label className={styles.label}>Label sección</label>
                            <input
                              className={styles.input}
                              value={section.label}
                              onChange={(e) =>
                                updateTabSection(realIdx, sIdx, { label: e.target.value })
                              }
                              disabled={readOnly}
                            />
                          </div>

                          <div>
                            <label className={styles.label}>ID</label>
                            <input
                              className={styles.input}
                              value={section.id}
                              onChange={(e) =>
                                updateTabSection(realIdx, sIdx, {
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
                            onChange={(e) =>
                              updateTabSection(realIdx, sIdx, { description: e.target.value })
                            }
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
                              updateTabSection(realIdx, sIdx, { fields: selected });
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
                            <div className="d-flex flex-column gap-2">
                              {fieldsInSection.map((f) => {
                                const fieldIdx = propsObj.fields.findIndex((x) => x.name === f.name);
                                if (fieldIdx === -1) return null;

                                const summaryLabel =
                                  propsObj.fields[fieldIdx].label?.trim() || "Sin label";
                                const summaryName =
                                  propsObj.fields[fieldIdx].name?.trim() || "sin_name";

                                return (
                                  <details
                                    key={fieldIdx}
                                    className={styles.card}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <summary style={{ cursor: "pointer", padding: 10 }}>
                                      <div className="d-flex justify-content-between align-items-center gap-2">
                                        <div>
                                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                                            {summaryLabel}{" "}
                                            <span className={styles.badgeSoft}>{summaryName}</span>
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

              {(() => {
                const sections = getTabFormSections(t);
                const inSections = getSectionFieldSet(sections);
                const unassigned = propsObj.fields
                  .map((f, idx2) => ({ f, idx2 }))
                  .filter(({ f }) => !inSections.has(f.name));

                if (unassigned.length === 0) return null;

                return (
                  <details className={styles.sectionRow} style={{ marginTop: 12 }}>
                    <summary
                      className={styles.sectionHeader}
                      style={{ cursor: "pointer", listStyle: "none" as any }}
                    >
                      <div className={styles.sectionTitleLine}>
                        <span className={styles.sectionTitle}>
                          Campos sin sección (esta pestaña)
                        </span>
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
                                      {summaryLabel}{" "}
                                      <span className={styles.badgeSoft}>{summaryName}</span>
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
  )}

  {/* VISTAS ESPECIALES */}
  {editorTab === "views" && (
    <Section title="Vistas especiales">
      <div className={styles.actionsRow} style={{ justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          className={styles.btnAdd}
          onClick={() => {
            const tabs = getTabs();
            const n = tabs.length + 1;
            setTabs([
              ...tabs,
              {
                id: `tab_${n}`,
                label: `TreeView ${n}`,
                type: "treeview",
                config: { sourceTable: "", groupBy: [], columns: [] },
              },
            ]);
          }}
          disabled={readOnly}
        >
          + Añadir TreeView
        </button>

        <button
          type="button"
          className={styles.btnAdd}
          onClick={() => {
            const current = getSpecialViews();
            const n = current.length + 1;
            const nextId = `special_view_${n}`;
            setSpecialViews([
              ...current,
              {
                id: nextId,
                label: `Calendario ${n}`,
                type: "calendar",
                config: defaultCalendarConfig(),
              },
            ]);
            setActiveViewEditorId(`special:${nextId}`);
          }}
          disabled={readOnly}
        >
          + Añadir Calendario
        </button>

        <button
          type="button"
          className={styles.btnAdd}
          onClick={() => {
            const current = getSpecialViews();
            const n = current.length + 1;
            const nextId = `special_view_${n}`;
            setSpecialViews([
              ...current,
              {
                id: nextId,
                label: `Preview ${n}`,
                type: "pdfPreview",
                config: { pdfTemplateId: "" },
              },
            ]);
            setActiveViewEditorId(`special:${nextId}`);
          }}
          disabled={readOnly}
        >
          + Añadir Preview
        </button>
      </div>

      {(() => {
        const viewItems = [
          ...getTabs().filter((tab) => tab.type !== "form").map((tab) => ({
            key: `tab:${tab.id}`,
            label: tab.label,
            type: tab.type,
          })),
          ...getSpecialViews().map((view) => ({
            key: `special:${view.id}`,
            label: view.label,
            type: view.type,
          })),
        ];

        if (viewItems.length === 0) return null;

        return (
        <div className={styles.card} style={{ marginTop: 12 }}>
          <div className={styles.grid}>
            <div className="full">
              <label className={styles.label}>Vista activa</label>
              <select
                className={styles.input}
                value={viewItems.some((item) => item.key === activeViewEditorId) ? activeViewEditorId : viewItems[0]?.key || ""}
                onChange={(e) => setActiveViewEditorId(e.target.value)}
                disabled={readOnly}
              >
                {viewItems.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label} — ({item.type})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        );
      })()}

      {(() => {
        const selectedKey = activeViewEditorId;

        if (selectedKey.startsWith("special:")) {
          const specialViews = getSpecialViews();
          const specialId = selectedKey.slice("special:".length);
          const viewIdx = specialViews.findIndex((view) => view.id === specialId);
          if (viewIdx === -1) return null;

          const view = specialViews[viewIdx];
          const updateView = (updater: (prev: SpecialViewConfig) => SpecialViewConfig) => {
            const nextViews = [...getSpecialViews()];
            nextViews[viewIdx] = updater(nextViews[viewIdx]);
            setSpecialViews(nextViews);
            const nextId = nextViews[viewIdx]?.id;
            if (nextId && `special:${nextId}` !== activeViewEditorId) {
              setActiveViewEditorId(`special:${nextId}`);
            }
          };

          const removeView = () => {
            const next = getSpecialViews().filter((_, idx) => idx !== viewIdx);
            setSpecialViews(next);
            setActiveViewEditorId(next[0] ? `special:${next[0].id}` : "");
          };
          const calendarConfig = view.type === "calendar" ? normalizeCalendarConfig(view.config) : null;
          const calendarFields = calendarConfig ? getTableFields(calendarConfig.sourceModuleSlug) : [];
          const titleFieldOptions = sortFieldsForCalendar(calendarFields, ["text", "textarea", "select"]);
          const startFieldOptions = sortFieldsForCalendar(calendarFields, ["datetime", "date"]);
          const endFieldOptions = sortFieldsForCalendar(calendarFields, ["datetime", "date"]);
          const allDayFieldOptions = sortFieldsForCalendar(calendarFields, ["boolean"]);
          const colorFieldOptions = sortFieldsForCalendar(calendarFields, ["color", "text"]);
          const descriptionFieldOptions = sortFieldsForCalendar(calendarFields, ["textarea", "text"]);
          const resourceFieldOptions = sortFieldsForCalendar(calendarFields, ["text", "select", "selectorTabla"]);
          const parentLinkFieldOptions = sortFieldsForCalendar(calendarFields, ["selectorTabla"]);

          const updateCalendarConfig = (patch: Partial<CalendarSpecialViewConfig>) => {
            updateView((prev) => ({
              ...prev,
              type: "calendar",
              config: {
                ...normalizeCalendarConfig(prev.type === "calendar" ? prev.config : defaultCalendarConfig()),
                ...patch,
              },
            }));
          };

          return (
            <div key={view.id} className={styles.card} style={{ marginTop: 12 }}>
              <div className={styles.grid}>
                <div>
                  <label className={styles.label}>ID</label>
                  <input
                    className={styles.input}
                    value={view.id}
                    onChange={(e) => updateView((prev) => ({ ...prev, id: e.target.value || `special_view_${viewIdx + 1}` }))}
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <label className={styles.label}>Label</label>
                  <input
                    className={styles.input}
                    value={view.label}
                    onChange={(e) => updateView((prev) => ({ ...prev, label: e.target.value }))}
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <label className={styles.label}>Tipo</label>
                  <select
                    className={styles.input}
                    value={view.type}
                    onChange={(e) => {
                      const nextType = e.target.value as SpecialViewConfig["type"];
                      updateView((prev) => {
                        if (nextType === "calendar") {
                          return {
                            id: prev.id,
                            label: prev.label,
                            type: "calendar",
                            config:
                              prev.type === "calendar"
                                ? normalizeCalendarConfig(prev.config)
                                : defaultCalendarConfig(),
                          };
                        }

                        return {
                          id: prev.id,
                          label: prev.label,
                          type: "pdfPreview",
                          config: {
                            pdfTemplateId: prev.type === "pdfPreview" ? prev.config?.pdfTemplateId || "" : "",
                          },
                        };
                      });
                    }}
                    disabled={readOnly}
                  >
                    <option value="pdfPreview">Preview PDF</option>
                    <option value="calendar">Calendario</option>
                  </select>
                </div>
              </div>

              {view.type === "pdfPreview" && (
                <div className={styles.card} style={{ marginTop: 12 }}>
                  <h4 style={{ marginTop: 0 }}>Configuración Preview PDF</h4>
                  <Selector
                    moduleSlug="pdf_templates"
                    displayField="name"
                    valueField="id"
                    value={view.config?.pdfTemplateId || ""}
                    readOnly={readOnly}
                    placeholder="— Seleccionar plantilla PDF —"
                    label="Template PDF"
                    onChange={(nextTemplateId: string) =>
                      updateView((prev) => ({
                        ...prev,
                        type: "pdfPreview",
                        config: { pdfTemplateId: nextTemplateId || "" },
                      }))
                    }
                  />
                </div>
              )}

              {view.type === "calendar" && calendarConfig && (
                <div className={styles.card} style={{ marginTop: 12 }}>
                  <h4 style={{ marginTop: 0 }}>Configuración Calendario</h4>
                  <div className={styles.grid}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className={styles.label}>Módulo fuente</label>
                      <Selector
                        moduleSlug="modulos"
                        displayField="nombre"
                        valueField="slug"
                        value={calendarConfig.sourceModuleSlug || ""}
                        readOnly={readOnly}
                        placeholder="— Seleccionar módulo —"
                        label="Selecciona el módulo fuente"
                        filters={[
                          { field: "activo", op: "=", value: true },
                          { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] },
                        ]}
                        sort={[{ field: "orden", direction: "asc" }]}
                        onChange={(moduleSlug: string) => {
                          ensureTableFields(moduleSlug);
                          updateCalendarConfig({
                            sourceModuleSlug: moduleSlug || "",
                            titleField: "",
                            startField: "",
                            endField: "",
                            allDayField: "",
                            colorField: "",
                            descriptionField: "",
                            resourceField: "",
                            parentLinkField: "",
                          });
                        }}
                      />
                    </div>

                    <div>
                      <label className={styles.label}>Título del evento</label>
                      <select
                        className={styles.input}
                        value={calendarConfig.titleField || ""}
                        onChange={(e) => updateCalendarConfig({ titleField: e.target.value })}
                        disabled={readOnly || !calendarConfig.sourceModuleSlug}
                      >
                        <option value="">— Seleccionar campo —</option>
                        {titleFieldOptions.map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label || field.name}{field.type ? ` (${field.type})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={styles.label}>Fecha inicio</label>
                      <select
                        className={styles.input}
                        value={calendarConfig.startField || ""}
                        onChange={(e) => updateCalendarConfig({ startField: e.target.value })}
                        disabled={readOnly || !calendarConfig.sourceModuleSlug}
                      >
                        <option value="">— Seleccionar campo —</option>
                        {startFieldOptions.map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label || field.name}{field.type ? ` (${field.type})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={styles.label}>Fecha fin</label>
                      <select
                        className={styles.input}
                        value={calendarConfig.endField || ""}
                        onChange={(e) => updateCalendarConfig({ endField: e.target.value })}
                        disabled={readOnly || !calendarConfig.sourceModuleSlug}
                      >
                        <option value="">— Sin campo —</option>
                        {endFieldOptions.map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label || field.name}{field.type ? ` (${field.type})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={styles.label}>Todo el día</label>
                      <select
                        className={styles.input}
                        value={calendarConfig.allDayField || ""}
                        onChange={(e) => updateCalendarConfig({ allDayField: e.target.value })}
                        disabled={readOnly || !calendarConfig.sourceModuleSlug}
                      >
                        <option value="">— Sin campo —</option>
                        {allDayFieldOptions.map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label || field.name}{field.type ? ` (${field.type})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={styles.label}>Color</label>
                      <select
                        className={styles.input}
                        value={calendarConfig.colorField || ""}
                        onChange={(e) => updateCalendarConfig({ colorField: e.target.value })}
                        disabled={readOnly || !calendarConfig.sourceModuleSlug}
                      >
                        <option value="">— Sin campo —</option>
                        {colorFieldOptions.map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label || field.name}{field.type ? ` (${field.type})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={styles.label}>Descripción</label>
                      <select
                        className={styles.input}
                        value={calendarConfig.descriptionField || ""}
                        onChange={(e) => updateCalendarConfig({ descriptionField: e.target.value })}
                        disabled={readOnly || !calendarConfig.sourceModuleSlug}
                      >
                        <option value="">— Sin campo —</option>
                        {descriptionFieldOptions.map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label || field.name}{field.type ? ` (${field.type})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={styles.label}>Resource / responsable</label>
                      <select
                        className={styles.input}
                        value={calendarConfig.resourceField || ""}
                        onChange={(e) => updateCalendarConfig({ resourceField: e.target.value })}
                        disabled={readOnly || !calendarConfig.sourceModuleSlug}
                      >
                        <option value="">— Sin campo —</option>
                        {resourceFieldOptions.map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label || field.name}{field.type ? ` (${field.type})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={styles.label}>Campo vínculo con el registro actual</label>
                      <select
                        className={styles.input}
                        value={calendarConfig.parentLinkField || ""}
                        onChange={(e) => updateCalendarConfig({ parentLinkField: e.target.value })}
                        disabled={readOnly || !calendarConfig.sourceModuleSlug}
                      >
                        <option value="">— Autodetectar vínculo —</option>
                        {parentLinkFieldOptions.map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label || field.name}{field.type ? ` (${field.type})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={styles.label}>Vista por defecto</label>
                      <select
                        className={styles.input}
                        value={calendarConfig.defaultView || "month"}
                        onChange={(e) => updateCalendarConfig({ defaultView: e.target.value as CalendarViewMode })}
                        disabled={readOnly}
                      >
                        {(calendarConfig.enabledViews || ["month", "week", "day"]).map((viewMode) => (
                          <option key={viewMode} value={viewMode}>
                            {viewMode === "month" ? "Mensual" : viewMode === "week" ? "Semanal" : "Diaria"}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className={styles.label}>Vistas habilitadas</label>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {(["month", "week", "day"] as CalendarViewMode[]).map((viewMode) => {
                          const enabled = (calendarConfig.enabledViews || []).includes(viewMode);
                          return (
                            <label key={viewMode} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={readOnly}
                                onChange={(e) => {
                                  const current = calendarConfig.enabledViews || ["month", "week", "day"];
                                  const nextEnabled = e.target.checked
                                    ? Array.from(new Set([...current, viewMode]))
                                    : current.filter((item) => item !== viewMode);
                                  const safeEnabled = nextEnabled.length ? nextEnabled : [viewMode];
                                  updateCalendarConfig({
                                    enabledViews: safeEnabled,
                                    defaultView: safeEnabled.includes(calendarConfig.defaultView || "month")
                                      ? (calendarConfig.defaultView || "month")
                                      : safeEnabled[0],
                                  });
                                }}
                              />
                              <span>{viewMode === "month" ? "Mensual" : viewMode === "week" ? "Semanal" : "Diaria"}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className={styles.actionsRow} style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={removeView}
                  disabled={readOnly}
                  style={{ background: "#fc0505ff", borderColor: "#ffb3b3" }}
                >
                  Eliminar vista
                </button>
              </div>
            </div>
          );
        }

        const tabs = getTabs().filter((tab) => tab.type !== "form");
        if (tabs.length === 0) return null;

        const idx = Math.max(
          0,
          tabs.findIndex((t) => `tab:${t.id}` === (activeViewEditorId || `tab:${tabs[0].id}`))
        );

        const t = tabs[idx];
        const realIdx = getTabs().findIndex((tab) => tab.id === t.id);

        const updateTab = (updater: (prev: UiTab) => UiTab) => {
          const allTabs = getTabs();
          const nextTabs = [...allTabs];
          nextTabs[realIdx] = updater(nextTabs[realIdx]);
          setTabs(nextTabs);
          const nextId = nextTabs[realIdx]?.id;
          if (nextId && `tab:${nextId}` !== activeViewEditorId) setActiveViewEditorId(`tab:${nextId}`);
        };

        const removeTab = () => {
          const allTabs = getTabs();
          const next = allTabs.filter((_, i) => i !== realIdx);
          setTabs(next);
          const nextViewTab = next.find((tab) => tab.type !== "form");
          setActiveViewEditorId(nextViewTab ? `tab:${nextViewTab.id}` : "");
        };

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

                    updateTab((prev) => {
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
                        config: { ...defaultCalendarConfig(), sourceTable: "" },
                      };
                    });
                  }}
                  disabled={readOnly}
                >
                  <option value="treeview">Tree View</option>
                  <option value="calendar">Calendario</option>
                </select>
              </div>
            </div>

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
                              source: { ...(prev.config?.source || {}), table },
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
                        onClick={() => {
                          const table = t.config?.source?.table || t.config?.sourceTable || "";
                          if (table) ensureFieldsLoaded(table);
                          setPickTarget("columns");
                          setPickOpen(true);
                        }}
                        disabled={readOnly}
                      >
                        Elegir…
                      </button>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
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
                                filters: field
                                  ? [{ op: "eq", field, valueFromParent: "id" }]
                                  : [],
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
                        return (
                          <div className={styles.help}>
                            Selecciona primero una tabla destino…
                          </div>
                        );
                      }

                      return (
                        <>
                          <div>
                            <label className={styles.label}>groupBy (campo)</label>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <input
                                className={styles.input}
                                value={
                                  t.config?.grouping?.groupByField ||
                                  (t.config?.groupBy || [])[0] ||
                                  ""
                                }
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
                            <label className={styles.label}>
                              Filtro por padre (campo FK en source)
                            </label>
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
                            <div className={styles.help}>
                              Se aplicará: field = parentRecord.id
                            </div>
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
                  </div>
                </div>

                <div className="small text-muted mt-2">
                  Nota: el TreeView genérico espera <code>source.table</code>,{" "}
                  <code>grouping.groupByField</code> y <code>columns</code> como objetos.
                </div>
              </div>
            )}

            {t.type === "calendar" && (
              (() => {
                const calendarConfig = normalizeCalendarConfig(t.config);
                const sourceModuleSlug = calendarConfig.sourceModuleSlug || t.config?.sourceTable || "";
                const calendarFields = getTableFields(sourceModuleSlug);
                const titleFieldOptions = sortFieldsForCalendar(calendarFields, ["text", "textarea", "select"]);
                const startFieldOptions = sortFieldsForCalendar(calendarFields, ["datetime", "date"]);
                const endFieldOptions = sortFieldsForCalendar(calendarFields, ["datetime", "date"]);
                const allDayFieldOptions = sortFieldsForCalendar(calendarFields, ["boolean"]);
                const colorFieldOptions = sortFieldsForCalendar(calendarFields, ["color", "text"]);
                const descriptionFieldOptions = sortFieldsForCalendar(calendarFields, ["textarea", "text"]);
                const resourceFieldOptions = sortFieldsForCalendar(calendarFields, ["text", "select", "selectorTabla"]);
                const parentLinkFieldOptions = sortFieldsForCalendar(calendarFields, ["selectorTabla"]);

                const updateCalendarTabConfig = (patch: Partial<CalendarSpecialViewConfig>) =>
                  updateTab((prev) => {
                    if (prev.type !== "calendar") return prev;
                    return {
                      ...prev,
                      config: {
                        ...normalizeCalendarConfig(prev.config),
                        ...patch,
                        sourceTable: patch.sourceModuleSlug ?? sourceModuleSlug,
                      },
                    };
                  });

                return (
                  <div className={styles.card} style={{ marginTop: 12 }}>
                    <h4 style={{ marginTop: 0 }}>Config Calendario</h4>
                    <div className={styles.grid}>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label className={styles.label}>Módulo fuente</label>
                        <Selector
                          moduleSlug="modulos"
                          displayField="nombre"
                          valueField="slug"
                          value={sourceModuleSlug}
                          readOnly={readOnly}
                          placeholder="— Seleccionar módulo —"
                          label="Selecciona el módulo fuente"
                          filters={[
                            { field: "activo", op: "=", value: true },
                            { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] },
                          ]}
                          sort={[{ field: "orden", direction: "asc" }]}
                          onChange={(moduleSlug: string) => {
                            ensureTableFields(moduleSlug);
                            updateCalendarTabConfig({
                            sourceModuleSlug: moduleSlug || "",
                            titleField: "",
                            startField: "",
                            endField: "",
                            allDayField: "",
                            colorField: "",
                            descriptionField: "",
                            resourceField: "",
                            parentLinkField: "",
                          });
                        }}
                      />
                    </div>

                      <div>
                        <label className={styles.label}>Título del evento</label>
                        <select className={styles.input} value={calendarConfig.titleField || ""} onChange={(e) => updateCalendarTabConfig({ titleField: e.target.value })} disabled={readOnly || !sourceModuleSlug}>
                          <option value="">— Seleccionar campo —</option>
                          {titleFieldOptions.map((field) => <option key={field.name} value={field.name}>{field.label || field.name}{field.type ? ` (${field.type})` : ""}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className={styles.label}>Fecha inicio</label>
                        <select className={styles.input} value={calendarConfig.startField || ""} onChange={(e) => updateCalendarTabConfig({ startField: e.target.value })} disabled={readOnly || !sourceModuleSlug}>
                          <option value="">— Seleccionar campo —</option>
                          {startFieldOptions.map((field) => <option key={field.name} value={field.name}>{field.label || field.name}{field.type ? ` (${field.type})` : ""}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className={styles.label}>Fecha fin</label>
                        <select className={styles.input} value={calendarConfig.endField || ""} onChange={(e) => updateCalendarTabConfig({ endField: e.target.value })} disabled={readOnly || !sourceModuleSlug}>
                          <option value="">— Sin campo —</option>
                          {endFieldOptions.map((field) => <option key={field.name} value={field.name}>{field.label || field.name}{field.type ? ` (${field.type})` : ""}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className={styles.label}>Todo el día</label>
                        <select className={styles.input} value={calendarConfig.allDayField || ""} onChange={(e) => updateCalendarTabConfig({ allDayField: e.target.value })} disabled={readOnly || !sourceModuleSlug}>
                          <option value="">— Sin campo —</option>
                          {allDayFieldOptions.map((field) => <option key={field.name} value={field.name}>{field.label || field.name}{field.type ? ` (${field.type})` : ""}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className={styles.label}>Color</label>
                        <select className={styles.input} value={calendarConfig.colorField || ""} onChange={(e) => updateCalendarTabConfig({ colorField: e.target.value })} disabled={readOnly || !sourceModuleSlug}>
                          <option value="">— Sin campo —</option>
                          {colorFieldOptions.map((field) => <option key={field.name} value={field.name}>{field.label || field.name}{field.type ? ` (${field.type})` : ""}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className={styles.label}>Descripción</label>
                        <select className={styles.input} value={calendarConfig.descriptionField || ""} onChange={(e) => updateCalendarTabConfig({ descriptionField: e.target.value })} disabled={readOnly || !sourceModuleSlug}>
                          <option value="">— Sin campo —</option>
                          {descriptionFieldOptions.map((field) => <option key={field.name} value={field.name}>{field.label || field.name}{field.type ? ` (${field.type})` : ""}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className={styles.label}>Resource / responsable</label>
                        <select className={styles.input} value={calendarConfig.resourceField || ""} onChange={(e) => updateCalendarTabConfig({ resourceField: e.target.value })} disabled={readOnly || !sourceModuleSlug}>
                          <option value="">— Sin campo —</option>
                          {resourceFieldOptions.map((field) => <option key={field.name} value={field.name}>{field.label || field.name}{field.type ? ` (${field.type})` : ""}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className={styles.label}>Campo vínculo con el registro actual</label>
                        <select className={styles.input} value={calendarConfig.parentLinkField || ""} onChange={(e) => updateCalendarTabConfig({ parentLinkField: e.target.value })} disabled={readOnly || !sourceModuleSlug}>
                          <option value="">— Autodetectar vínculo —</option>
                          {parentLinkFieldOptions.map((field) => <option key={field.name} value={field.name}>{field.label || field.name}{field.type ? ` (${field.type})` : ""}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className={styles.label}>Vista por defecto</label>
                        <select className={styles.input} value={calendarConfig.defaultView || "month"} onChange={(e) => updateCalendarTabConfig({ defaultView: e.target.value as CalendarViewMode })} disabled={readOnly}>
                          {(calendarConfig.enabledViews || ["month", "week", "day"]).map((viewMode) => (
                            <option key={viewMode} value={viewMode}>
                              {viewMode === "month" ? "Mensual" : viewMode === "week" ? "Semanal" : "Diaria"}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ gridColumn: "1 / -1" }}>
                        <label className={styles.label}>Vistas habilitadas</label>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {(["month", "week", "day"] as CalendarViewMode[]).map((viewMode) => {
                            const enabled = (calendarConfig.enabledViews || []).includes(viewMode);
                            return (
                              <label key={viewMode} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  disabled={readOnly}
                                  onChange={(e) => {
                                    const current = calendarConfig.enabledViews || ["month", "week", "day"];
                                    const nextEnabled = e.target.checked
                                      ? Array.from(new Set([...current, viewMode]))
                                      : current.filter((item) => item !== viewMode);
                                    const safeEnabled = nextEnabled.length ? nextEnabled : [viewMode];
                                    updateCalendarTabConfig({
                                      enabledViews: safeEnabled,
                                      defaultView: safeEnabled.includes(calendarConfig.defaultView || "month")
                                        ? (calendarConfig.defaultView || "month")
                                        : safeEnabled[0],
                                    });
                                  }}
                                />
                                <span>{viewMode === "month" ? "Mensual" : viewMode === "week" ? "Semanal" : "Diaria"}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            )}

            <div className={styles.actionsRow} style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.btn}
                onClick={removeTab}
                disabled={readOnly}
                style={{ background: "#fc0505ff", borderColor: "#ffb3b3" }}
              >
                Eliminar vista
              </button>
            </div>
          </div>
        );
      })()}
    </Section>
  )}

  {/* JSON AVANZADO */}
  {editorTab === "json" && (
    <Section title="JSON avanzado">
      <div className={styles.actionsRow} style={{ justifyContent: "space-between" }}>
        <span className={styles.hint}>Editor avanzado</span>
        <button
          type="button"
          className={styles.btn}
          onClick={() => setShowRaw(!showRaw)}
        >
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
    </Section>
  )}

  {/* ACCIONES */}
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


