"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  Field,
  FieldType,
  FormSection,
  ModuleSchema,
  TreeViewDataProvider,
  UiTab,
} from "@repo/types";
import { applyCompute } from "./engines/computeEngine";
import type { DataProvider } from "./engines/computeEngine";
import { dataProvider as defaultDataProvider } from "./providers/DataProvider";
import ReverseLinkTable from "./ReverseLinkTable";
import TreeView from "./TreeView";
import FormActionsBar from "./ModuloForm/FormActionsBar";
import type { FormAction } from "./ModuloForm/FormActionsBar";
import DetachedFieldInput from "./FieldInput";
import {
  buildRelationDisplayEntry,
  getRelationCacheKey,
  getRelationDisplayConfig,
  getRelationDisplayFallback,
  normalizeRelationIds,
} from "./utils/relationDisplay";

type Mode = "view" | "edit" | "create";
type FormValues = Record<string, any>;
type ResolvedDisplayState = Record<string, { value: string; icon?: string; color?: string }>;

type Props = {
  schema: ModuleSchema;
  initialData?: any;
  onChange?: (values: any) => void | Promise<void>;
  readOnly?: boolean;
  mode?: Mode;
  onSubmit?: (values: any) => void;
  onBack?: () => void;
  onEdit?: () => void;
  dataProvider?: DataProvider;
  treeViewProvider?: TreeViewDataProvider;
  treeViewParentRecord?: any;
  onTreeViewRowView?: (row: any) => void;
  onTreeViewRowEdit?: (row: any) => void;
  confirmTreeViewDelete?: (row: any) => Promise<boolean>;
  modulesBySlug?: Record<string, { db?: { table?: string; primaryKey?: string } }>;
  schemasBySlug?: Record<string, ModuleSchema>;
};

function computeSignature(schema: ModuleSchema, record: FormValues) {
  const out: Record<string, any> = {};

  for (const field of schema.fields || []) {
    const compute = (field as any).compute;
    if (!compute || compute.type === "none") continue;
    out[field.name] = record?.[field.name];
  }

  return JSON.stringify(out);
}

function isFieldVisibleInMode(field: Field, mode: Mode) {
  if (field.visible === false) return false;

  const visibleWhen = (field as any).visibleWhen || "add_edit";
  if (mode === "create") return visibleWhen === "add" || visibleWhen === "add_edit";
  if (mode === "edit") return visibleWhen === "edit" || visibleWhen === "add_edit";
  return true;
}

function isOverrideEnabled(values: FormValues, fieldName: string) {
  return !!values?.meta?.overrides?.[fieldName]?.enabled;
}

function isFieldReadOnly(field: Field, options: { readOnly?: boolean; mode: Mode; isOverride: boolean }) {
  const { readOnly, mode, isOverride } = options;
  const hasCompute = !!(field as any).compute;
  const allowOverride = !!(field as any).allowOverride;

  return (
    !!readOnly ||
    mode === "view" ||
    (!!field.readOnly && !isOverride) ||
    (hasCompute && !allowOverride && field.type !== "selectorTabla")
  );
}

function getFieldHelp(field: Field) {
  return (field as any).ui?.help as string | undefined;
}

function withDefaultValues(fields: Field[], base: FormValues) {
  const out = { ...(base || {}) };

  for (const field of fields) {
    if (out[field.name] !== undefined) continue;

    if ((field.type === "file" || field.type === "image") && (field as any).multiple) {
      out[field.name] = [];
    } else {
      out[field.name] = field.defaultValue ?? defaultForType(field.type as FieldType);
    }
  }

  return out;
}

function defaultForType(type: FieldType): any {
  switch (type) {
    case "number":
    case "money":
    case "percent":
      return 0;
    case "boolean":
      return false;
    case "multiselect":
      return [];
    case "file":
    case "image":
      return "";
    default:
      return "";
  }
}

