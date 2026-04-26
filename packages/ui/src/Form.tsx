"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  CalendarSpecialViewConfig,
  Field,
  FieldType,
  FormSection,
  ModuleSchema,
  SpecialViewConfig,
  TreeViewDataProvider,
  UiTab,
} from "@repo/types";
import { normalizeCalendarConfig, normalizeModuleSchema } from "@repo/types";
import { applyCompute } from "./engines/computeEngine";
import type { DataProvider } from "./engines/computeEngine";
import { evaluateFieldVisibility, evaluateTabVisibility } from "./engines/visibilityEngine";
import { dataProvider as defaultDataProvider } from "./providers/DataProvider";
import ReverseLinkTable from "./ReverseLinkTable";
import TreeView from "./TreeView";
import FormActionsBar from "./ModuloForm/FormActionsBar";
import type { FormAction } from "./ModuloForm/FormActionsBar";
import DetachedFieldInput from "./FieldInput";
import ModuleCalendarView from "./ModuleCalendarView";
import PdfTemplatePreview from "./PdfTemplatePreview";
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
type RuntimeTab =
  | UiTab
    | {
        id: string;
        label: string;
        type: "special-view";
        config: SpecialViewConfig;
        visibility?: SpecialViewConfig["visibility"];
      };

type Props = {
  schema: ModuleSchema;
  initialData?: any;
  recordId?: string;
  moduleSlug?: string;
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
  schemasBySlug?: Record<string, ModuleSchema>;
  schemasByTable?: Record<string, ModuleSchema>;
  modulesBySlug?: Record<string, { db?: { table?: string; primaryKey?: string } }>;
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
    case "1/4":
      return "col-12 col-md-2";

    case "1/1":
    default:
      return "col-12";
  }
}