function normalizeInitialData(fields: Field[], data: FormValues) {
  const out = { ...(data || {}) };

  for (const field of fields) {
    const raw = out[field.name];

    if (field.type !== "file" && field.type !== "image") continue;
    if (raw == null || raw === "") continue;

    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          out[field.name] = JSON.parse(trimmed);
        } catch {
          // Preserve original value if parsing fails.
        }
      }
    }

    if ((field as any).multiple) {
      if (!Array.isArray(out[field.name])) {
        out[field.name] = out[field.name] ? [out[field.name]] : [];
      }
      continue;
    }

    if (Array.isArray(out[field.name])) {
      out[field.name] = out[field.name][0] || "";
    }
  }

  return out;
}

function buildInitialValues(schema: ModuleSchema, initialData: FormValues) {
  return withDefaultValues(schema.fields, normalizeInitialData(schema.fields, initialData));
}

function labelStyle(): React.CSSProperties {
  return { display: "block", marginBottom: 4, fontSize: 12 };
}

function lightDeps(values: FormValues) {
  const { meta, ...rest } = values || {};
  const overrides = meta?.overrides || {};
  const overrideSnapshot = Object.keys(overrides)
    .sort()
    .reduce<Record<string, { enabled: boolean; value: any }>>((acc, key) => {
      acc[key] = {
        enabled: !!overrides[key]?.enabled,
        value: overrides[key]?.value,
      };
      return acc;
    }, {});

  return { ...rest, _overrides: overrideSnapshot };
}

function getColumnClass(field: Field): string {
  const width = field.ui?.width || "1/1";

  switch (width) {
    case "1/2":
      return "col-12 col-md-6";
    case "1/3":
      return "col-12 col-md-4";
    case "2/3":
      return "col-12 col-md-8";
    case "1/1":
    default:
      return "col-12";
  }
}