export default function Form({
  schema,
  initialData = {},
  recordId,
  moduleSlug,
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
  schemasByTable,
  modulesBySlug,
}: Props) {
  const normalizedSchema = useMemo(() => normalizeModuleSchema(schema), [schema]);
  const effectiveMode: Mode = mode || (readOnly ? "view" : "edit");
  const effectiveRecordId = useMemo(
    () => String(recordId ?? initialData?.id ?? initialData?.[normalizedSchema?.db?.primaryKey || "id"] ?? "").trim(),
    [recordId, initialData, normalizedSchema?.db?.primaryKey]
  );
  const effectiveModuleSlug = useMemo(() => {
    if (moduleSlug) return String(moduleSlug).trim();
    const schemaTable = String(normalizedSchema?.db?.table || "").trim();
    if (!schemaTable || !modulesBySlug) return "";
    if (modulesBySlug[schemaTable]) return schemaTable;
    for (const [slug, mod] of Object.entries(modulesBySlug)) {
      if (mod?.db?.table === schemaTable) return slug;
    }
    return "";
  }, [moduleSlug, normalizedSchema?.db?.table, modulesBySlug]);

  const tabsDesdeSchema = useMemo<UiTab[]>(() => {
    const uiAny = (normalizedSchema.ui || {}) as any;
    const rawTabs = Array.isArray(uiAny?.tabs) ? uiAny.tabs : [];

    return rawTabs
      .map((tab: any, index: number) => {
        const type = (tab?.type || tab?.kind || "form") as UiTab["type"];
        const id = String(tab?.id || `${type}_${index + 1}`);
        const label = String(tab?.label || tab?.title || (type === "form" ? "Formulario" : type));
        return { id, label, type, config: tab?.config ?? tab, visibility: tab?.visibility };
      })
      .filter((tab: UiTab) => ["form", "treeview", "calendar"].includes(tab.type));
  }, [normalizedSchema.ui]);

  const specialViews = useMemo<SpecialViewConfig[]>(() => {
    const uiAny = (normalizedSchema.ui || {}) as any;
    return Array.isArray(uiAny?.specialViews) ? (uiAny.specialViews as SpecialViewConfig[]) : [];
  }, [normalizedSchema.ui]);

  const legacyTreeCfg = useMemo(() => {
    const uiAny = (normalizedSchema.ui || {}) as any;
    return uiAny?.treeView ?? null;
  }, [normalizedSchema.ui]);

  const legacyCalendarCfg = useMemo(() => {
    const uiAny = (normalizedSchema.ui || {}) as any;
    return uiAny?.calendar ?? null;
  }, [normalizedSchema.ui]);

  const uiTabs = useMemo<UiTab[]>(() => {
    if (tabsDesdeSchema.length > 0) return tabsDesdeSchema;

    const hasLegacy = !!legacyTreeCfg || !!legacyCalendarCfg;
    if (!hasLegacy) return [];

    const tabs: UiTab[] = [
      {
        id: "__form__",
        label: "Formulario",
        type: "form",
        config: { formSections: (normalizedSchema.ui as any)?.formSections || [] },
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
  }, [tabsDesdeSchema, legacyTreeCfg, legacyCalendarCfg, normalizedSchema.ui]);

  const runtimeTabs = useMemo<RuntimeTab[]>(() => {
    const baseTabs = [...uiTabs];
    const hasSpecialViews = specialViews.length > 0;
    const hasFormTab = baseTabs.some((tab) => tab.type === "form");

    if (hasSpecialViews && !hasFormTab) {
      baseTabs.unshift({
        id: "__form__",
        label: "Formulario",
        type: "form",
        config: { formSections: (normalizedSchema.ui as any)?.formSections || [] },
      });
    }

    return [
      ...baseTabs,
      ...specialViews.map<RuntimeTab>((view) => ({
        id: `special:${view.id}`,
        label: view.label,
        type: "special-view",
        config: view,
        visibility: view.visibility,
      })),
    ];
  }, [specialViews, normalizedSchema.ui, uiTabs]);

  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [activeReverseLink, setActiveReverseLink] = useState<string | null>(null);
  const [resolvedDisplayValues, setResolvedDisplayValues] = useState<ResolvedDisplayState>({});
  const [displayLoadingFields, setDisplayLoadingFields] = useState<Record<string, boolean>>({});
  const [relatedRecordsByField, setRelatedRecordsByField] = useState<Record<string, any>>({});

  const syncedInitialValues = useMemo(() => buildInitialValues(normalizedSchema as ModuleSchema, initialData), [normalizedSchema, initialData]);
  const [values, setValues] = useState<FormValues>(syncedInitialValues);
  const valuesRef = useRef<FormValues>(syncedInitialValues);
  const aggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingComputeRef = useRef(false);
  const lastComputedSigRef = useRef<string>(computeSignature(normalizedSchema as ModuleSchema, syncedInitialValues));
  const displayCacheRef = useRef<ResolvedDisplayState>({});
  const displayRequestRef = useRef<Record<string, number>>({});

  const formActions = useMemo(
    () => (((normalizedSchema.ui as any)?.formActions as FormAction[]) || []),
    [normalizedSchema.ui]
  );

  const visibilityRelationFields = useMemo(() => {
    const relationFields = new Map<string, string>();

    const visibilityTargets = [
      ...(normalizedSchema.fields || []),
      ...formActions,
      ...runtimeTabs,
    ];

    for (const target of visibilityTargets) {
      const visibility = (target as any).visibility;
      if (!visibility?.enabled || !Array.isArray(visibility.rules)) continue;

      for (const rule of visibility.rules) {
        if (rule?.source !== "relatedRecord") continue;
        const relationField = String(rule.relationField || "").trim();
        if (relationField && !relationFields.has(relationField)) {
          relationFields.set(relationField, String(rule.relatedModuleSlug || "").trim());
        }
      }
    }

    return Array.from(relationFields.entries()).map(([relationField, configuredModuleSlug]) => {
      const field = (normalizedSchema.fields || []).find((candidate) => candidate.name === relationField);
      return {
        relationField,
        moduleSlug: configuredModuleSlug || String((field as any)?.ref?.moduleSlug || "").trim(),
        valueField: String((field as any)?.ref?.valueField || "id").trim() || "id",
      };
    });
  }, [normalizedSchema.fields, formActions, runtimeTabs]);

  const visibleRuntimeTabs = useMemo(() => {
    return runtimeTabs.filter((tab) => {
      try {
        return evaluateTabVisibility({
          tab,
          values,
          schema: normalizedSchema as ModuleSchema,
          relatedRecordsByField,
        });
      } catch (e) {
        console.warn("Error evaluando visibilidad de pestaña", tab?.id, e);
        return false;
      }
    });
  }, [runtimeTabs, values, normalizedSchema, relatedRecordsByField]);

  const visibilityRelationValuesKey = useMemo(
    () =>
      visibilityRelationFields
        .map(({ relationField }) => {
          const raw = values?.[relationField];
          const value = Array.isArray(raw) ? raw.join(",") : String(raw ?? "");
          return `${relationField}:${value}`;
        })
        .join("|"),
    [visibilityRelationFields, values]
  );

  useEffect(() => {
    if (!visibleRuntimeTabs.length) {
      setActiveTabId(null);
      return;
    }

    if (!activeTabId || !visibleRuntimeTabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(visibleRuntimeTabs[0].id);
    }
  }, [visibleRuntimeTabs, activeTabId]);

  const activeTab = useMemo(() => {
    if (!visibleRuntimeTabs.length) return null;
    return visibleRuntimeTabs.find((tab) => tab.id === activeTabId) ?? visibleRuntimeTabs[0];
  }, [visibleRuntimeTabs, activeTabId]);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    valuesRef.current = syncedInitialValues;
    setValues(syncedInitialValues);
    lastComputedSigRef.current = computeSignature(normalizedSchema as ModuleSchema, syncedInitialValues);
  }, [normalizedSchema, syncedInitialValues]);

  useEffect(() => {
    if (visibilityRelationFields.length === 0) {
      setRelatedRecordsByField({});
      return;
    }

    let cancelled = false;

    const loadRelatedRecords = async () => {
      const nextRecords: Record<string, any> = {};

      await Promise.all(
        visibilityRelationFields.map(async ({ relationField, moduleSlug, valueField }) => {
          const rawValue = valuesRef.current?.[relationField];
          const selectedId = Array.isArray(rawValue) ? rawValue[0] : rawValue;
          if (selectedId === null || selectedId === undefined || selectedId === "" || !moduleSlug) return;

          try {
            let record: any | null = null;
            if (typeof dataProvider.getOne === "function" && valueField === "id") {
              record = await dataProvider.getOne(moduleSlug, String(selectedId));
            } else if (typeof dataProvider.list === "function") {
              const result = await dataProvider.list({
                moduleSlug,
                filters: [{ field: valueField, op: "=", value: selectedId }],
                limit: 1,
              });
              record = Array.isArray(result?.data) ? result.data[0] ?? null : null;
            }

            if (record) nextRecords[relationField] = record;
          } catch {
            // Visibility rules are non-critical: missing related data simply makes those rules false.
          }
        })
      );

      if (!cancelled) setRelatedRecordsByField(nextRecords);
    };

    void loadRelatedRecords();

    return () => {
      cancelled = true;
    };
  }, [visibilityRelationFields, visibilityRelationValuesKey, dataProvider]);

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

    const relationalFields = (normalizedSchema.fields || []).filter((field) => !!getRelationDisplayConfig(field));
    void Promise.all(relationalFields.map((field) => resolveFieldDisplayValue(field)));

    return () => {
      cancelled = true;
    };
  }, [normalizedSchema.fields, values, dataProvider]);

  const reverseLinkFields = useMemo(
    () => (normalizedSchema.fields || []).filter((field) => field.type === "ReverseLink"),
    [normalizedSchema.fields]
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

    return (((normalizedSchema.ui as any)?.formSections as FormSection[]) || []) as FormSection[];
  }, [activeTab, normalizedSchema.ui]);

  useEffect(() => {
    const firstId = formSections[0]?.id;
    setOpenSections(firstId ? { [firstId]: true } : {});
  }, [activeTabId, formSections]);

  const fieldsByName = useMemo(() => {
    const map: Record<string, Field> = {};
    for (const field of normalizedSchema.fields || []) {
      map[field.name] = field;
    }
    return map;
  }, [normalizedSchema.fields]);

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

    return (normalizedSchema.fields || []).filter((field) => {
      if (field.type === "ReverseLink") return false;
      return !fieldsInSections.has(field.name);
    });
  }, [formSections.length, normalizedSchema.fields, fieldsInSections]);

  const moduleFolder = normalizedSchema?.db?.table || "general";
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
    if (!normalizedSchema?.fields?.length) return;

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
          schema: normalizedSchema as ModuleSchema,
          record: valuesRef.current,
          dataProvider,
        });

        const sig = computeSignature(normalizedSchema as ModuleSchema, computed);
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
  }, [normalizedSchema, effectiveMode, dataProvider, computeDepsKey]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (effectiveMode === "view") return;

    try {
      const payload = { ...(values || {}) };
      delete payload.meta;

      for (const field of normalizedSchema.fields || []) {
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
    if (
      !evaluateFieldVisibility({
        field,
        values,
        schema: normalizedSchema as ModuleSchema,
        relatedRecordsByField,
      })
    ) {
      // Hidden fields keep their current value; visibility is a rendering concern, not data mutation.
      return null;
    }
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
            {field.required && <span style={{ color: "red", marginLeft: 4 }}>*</span>}
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
            formValues={values}
          />

          {helpText && <div className="form-text mt-1">{helpText}</div>}

          {computing && (field as any).compute && !isOverride && (
            <div className="small text-muted mt-1">recalculando...</div>
          )}
        </div>
      </div>
    );
  };

  const hasConfiguredTabs = runtimeTabs.length > 0;
  const noVisibleTabs = hasConfiguredTabs && visibleRuntimeTabs.length === 0;
  const showMainTabs = visibleRuntimeTabs.length > 0;
  const showFormContent = !hasConfiguredTabs || activeTab?.type === "form";
  const showSpecialViewContent = activeTab?.type === "special-view";
  const showReverseLinks = showFormContent && !noVisibleTabs;

  const resolveTable = useMemo(() => {
    return (moduleSlug: string) => {
      const source = String(moduleSlug || "").trim();
      if (!source) return null;

      let moduleConfig = modulesBySlug?.[source];
      if (!moduleConfig && modulesBySlug) {
        for (const [, mod] of Object.entries(modulesBySlug)) {
          const table = String((mod as any)?.db?.table || (mod as any)?.table || "").trim();
          if (table && table === source) {
            moduleConfig = mod;
            break;
          }
        }
      }

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

  const treeSourceModuleSlug = useMemo(() => {
    const source = String(treeSourceSlug || "").trim();
    if (!source) return null;
    if (schemasBySlug?.[source]) return source;
    if (!modulesBySlug) return null;

    for (const [slugKey, mod] of Object.entries(modulesBySlug)) {
      const table = String((mod as any)?.db?.table || (mod as any)?.table || "").trim();
      if (table && table === source) return slugKey;
    }

    return null;
  }, [modulesBySlug, schemasBySlug, treeSourceSlug]);

  const treeSchemaFields = useMemo(() => {
    if (!treeSourceSlug) return normalizedSchema.fields;
    const source = String(treeSourceSlug || "").trim();
    const resolvedSource = resolveTable(source);
    const resolvedTable = String(resolvedSource?.table || "").trim();
    const sourceTableKey = resolvedTable || source;
    const configuredFields = Array.from(
      new Set(
        [
          (treeViewConfig as any)?.grouping?.groupByField,
          ...((Array.isArray((treeViewConfig as any)?.groupBy) ? (treeViewConfig as any).groupBy : []) as string[]),
          ...(((treeViewConfig as any)?.columns || []) as any[]).map((column) => column?.field || column?.name),
          (treeViewConfig as any)?.totals?.sumField,
        ]
          .map((field) => String(field || "").trim())
          .filter(Boolean)
      )
    );

    const candidates = [
      sourceTableKey ? schemasByTable?.[sourceTableKey] : undefined,
      treeSourceModuleSlug ? schemasBySlug?.[treeSourceModuleSlug] : undefined,
      schemasBySlug?.[source],
      resolvedTable ? schemasByTable?.[resolvedTable] : undefined,
      ...Object.values(schemasBySlug || {}).filter((candidate: any) => {
        const candidateTable = String(candidate?.db?.table || "").trim();
        return !!candidateTable && candidateTable === sourceTableKey;
      }),
      ...Object.values(schemasByTable || {}).filter((candidate: any) => {
        const candidateTable = String(candidate?.db?.table || "").trim();
        return !!candidateTable && candidateTable === sourceTableKey;
      }),
    ].filter((candidate): candidate is ModuleSchema => !!candidate && Array.isArray(candidate.fields));

    const scoredCandidates = candidates
      .map((candidate) => {
        const fieldNames = new Set((candidate.fields || []).map((field: any) => String(field?.name || "").trim()).filter(Boolean));
        const coverage = configuredFields.reduce((acc, fieldName) => acc + (fieldNames.has(fieldName) ? 1 : 0), 0);
        return { candidate, coverage, totalFields: candidate.fields.length };
      })
      .sort((a, b) => (b.coverage - a.coverage) || (b.totalFields - a.totalFields));

    const moduleSchema = scoredCandidates[0]?.candidate;

    return moduleSchema?.fields || normalizedSchema.fields;
  }, [
    resolveTable,
    schemasBySlug,
    schemasByTable,
    treeSourceModuleSlug,
    treeSourceSlug,
    normalizedSchema.fields,
    (treeViewConfig as any)?.grouping?.groupByField,
    JSON.stringify((treeViewConfig as any)?.groupBy || []),
    JSON.stringify((treeViewConfig as any)?.columns || []),
    (treeViewConfig as any)?.totals?.sumField,
  ]);

  const renderFormContent = () => {
    if (formSections.length > 0) {
      return (
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
        </div>
      );
    }

    return <div className="row g-3">{(normalizedSchema.fields || []).map((field) => renderField(field))}</div>;
  };

  const renderTreeViewContent = () => (
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
  );

  const renderCalendarContent = () => (
    <div className="card">
      <div className="card-header">
        <div className="fw-semibold">{calendarConfig?.ui?.title || "Calendario"}</div>
        <div className="small text-muted">
          Módulo fuente: {calendarConfig?.sourceModuleSlug || calendarConfig?.sourceTable || "-"}
        </div>
      </div>

      <div className="card-body">
        <ModuleCalendarView
          config={normalizeCalendarConfig(calendarConfig)}
          dataProvider={dataProvider}
          sourceSchema={schemasBySlug?.[normalizeCalendarConfig(calendarConfig).sourceModuleSlug]}
          parentSchema={schema}
          parentModuleSlug={effectiveModuleSlug}
          parentRecordId={effectiveRecordId}
        />
      </div>
    </div>
  );

  const renderSpecialView = (view: SpecialViewConfig) => {
    switch (view.type) {
      case "pdfPreview":
        return (
          <PdfTemplatePreview
            templateId={view.config?.pdfTemplateId}
            recordId={effectiveRecordId}
            recordData={values}
            schema={schema}
            active={showSpecialViewContent}
            emptyMessage="Esta vista especial todavía no tiene una plantilla PDF seleccionada."
          />
        );
      case "calendar":
        return (
          <ModuleCalendarView
            config={normalizeCalendarConfig(view.config)}
            dataProvider={dataProvider}
            sourceSchema={schemasBySlug?.[normalizeCalendarConfig(view.config).sourceModuleSlug]}
            parentSchema={schema}
            parentModuleSlug={effectiveModuleSlug}
            parentRecordId={effectiveRecordId}
          />
        );
      default:
        return <div className="alert alert-warning mb-0">Tipo de vista no soportado.</div>;
    }
  };

  const renderSpecialViewContent = () => {
    if (!activeTab || activeTab.type !== "special-view") return null;
    return renderSpecialView(activeTab.config);
  };

  return (
    <form className="d-flex flex-column gap-4" onSubmit={handleSubmit}>
      {showMainTabs && (
        <div className="d-flex gap-4 mb-3 border-bottom" style={{ 
        overflowX: "auto",
        overflowY: "hidden",
        WebkitOverflowScrolling: "touch",
        borderBottom: "1px solid #e5e7eb",}}>
          {visibleRuntimeTabs.map((tab) => {
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

      {noVisibleTabs ? (
        <div className="alert alert-secondary mb-0">No hay pestañas disponibles para este registro.</div>
      ) : showFormContent ? (
        renderFormContent()
      ) : showSpecialViewContent ? (
        renderSpecialViewContent()
      ) : activeTab?.type === "treeview" ? (
        renderTreeViewContent()
      ) : (
        renderCalendarContent()
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
          schema={normalizedSchema as ModuleSchema}
          mode={effectiveMode}
          values={values}
          setValues={commitValues}
          actions={formActions}
          resolveRoute={resolveRoute}
          relatedRecordsByField={relatedRecordsByField}
        />
        {renderActions()}
      </div>
    </form>
  );
}