export default function Form({
  schema,
  initialData = {},
  onChange,
  readOnly,
  mode,
  onSubmit,
  onBack,
  onEdit,
  dataProvider = defaultDataProvider,
  treeViewProvider,
  treeViewParentRecord,
  onTreeViewRowView,
  onTreeViewRowEdit,
  confirmTreeViewDelete,
  schemasBySlug,
  modulesBySlug,
}: Props) {
  const effectiveMode: Mode = mode || (readOnly ? "view" : "edit");

  const tabsDesdeSchema = useMemo<UiTab[]>(() => {
    const uiAny = (schema.ui || {}) as any;
    const rawTabs = Array.isArray(uiAny?.tabs) ? uiAny.tabs : [];

    return rawTabs
      .map((tab: any, index: number) => {
        const type = (tab?.type || tab?.kind || "form") as UiTab["type"];
        const id = String(tab?.id || `${type}_${index + 1}`);
        const label = String(tab?.label || tab?.title || (type === "form" ? "Formulario" : type));
        return { id, label, type, config: tab?.config ?? tab };
      })
      .filter((tab: UiTab) => ["form", "treeview", "calendar"].includes(tab.type));
  }, [schema.ui]);

  const legacyTreeCfg = useMemo(() => {
    const uiAny = (schema.ui || {}) as any;
    return uiAny?.treeView ?? null;
  }, [schema.ui]);

  const legacyCalendarCfg = useMemo(() => {
    const uiAny = (schema.ui || {}) as any;
    return uiAny?.calendar ?? null;
  }, [schema.ui]);

  const uiTabs = useMemo<UiTab[]>(() => {
    if (tabsDesdeSchema.length > 0) return tabsDesdeSchema;

    const hasLegacy = !!legacyTreeCfg || !!legacyCalendarCfg;
    if (!hasLegacy) return [];

    const tabs: UiTab[] = [
      {
        id: "__form__",
        label: "Formulario",
        type: "form",
        config: { formSections: (schema.ui as any)?.formSections || [] },
      },
    ];

    if (legacyTreeCfg) {
      tabs.push({
        id: "__treeview__",
        label: legacyTreeCfg?.ui?.title || "TreeView",
        type: "treeview",
        config: legacyTreeCfg,
      });
    }

    if (legacyCalendarCfg) {
      tabs.push({
        id: "__calendar__",
        label: legacyCalendarCfg?.ui?.title || "Calendario",
        type: "calendar",
        config: legacyCalendarCfg,
      });
    }

    return tabs;
  }, [tabsDesdeSchema, legacyTreeCfg, legacyCalendarCfg, schema.ui]);

  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [activeReverseLink, setActiveReverseLink] = useState<string | null>(null);
  const [resolvedDisplayValues, setResolvedDisplayValues] = useState<ResolvedDisplayState>({});
  const [displayLoadingFields, setDisplayLoadingFields] = useState<Record<string, boolean>>({});

  const syncedInitialValues = useMemo(() => buildInitialValues(schema, initialData), [schema, initialData]);
  const [values, setValues] = useState<FormValues>(syncedInitialValues);
  const valuesRef = useRef<FormValues>(syncedInitialValues);
  const aggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingComputeRef = useRef(false);
  const lastComputedSigRef = useRef<string>(computeSignature(schema, syncedInitialValues));
  const displayCacheRef = useRef<ResolvedDisplayState>({});
  const displayRequestRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!uiTabs.length) {
      setActiveTabId(null);
      return;
    }

    if (!activeTabId || !uiTabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(uiTabs[0].id);
    }
  }, [uiTabs, activeTabId]);

  const activeTab = useMemo(() => {
    if (!uiTabs.length) return null;
    return uiTabs.find((tab) => tab.id === activeTabId) ?? uiTabs[0];
  }, [uiTabs, activeTabId]);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    valuesRef.current = syncedInitialValues;
    setValues(syncedInitialValues);
    lastComputedSigRef.current = computeSignature(schema, syncedInitialValues);
  }, [schema, syncedInitialValues]);

  useEffect(() => {
    let cancelled = false;

    const setFieldDisplayValue = (fieldName: string, nextValue: { value: string; icon?: string; color?: string }) => {
      setResolvedDisplayValues((prev) => {
        const current = prev[fieldName];
        if (
          current?.value === nextValue.value &&
          current?.icon === nextValue.icon &&
          current?.color === nextValue.color
        ) {
          return prev;
        }

        return { ...prev, [fieldName]: nextValue };
      });
    };

    const setFieldLoading = (fieldName: string, isLoading: boolean) => {
      setDisplayLoadingFields((prev) => {
        if (!!prev[fieldName] === isLoading) return prev;

        if (!isLoading) {
          const { [fieldName]: _removed, ...rest } = prev;
          return rest;
        }

        return { ...prev, [fieldName]: true };
      });
    };

    const resolveFieldDisplayValue = async (field: Field) => {
      const config = getRelationDisplayConfig(field);
      if (!config) return;

      const rawValue = values[field.name];
      const ids = normalizeRelationIds(rawValue, config.multiple);
      const fallback = getRelationDisplayFallback(rawValue, config.multiple);

      if (ids.length === 0) {
        setFieldLoading(field.name, false);
        setFieldDisplayValue(field.name, { value: "" });
        return;
      }

      const cachedEntries = ids.map((id) => displayCacheRef.current[getRelationCacheKey(config, id)]);
      if (cachedEntries.every(Boolean)) {
        setFieldLoading(field.name, false);
        setFieldDisplayValue(field.name, {
          value: cachedEntries.map((entry) => entry!.value).join(", "),
          icon: !config.multiple && cachedEntries[0]?.icon ? cachedEntries[0].icon : undefined,
          color: !config.multiple && cachedEntries[0]?.color ? cachedEntries[0].color : undefined,
        });
        return;
      }

      const requestId = (displayRequestRef.current[field.name] || 0) + 1;
      displayRequestRef.current[field.name] = requestId;
      setFieldLoading(field.name, true);

      try {
        const missingIds = ids.filter((id) => !displayCacheRef.current[getRelationCacheKey(config, id)]);
        let rows: any[] = [];

        if (missingIds.length > 0 && typeof (dataProvider as any)?.list === "function") {
          const result = await (dataProvider as any).list({
            moduleSlug: config.moduleSlug,
            filters: [
              {
                field: config.valueField,
                op: missingIds.length > 1 ? "in" : "=",
                value: missingIds.length > 1 ? missingIds : missingIds[0],
              },
            ],
            limit: Math.min(missingIds.length, 500),
            hasStyle: config.hasStyle,
            styleIconField: config.styleIconField,
            styleColorField: config.styleColorField,
          });

          rows = Array.isArray(result?.data) ? result.data : [];
        } else if (
          missingIds.length === 1 &&
          config.valueField === "id" &&
          typeof (dataProvider as any)?.getOne === "function"
        ) {
          const row = await (dataProvider as any).getOne(config.moduleSlug, missingIds[0]);
          rows = row ? [row] : [];
        }

        for (const row of rows) {
          const rowId = row?.[config.valueField];
          if (rowId === null || rowId === undefined || rowId === "") continue;

          const cacheKey = getRelationCacheKey(config, String(rowId));
          const entry = buildRelationDisplayEntry(config, row);
          if (!entry) continue;
          displayCacheRef.current[cacheKey] = {
            value: entry.label,
            icon: entry.icon,
            color: entry.color,
          } as any;
        }

        if (cancelled || displayRequestRef.current[field.name] !== requestId) return;

        const resolvedEntries = ids.map((id) => displayCacheRef.current[getRelationCacheKey(config, id)] as any);
        const resolvedValue = resolvedEntries
          .map((entry, index) => entry?.value || ids[index])
          .join(", ");

        setFieldDisplayValue(field.name, {
          value: resolvedValue || fallback,
          icon: !config.multiple && resolvedEntries[0]?.icon ? resolvedEntries[0].icon : undefined,
          color: !config.multiple && resolvedEntries[0]?.color ? resolvedEntries[0].color : undefined,
        });
      } catch {
        if (cancelled || displayRequestRef.current[field.name] !== requestId) return;
        setFieldDisplayValue(field.name, { value: fallback });
      } finally {
        if (cancelled || displayRequestRef.current[field.name] !== requestId) return;
        setFieldLoading(field.name, false);
      }
    };

    const relationalFields = (schema.fields || []).filter((field) => !!getRelationDisplayConfig(field));
    void Promise.all(relationalFields.map((field) => resolveFieldDisplayValue(field)));

    return () => {
      cancelled = true;
    };
  }, [schema.fields, values, dataProvider]);

  const reverseLinkFields = useMemo(
    () => (schema.fields || []).filter((field) => field.type === "ReverseLink"),
    [schema.fields]
  );

  useEffect(() => {
    if (reverseLinkFields.length === 0) {
      setActiveReverseLink(null);
      return;
    }

    const currentStillExists = reverseLinkFields.some((field) => field.name === activeReverseLink);
    if (!currentStillExists) {
      setActiveReverseLink(reverseLinkFields[0].name);
    }
  }, [activeReverseLink, reverseLinkFields]);

  const formSections = useMemo<FormSection[]>(() => {
    if (activeTab?.type === "form") {
      return (activeTab.config?.formSections || []) as FormSection[];
    }

    return (((schema.ui as any)?.formSections as FormSection[]) || []) as FormSection[];
  }, [activeTab, schema.ui]);

  useEffect(() => {
    const firstId = formSections[0]?.id;
    setOpenSections(firstId ? { [firstId]: true } : {});
  }, [activeTabId, formSections]);

  const fieldsByName = useMemo(() => {
    const map: Record<string, Field> = {};
    for (const field of schema.fields || []) {
      map[field.name] = field;
    }
    return map;
  }, [schema.fields]);

  const formActions = (((schema.ui as any)?.formActions as FormAction[]) || []);

  const fieldsInSections = useMemo(() => {
    const names = new Set<string>();
    for (const section of formSections) {
      for (const fieldName of section.fields || []) {
        names.add(fieldName);
      }
    }
    return names;
  }, [formSections]);

  const unsectionedFields = useMemo(() => {
    if (formSections.length === 0) return [];

    return (schema.fields || []).filter((field) => {
      if (field.type === "ReverseLink") return false;
      return !fieldsInSections.has(field.name);
    });
  }, [formSections.length, schema.fields, fieldsInSections]);

  const moduleFolder = schema?.db?.table || "general";
  const computeDepsKey = useMemo(() => JSON.stringify(lightDeps(values)), [values]);

  const commitValues = (
    updater: FormValues | ((current: FormValues) => FormValues),
    options?: { notifyParent?: boolean }
  ) => {
    const nextValues = typeof updater === "function" ? updater(valuesRef.current) : updater;
    valuesRef.current = nextValues;
    setValues(nextValues);

    if (options?.notifyParent) {
      void onChange?.(nextValues);
    }

    return nextValues;
  };

  const handleChange = (name: string, value: any) => {
    commitValues((prev) => ({ ...prev, [name]: value }), { notifyParent: true });
  };

  const toggleOverride = (field: Field, enabled: boolean) => {
    commitValues(
      (prev) => ({
        ...prev,
        meta: {
          ...(prev.meta || {}),
          overrides: {
            ...(prev.meta?.overrides || {}),
            [field.name]: {
              enabled,
              value: enabled ? prev[field.name] ?? null : prev.meta?.overrides?.[field.name]?.value ?? null,
            },
          },
        },
      }),
      { notifyParent: true }
    );
  };

  const setOverrideValue = (field: Field, value: any) => {
    commitValues(
      (prev) => ({
        ...prev,
        meta: {
          ...(prev.meta || {}),
          overrides: {
            ...(prev.meta?.overrides || {}),
            [field.name]: {
              enabled: true,
              value,
            },
          },
        },
        [field.name]: value,
      }),
      { notifyParent: true }
    );
  };

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    if (!schema?.fields?.length) return;

    if (applyingComputeRef.current) {
      applyingComputeRef.current = false;
      return;
    }

    if (effectiveMode === "view") return;

    if (aggTimer.current) clearTimeout(aggTimer.current);
    setComputing(true);

    aggTimer.current = setTimeout(async () => {
      try {
        const computed = await applyCompute({
          schema,
          record: valuesRef.current,
          dataProvider,
        });

        const sig = computeSignature(schema, computed);
        if (sig === lastComputedSigRef.current) return;

        lastComputedSigRef.current = sig;
        applyingComputeRef.current = true;
        commitValues(computed, { notifyParent: true });
      } finally {
        setComputing(false);
      }
    }, 200);

    return () => {
      if (aggTimer.current) {
        clearTimeout(aggTimer.current);
        aggTimer.current = null;
      }
      setComputing(false);
    };
  }, [schema, effectiveMode, dataProvider, computeDepsKey]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (effectiveMode === "view") return;

    try {
      const payload = { ...(values || {}) };
      delete payload.meta;

      for (const field of schema.fields || []) {
        const value = payload[field.name];
        if (field.type === "date") payload[field.name] = value || null;
        if (field.type === "datetime") {
          payload[field.name] = value ? new Date(value).toISOString() : null;
        }
      }

      await onSubmit?.(payload);
    } catch (error) {
      console.error("Error en submit:", error);
      alert((error as any)?.message || "Error guardando");
    }
  };

  const handleBack = () => {
    if (onBack) return onBack();
    if (typeof window !== "undefined") window.history.back();
  };

  const handleEdit = () => {
    if (onEdit) return onEdit();

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("edit", "true");
      window.location.href = url.toString();
    }
  };

  const renderActions = () => (
    <>
      <button type="button" className="btn btn-secondary px-4" onClick={handleBack}>
        Volver
      </button>

      {effectiveMode === "view" && (
        <button type="button" className="btn btn-warning px-4" onClick={handleEdit}>
          Editar
        </button>
      )}

      {(effectiveMode === "edit" || effectiveMode === "create") && (
        <button
          type="submit"
          className="btn btn-primary px-5"
          style={{
            background: "linear-gradient(90deg, #2563eb, #3b82f6)",
            border: "none",
            borderRadius: 10,
            boxShadow: "0 4px 12px rgba(37, 99, 235, 0.35)",
          }}
        >
          Guardar
        </button>
      )}
    </>
  );

  const renderField = (field: Field) => {
    if (!isFieldVisibleInMode(field, effectiveMode)) return null;
    if (field.type === "ReverseLink") return null;

    const value = values[field.name] ?? "";
    const isOverride = isOverrideEnabled(values, field.name);
    const helpText = getFieldHelp(field);
    const resolvedDisplay = resolvedDisplayValues[field.name];
    const isDisplayLoading = !!displayLoadingFields[field.name];
    const readOnlyField = isFieldReadOnly(field, {
      readOnly,
      mode: effectiveMode,
      isOverride,
    });

    return (
      <div key={field.name} className={getColumnClass(field)}>
        <div className="field-box">
          <label style={labelStyle()} className="form-label">
            {field.label}
          </label>

          {(field as any).allowOverride && (
            <div className="d-flex align-items-center gap-2 mb-2">
              <small className="text-muted">Forzar valor</small>
              <input
                type="checkbox"
                className="form-check-input"
                checked={isOverride}
                onChange={(event) => toggleOverride(field, event.target.checked)}
                disabled={effectiveMode === "view"}
              />
            </div>
          )}

          <DetachedFieldInput
            field={field}
            value={value}
            onChange={(nextValue: any) =>
              isOverride ? setOverrideValue(field, nextValue) : handleChange(field.name, nextValue)
            }
            readOnly={readOnlyField}
            uploadFolder={moduleFolder}
            displayValue={resolvedDisplay?.value}
            isDisplayLoading={isDisplayLoading}
            displayIcon={resolvedDisplay?.icon}
            displayColor={resolvedDisplay?.color}
          />

          {helpText && <div className="form-text mt-1">{helpText}</div>}

          {computing && (field as any).compute && !isOverride && (
            <div className="small text-muted mt-1">recalculando...</div>
          )}
        </div>
      </div>
    );
  };

  const showMainTabs = uiTabs.length > 0;
  const showFormContent = !activeTab || activeTab.type === "form";
  const showReverseLinks = showFormContent;

  const resolveTable = useMemo(() => {
    return (moduleSlug: string) => {
      const moduleConfig = modulesBySlug?.[moduleSlug];
      const tableFromDb = moduleConfig?.db?.table;
      const tableFromRoot = (moduleConfig as any)?.table;
      const finalTable = tableFromDb || tableFromRoot;

      if (!finalTable) return null;

      return {
        table: finalTable,
        valueField: moduleConfig?.db?.primaryKey ?? "id",
      };
    };
  }, [modulesBySlug]);

  const resolveRoute = useMemo(() => {
    return (source: string) => {
      const moduleConfig = modulesBySlug?.[source];
      const directRoute = (moduleConfig as any)?.route;

      let routeByTable: string | null = null;
      if (!directRoute && modulesBySlug) {
        for (const [, mod] of Object.entries(modulesBySlug)) {
          if ((mod as any)?.db?.table === source) {
            routeByTable = (mod as any)?.route || null;
            break;
          }
        }
      }

      return (directRoute || routeByTable || null) as string | null;
    };
  }, [modulesBySlug]);

  const treeViewConfig = useMemo(() => {
    if (activeTab?.type === "treeview") return activeTab.config ?? null;
    return legacyTreeCfg;
  }, [activeTab, legacyTreeCfg]);

  const calendarConfig = useMemo(() => {
    if (activeTab?.type === "calendar") return activeTab.config ?? null;
    return legacyCalendarCfg;
  }, [activeTab, legacyCalendarCfg]);

  const treeSourceSlug =
    (treeViewConfig as any)?.source?.table ??
    (treeViewConfig as any)?.sourceTable ??
    null;

  const treeSchemaFields = useMemo(() => {
    if (!treeSourceSlug) return schema.fields;
    const moduleSchema = schemasBySlug?.[treeSourceSlug];
    return moduleSchema?.fields || schema.fields;
  }, [schemasBySlug, treeSourceSlug, schema.fields]);

  return (
    <form className="d-flex flex-column gap-4" onSubmit={handleSubmit}>
      {showMainTabs && (
        <div className="d-flex gap-4 mb-3 border-bottom" style={{ borderColor: "#e5e7eb" }}>
          {uiTabs.map((tab) => {
            const isActive = activeTab?.id === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className="btn btn-link px-0"
                style={{
                  textDecoration: "none",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#2563eb" : "#64748b",
                  borderBottom: isActive ? "2px solid #2563eb" : "2px solid transparent",
                  borderRadius: 0,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {showFormContent ? (
        formSections.length > 0 ? (
          <div className="d-flex flex-column gap-3">
            {formSections.map((section) => {
              const isOpen = !!openSections[section.id];

              return (
                <div key={section.id} className="card">
                  <button
                    type="button"
                    className="card-header d-flex justify-content-between align-items-center w-100"
                    onClick={() => toggleSection(section.id)}
                    style={{
                      cursor: "pointer",
                      background: "transparent",
                      border: "none",
                      textAlign: "left",
                    }}
                  >
                    <div>
                      <div className="fw-semibold">{section.label}</div>
                      {section.description && <div className="small text-muted">{section.description}</div>}
                    </div>
                    <span className="text-muted">{isOpen ? "v" : ">"}</span>
                  </button>

                  {isOpen && (
                    <div className="card-body">
                      <div className="row g-3">
                        {section.fields.map((fieldName) => {
                          const field = fieldsByName[fieldName];
                          if (!field) return null;
                          return renderField(field);
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {unsectionedFields.length > 0 && (
              <div className="card border border-dashed">
                <div className="card-header">
                  <div className="fw-semibold">Otros campos</div>
                  <div className="small text-muted">Campos sin seccion asignada</div>
                </div>
                <div className="card-body">
                  <div className="row g-3">{unsectionedFields.map((field) => renderField(field))}</div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="row g-3">{(schema.fields || []).map((field) => renderField(field))}</div>
        )
      ) : activeTab?.type === "treeview" ? (
        <div className="card">
          <div className="card-header">
            <div className="fw-semibold">{treeViewConfig?.ui?.title || ""}</div>
            <div className="small text-muted">
              {treeViewConfig?.source?.table ? `Tabla: ${treeViewConfig.source.table}` : ""}
              {treeViewConfig?.grouping?.groupByField ? ` | groupBy: ${treeViewConfig.grouping.groupByField}` : ""}
            </div>
          </div>

          <div className="card-body">
            {!treeViewConfig ? (
              <div className="alert alert-warning mb-0">
                No hay configuracion de TreeView en el modulo (schema.ui.treeView o tab.config).
              </div>
            ) : !treeViewProvider ? (
              <div className="alert alert-warning mb-0">
                TreeView esta configurado, pero falta <code>treeViewProvider</code> en el Form.
                <div className="small text-muted mt-2">
                  Esto es intencional: el componente de UI no debe importar Supabase ni createClient.
                </div>
              </div>
            ) : (
              <TreeView
                config={treeViewConfig}
                dataProvider={treeViewProvider}
                parentRecord={treeViewParentRecord ?? values}
                schemaFields={treeSchemaFields}
                onViewRow={onTreeViewRowView}
                onEditRow={onTreeViewRowEdit}
                confirmDelete={confirmTreeViewDelete}
                resolveTable={resolveTable}
                resolveRoute={resolveRoute}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <div className="fw-semibold">{calendarConfig?.ui?.title || "Calendario"}</div>
            <div className="small text-muted">
              Tabla: {calendarConfig?.source?.table || calendarConfig?.sourceTable || "-"}
            </div>
          </div>

          <div className="card-body">
            <div className="text-muted small">
              startField: {calendarConfig?.startField || "-"} | endField: {calendarConfig?.endField || "-"} |
              titleField: {calendarConfig?.titleField || "-"} | colorField: {calendarConfig?.colorField || "-"}
            </div>
          </div>
        </div>
      )}

      {showReverseLinks && reverseLinkFields.length > 0 && (
        <div className="d-flex flex-column gap-3">
          <div className="card">
            <div className="card-header pb-0">
              <ul className="nav nav-tabs card-header-tabs">
                {reverseLinkFields.map((field) => {
                  const isActive = activeReverseLink === field.name;

                  return (
                    <li className="nav-item" key={field.name}>
                      <button
                        type="button"
                        className={`nav-link bg-primary text-light ${isActive ? "active" : ""}`}
                        onClick={() => setActiveReverseLink(field.name)}
                      >
                        {(field.label as string) || field.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="card-body">
              {reverseLinkFields.map((field) => {
                if (activeReverseLink !== field.name) return null;
                return <ReverseLinkTable key={field.name} field={field} parentRecord={values} mode={effectiveMode} />;
              })}
            </div>
          </div>
        </div>
      )}

      <div className="d-flex justify-content-end align-items-center gap-2 flex-wrap mt-3">
        <FormActionsBar
          schema={schema}
          mode={effectiveMode}
          values={values}
          setValues={commitValues}
          actions={formActions}
          resolveRoute={resolveRoute}
        />
        {renderActions()}
      </div>
    </form>
  );
}


