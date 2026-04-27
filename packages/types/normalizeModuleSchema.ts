import type {
  Appareance,
  CalendarSpecialViewConfig,
  CalendarViewMode,
  Field,
  FormSection,
  ModuleSchema,
  PlanEditorSpecialViewConfig,
  SpecialViewConfig,
  TreeViewConfig,
  UiTab,
} from "./fields";

type AnyRecord = Record<string, any>;

export type LegacySchemaWarning = {
  code:
    | "legacy.appareance"
    | "legacy.rootTable"
    | "legacy.formSections"
    | "legacy.previewTabs"
    | "legacy.treeView"
    | "legacy.treeView.sourceTable"
    | "legacy.treeView.groupBy"
    | "legacy.treeView.columns"
    | "legacy.calendar.sourceTable"
    | "invalid.schema"
    | "invalid.field";
  path: string;
  message: string;
};

export type NormalizedField = Field & {
  appearance?: Appareance;
};

export type NormalizedTreeViewConfig = TreeViewConfig;
export type NormalizedCalendarConfig = CalendarSpecialViewConfig;
export type NormalizedPlanEditorConfig = PlanEditorSpecialViewConfig;
export type NormalizedSpecialView = SpecialViewConfig;
export type NormalizedModuleSchema = Omit<ModuleSchema, "fields"> & {
  fields: NormalizedField[];
};

const CALENDAR_VIEWS: CalendarViewMode[] = ["month", "week", "day"];
const DEFAULT_PLAN_CALIBRATION_UNITS: Array<"mm" | "cm" | "m" | "km" | "in" | "ft"> = ["mm", "cm", "m", "km", "in", "ft"];

function isRecord(value: unknown): value is AnyRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord<T extends AnyRecord>(value: T): T {
  return { ...value };
}

function toString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeViews(input: unknown): CalendarViewMode[] {
  const raw = Array.isArray(input) ? input : CALENDAR_VIEWS;
  const unique = Array.from(new Set(raw.map((view) => String(view)).filter((view): view is CalendarViewMode =>
    view === "month" || view === "week" || view === "day"
  )));
  return unique.length ? unique : CALENDAR_VIEWS;
}

function normalizeFormSections(input: unknown): FormSection[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(isRecord)
    .map((section, index) => ({
      id: toString(section.id, `section_${index + 1}`),
      label: toString(section.label || section.title, `Seccion ${index + 1}`),
      description: toString(section.description) || undefined,
      fields: Array.isArray(section.fields) ? section.fields.map((field) => String(field)).filter(Boolean) : [],
    }));
}

export function normalizeFieldConfig(field: unknown): NormalizedField {
  const raw = isRecord(field) ? cloneRecord(field) : {};
  const legacyAppearance = raw.appareance;
  const appearance = raw.appearance ?? legacyAppearance;
  const normalized: AnyRecord = {
    ...raw,
    name: toString(raw.name),
    label: toString(raw.label || raw.name),
    type: toString(raw.type, "text"),
  };

  if (appearance === "List" || appearance === "Always" || appearance === "Zoom") {
    normalized.appearance = appearance;
    // Temporary bridge for existing renderers that still consume `appareance`.
    normalized.appareance = appearance;
  }

  return normalized as NormalizedField;
}

export function normalizeTreeViewConfig(config: unknown): NormalizedTreeViewConfig {
  const raw = isRecord(config)
    ? isRecord(config.treeViewConfig)
      ? config.treeViewConfig
      : config
    : {};

  const sourceRaw = isRecord(raw.source) ? raw.source : {};
  const groupByLegacy = Array.isArray(raw.groupBy) ? raw.groupBy.find((item: unknown) => typeof item === "string") : undefined;
  const groupByField = toString(isRecord(raw.grouping) ? raw.grouping.groupByField : undefined) || toString(groupByLegacy);

  const columnsRaw = Array.isArray(raw.columns) ? raw.columns : [];
  const columns = columnsRaw
    .map((column: unknown) => {
      if (typeof column === "string") return { field: column, label: column };
      if (!isRecord(column)) return null;
      const field = toString(column.field || column.name);
      if (!field) return null;
      return {
        field,
        label: toString(column.label, field),
        type: column.type,
        width: toString(column.width) || undefined,
        options: Array.isArray(column.options) ? column.options.map(String) : undefined,
      };
    })
    .filter(Boolean) as NormalizedTreeViewConfig["columns"];

  return {
    source: {
      ...sourceRaw,
      table: toString(sourceRaw.table || raw.sourceTable),
      select: Array.isArray(sourceRaw.select) ? sourceRaw.select.map(String) : undefined,
      orderBy: isRecord(sourceRaw.orderBy)
        ? ({ field: toString(sourceRaw.orderBy.field), ascending: sourceRaw.orderBy.ascending !== false } as TreeViewConfig["source"]["orderBy"])
        : isRecord(raw.orderBy)
        ? ({ field: toString(raw.orderBy.field), ascending: raw.orderBy.ascending !== false } as TreeViewConfig["source"]["orderBy"])
        : undefined,
      filters: Array.isArray(sourceRaw.filters) ? sourceRaw.filters : Array.isArray(raw.filters) ? raw.filters : undefined,
    },
    grouping: {
      ...(isRecord(raw.grouping) ? raw.grouping : {}),
      groupByField,
    },
    columns,
    totals: isRecord(raw.totals)
      ? ({
          enabled: raw.totals.enabled !== false,
          sumField: toString(raw.totals.sumField),
          currency: toString(raw.totals.currency) || undefined,
          showGroupTotals: raw.totals.showGroupTotals,
          showGrandTotal: raw.totals.showGrandTotal,
        } as TreeViewConfig["totals"])
      : undefined,
    lookups: Array.isArray(raw.lookups) ? raw.lookups : undefined,
    actions: isRecord(raw.actions) ? raw.actions : undefined,
    ui: isRecord(raw.ui) ? raw.ui : undefined,
  };
}

export function normalizeCalendarConfig(config: unknown): NormalizedCalendarConfig {
  const raw = isRecord(config) ? config : {};
  const enabledViews = normalizeViews(raw.enabledViews);
  const defaultView = enabledViews.includes(raw.defaultView as CalendarViewMode)
    ? (raw.defaultView as CalendarViewMode)
    : enabledViews[0];

  return {
    sourceModuleSlug: toString(raw.sourceModuleSlug || raw.sourceTable),
    titleField: toString(raw.titleField),
    startField: toString(raw.startField),
    endField: toString(raw.endField),
    allDayField: toString(raw.allDayField),
    colorField: toString(raw.colorField),
    descriptionField: toString(raw.descriptionField),
    resourceField: toString(raw.resourceField),
    parentLinkField: toString(raw.parentLinkField),
    enabledViews,
    defaultView,
  };
}

export function normalizePlanEditorConfig(config: unknown): NormalizedPlanEditorConfig {
  const raw = isRecord(config) ? config : {};
  const options = isRecord(raw.options) ? raw.options : raw;
  const width = Number(options.width);
  const height = Number(options.height);
  const scaleRaw = isRecord(options.scale) ? options.scale : null;
  const gridRaw = isRecord(options.grid) ? options.grid : {};
  const backgroundRaw = isRecord(options.background) ? options.background : {};
  const exportRaw = isRecord(options.export) ? options.export : {};
  const clipboardRaw = isRecord(options.clipboard) ? options.clipboard : {};
  const pasteOffsetRaw = isRecord(clipboardRaw.pasteOffset) ? clipboardRaw.pasteOffset : {};
  const templatesRaw = isRecord(options.templates) ? options.templates : {};
  const blocksRaw = isRecord(options.blocks) ? options.blocks : {};
  const snapRaw = isRecord(options.snap) ? options.snap : {};
  const viewRaw = isRecord(options.view) ? options.view : {};
  const measurementRaw = isRecord(options.measurement) ? options.measurement : {};
  const symbolsRaw = isRecord(options.symbols) ? options.symbols : {};
  const scalePixels = Number(scaleRaw?.pixels);
  const scaleRealValue = Number(scaleRaw?.realValue);
  const gridSize = Number(gridRaw.size);
  const backgroundOpacity = Number(backgroundRaw.opacity);
  const scaleUnit =
    isPlanUnit(scaleRaw?.unit)
      ? scaleRaw.unit
      : isPlanUnit(options.unit)
        ? options.unit
        : "m";

  return {
    sourceField: toString(raw.sourceField),
    options: {
      width: Number.isFinite(width) && width > 0 ? width : 1200,
      height: Number.isFinite(height) && height > 0 ? height : 800,
      unit: isPlanUnit(options.unit) ? options.unit : "m",
      scale:
        Number.isFinite(scalePixels) && scalePixels > 0 && Number.isFinite(scaleRealValue) && scaleRealValue > 0
          ? { pixels: scalePixels, realValue: scaleRealValue, unit: scaleUnit, calibratedFrom: normalizeScaleCalibration(scaleRaw?.calibratedFrom) }
          : null,
      grid: {
        enabled: gridRaw.enabled !== false,
        size: Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 20,
        snap: gridRaw.snap !== false,
      },
      snap: {
        enabled: snapRaw.enabled !== false,
        toGrid: snapRaw.toGrid !== false,
        toObjects: snapRaw.toObjects !== false,
        threshold: Number.isFinite(Number(snapRaw.threshold)) && Number(snapRaw.threshold) > 0 ? Number(snapRaw.threshold) : 8,
      },
      view: {
        showRulers: viewRaw.showRulers !== false,
        showGuides: viewRaw.showGuides !== false,
      },
      background: {
        locked: backgroundRaw.locked !== false,
        opacity: Number.isFinite(backgroundOpacity) ? Math.min(1, Math.max(0, backgroundOpacity)) : 1,
        fit:
          backgroundRaw.fit === "cover" || backgroundRaw.fit === "stretch" || backgroundRaw.fit === "original" || backgroundRaw.fit === "contain"
            ? backgroundRaw.fit
            : "contain",
        uploader: normalizePlanBackgroundUploader(backgroundRaw.uploader),
      },
      export: {
        includeGrid: exportRaw.includeGrid === true,
        includeLayerLegend: exportRaw.includeLayerLegend !== false,
        pageOrientation: exportRaw.pageOrientation === "portrait" ? "portrait" : "landscape",
        metadataFields: normalizePlanMetadataFields(exportRaw.metadataFields),
      },
      clipboard: {
        pasteIntoActiveLayer: clipboardRaw.pasteIntoActiveLayer !== false,
        pasteOffset: {
          x: Number.isFinite(Number(pasteOffsetRaw.x)) ? Number(pasteOffsetRaw.x) : 20,
          y: Number.isFinite(Number(pasteOffsetRaw.y)) ? Number(pasteOffsetRaw.y) : 20,
        },
      },
      templatesSource: normalizePlanDynamicSource(options.templatesSource),
      templates: {
        applyMode: templatesRaw.applyMode === "insert" ? "insert" : "replace",
        preserveLinks: templatesRaw.preserveLinks === true,
        mergeLayersByName: templatesRaw.mergeLayersByName !== false,
      },
      blocksSource: normalizePlanDynamicSource(options.blocksSource),
      blocks: {
        insertIntoActiveLayer: blocksRaw.insertIntoActiveLayer !== false,
        preserveLinks: blocksRaw.preserveLinks === true,
      },
      exportTitle: toString(options.exportTitle) || undefined,
      exportSubtitleField: toString(options.exportSubtitleField) || undefined,
      calibration: normalizePlanCalibration(options.calibration),
      polygonValidation: normalizePolygonValidation(options.polygonValidation),
      measurement: {
        enabled: measurementRaw.enabled !== false,
        allowConvertToLine: measurementRaw.allowConvertToLine !== false,
      },
      symbols: {
        selectorMode: symbolsRaw.selectorMode === "modal" ? "modal" : "modal",
      },
      symbolsSource: normalizePlanDynamicSource(options.symbolsSource),
      defaultLayersSource: normalizePlanDynamicSource(options.defaultLayersSource),
      linkTargets: normalizePlanLinkTargets(options.linkTargets),
    },
  };
}

function isPlanUnit(value: unknown): value is "m" | "cm" | "mm" | "km" | "in" | "ft" | "px" {
  return value === "m" || value === "cm" || value === "mm" || value === "km" || value === "in" || value === "ft" || value === "px";
}

function normalizeScaleCalibration(input: unknown) {
  if (!isRecord(input)) return undefined;
  const pixelLength = Number(input.pixelLength);
  const realLength = Number(input.realLength);
  if (!Number.isFinite(pixelLength) || pixelLength <= 0 || !Number.isFinite(realLength) || realLength <= 0) return undefined;
  return {
    objectId: toString(input.objectId) || undefined,
    pixelLength,
    realLength,
    unit: isPlanUnit(input.unit) ? input.unit : "m",
    calibratedAt: toString(input.calibratedAt),
  };
}

function normalizePlanCalibration(input: unknown) {
  const raw = isRecord(input) ? input : {};
  const allowed = Array.isArray(raw.allowedUnits) ? raw.allowedUnits.filter(isPlanUnit) : DEFAULT_PLAN_CALIBRATION_UNITS;
  return {
    enabled: raw.enabled !== false,
    allowedUnits: allowed.length ? allowed : DEFAULT_PLAN_CALIBRATION_UNITS,
    defaultUnit: isPlanUnit(raw.defaultUnit) ? raw.defaultUnit : "m",
  };
}

function normalizePolygonValidation(input: unknown) {
  const raw = isRecord(input) ? input : {};
  const epsilon = Number(raw.epsilon);
  return {
    enabled: raw.enabled !== false,
    showWarnings: raw.showWarnings !== false,
    epsilon: Number.isFinite(epsilon) && epsilon > 0 ? epsilon : 0.5,
  };
}

function normalizePlanDynamicSource(input: unknown) {
  if (!isRecord(input)) return undefined;
  return {
    enabled: input.enabled === true,
    moduleSlug: toString(input.moduleSlug),
    table: toString(input.table),
    valueField: toString(input.valueField, "id") || "id",
    labelField: toString(input.labelField || input.displayField),
    displayField: toString(input.displayField || input.labelField),
    iconField: toString(input.iconField) || undefined,
    colorField: toString(input.colorField) || undefined,
    categoryField: toString(input.categoryField) || undefined,
    typeField: toString(input.typeField) || undefined,
    orderField: toString(input.orderField) || undefined,
    lockedField: toString(input.lockedField) || undefined,
    visibleField: toString(input.visibleField) || undefined,
    descriptionField: toString(input.descriptionField) || undefined,
    planJsonField: toString(input.planJsonField) || undefined,
    blockJsonField: toString(input.blockJsonField) || undefined,
    filters: Array.isArray(input.filters) ? input.filters : [],
    sort: Array.isArray(input.sort) ? input.sort : [],
  };
}

function normalizePlanMetadataFields(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .filter(isRecord)
    .map((item) => ({
      label: toString(item.label),
      field: toString(item.field),
    }))
    .filter((item) => item.label && item.field);
}

function normalizePlanLinkTargets(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .filter(isRecord)
    .map((target, index) => ({
      label: toString(target.label, `Nuevo destino ${index + 1}`) || `Nuevo destino ${index + 1}`,
      moduleSlug: toString(target.moduleSlug),
      table: toString(target.table),
      valueField: toString(target.valueField, "id") || "id",
      displayField: toString(target.displayField, "nombre") || "nombre",
      filters: Array.isArray(target.filters) ? target.filters : [],
      sort: Array.isArray(target.sort) ? target.sort : [],
    }));
}

function normalizePlanBackgroundUploader(input: unknown) {
  if (!isRecord(input)) {
    return { enabled: true, endpoint: "/api/upload", mode: "global" as const };
  }
  return {
    enabled: input.enabled !== false,
    endpoint: toString(input.endpoint, "/api/upload") || "/api/upload",
    mode: "global" as const,
    folder: toString(input.folder) || undefined,
  };
}

export function normalizeSpecialViews(config: unknown): NormalizedSpecialView[] {
  const ui = isRecord(config) && isRecord(config.ui) ? config.ui : isRecord(config) ? config : {};
  const rawSpecialViews = Array.isArray(ui.specialViews) ? ui.specialViews : [];
  const specialViews = rawSpecialViews
    .filter(isRecord)
    .map((view, index) => {
      const type = view.type === "calendar" ? "calendar" : view.type === "planEditor" ? "planEditor" : "pdfPreview";
      const planConfig = normalizePlanEditorConfig(view.config ?? view);
      return {
        id: toString(view.id, `special_view_${index + 1}`),
        label: toString(view.label || view.title, `Vista especial ${index + 1}`),
        type,
        ...(type === "planEditor" ? { sourceField: planConfig.sourceField, options: planConfig.options } : {}),
        config:
          type === "calendar"
            ? normalizeCalendarConfig(view.config)
            : type === "planEditor"
              ? planConfig
              : { pdfTemplateId: toString(view.config?.pdfTemplateId || view.pdfTemplateId) },
        visibility: isRecord(view.visibility) ? view.visibility : undefined,
      } as NormalizedSpecialView;
    });

  const previewTabs = Array.isArray(ui.previewTabs) ? ui.previewTabs : [];
  const legacyPdfViews = previewTabs.filter(isRecord).map((tab, index) => ({
    id: toString(tab.id, `preview_${index + 1}`),
    label: toString(tab.label || tab.title, `Vista especial ${index + 1}`),
    type: "pdfPreview" as const,
    config: { pdfTemplateId: toString(tab.pdfTemplateId) },
  }));

  return [...specialViews, ...legacyPdfViews];
}

export function normalizeModuleSchema(schema: unknown): NormalizedModuleSchema {
  const raw = isRecord(schema) ? schema : {};
  const dbRaw = isRecord(raw.db) ? raw.db : {};
  const uiRaw = isRecord(raw.ui) ? raw.ui : {};
  const rootTable = toString(raw.table);
  const fields = Array.isArray(raw.fields) ? raw.fields.map(normalizeFieldConfig) : [];
  const tabs = Array.isArray(uiRaw.tabs) ? [...uiRaw.tabs] : [];
  const legacyFormSections = normalizeFormSections(uiRaw.formSections);
  const hasFormTab = tabs.some((tab) => isRecord(tab) && (tab.type || tab.kind || "form") === "form");

  if (legacyFormSections.length && !hasFormTab) {
    tabs.unshift({
      id: "__form__",
      label: "Formulario",
      type: "form",
      config: { formSections: legacyFormSections },
    } satisfies UiTab);
  }

  if (isRecord(uiRaw.treeView) && !tabs.some((tab) => isRecord(tab) && (tab.type || tab.kind) === "treeview")) {
    tabs.push({
      id: "__treeview__",
      label: toString(uiRaw.treeView.ui?.title, "TreeView"),
      type: "treeview",
      config: normalizeTreeViewConfig(uiRaw.treeView),
    } satisfies UiTab);
  }

  if (isRecord(uiRaw.calendar) && !tabs.some((tab) => isRecord(tab) && (tab.type || tab.kind) === "calendar")) {
    tabs.push({
      id: "__calendar__",
      label: toString(uiRaw.calendar.ui?.title, "Calendario"),
      type: "calendar",
      config: normalizeCalendarConfig(uiRaw.calendar),
    } satisfies UiTab);
  }

  const normalizedTabs = tabs
    .filter(isRecord)
    .map((tab, index) => {
      const type = (tab.type || tab.kind || "form") as UiTab["type"];
      const config =
        type === "treeview"
          ? normalizeTreeViewConfig(tab.config ?? tab)
          : type === "calendar"
            ? normalizeCalendarConfig(tab.config ?? tab)
            : type === "planEditor"
              ? normalizePlanEditorConfig(tab.config ?? tab)
              : tab.config ?? tab;
      return {
        id: toString(tab.id, `${type}_${index + 1}`),
        label: toString(tab.label || tab.title, type === "form" ? "Formulario" : type),
        type,
        config,
        ...(type === "planEditor" ? { sourceField: (config as PlanEditorSpecialViewConfig).sourceField, options: (config as PlanEditorSpecialViewConfig).options } : {}),
        visibility: isRecord(tab.visibility) ? tab.visibility : undefined,
      } as UiTab;
    })
    .filter((tab) => tab.type === "form" || tab.type === "treeview" || tab.type === "calendar" || tab.type === "planEditor");

  const normalizedUi: AnyRecord = {
    ...uiRaw,
    tabs: normalizedTabs,
    specialViews: normalizeSpecialViews(uiRaw),
  };

  delete normalizedUi.previewTabs;
  delete normalizedUi.treeView;
  delete normalizedUi.calendar;
  if (legacyFormSections.length) delete normalizedUi.formSections;

  return {
    ...raw,
    db: {
      ...dbRaw,
      table: toString(dbRaw.table || rootTable),
      primaryKey: toString(dbRaw.primaryKey, "id"),
    },
    fields,
    ui: normalizedUi,
  } as NormalizedModuleSchema;
}

export function getLegacySchemaWarnings(schema: unknown): LegacySchemaWarning[] {
  const warnings: LegacySchemaWarning[] = [];
  if (!isRecord(schema)) {
    warnings.push({ code: "invalid.schema", path: "$", message: "El schema no es un objeto." });
    return warnings;
  }

  if (typeof schema.table === "string" && schema.table.trim()) {
    warnings.push({ code: "legacy.rootTable", path: "table", message: "Usa db.table en lugar de table en raiz." });
  }

  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  fields.forEach((field, index) => {
    if (!isRecord(field)) {
      warnings.push({ code: "invalid.field", path: `fields[${index}]`, message: "El campo no es un objeto." });
      return;
    }
    if (field.appareance !== undefined) {
      warnings.push({ code: "legacy.appareance", path: `fields[${index}].appareance`, message: "Usa appearance; appareance se mantiene solo como compatibilidad temporal." });
    }
  });

  const ui = isRecord(schema.ui) ? schema.ui : {};
  if (Array.isArray(ui.formSections)) warnings.push({ code: "legacy.formSections", path: "ui.formSections", message: "Usa ui.tabs con una pestana de tipo form." });
  if (Array.isArray(ui.previewTabs)) warnings.push({ code: "legacy.previewTabs", path: "ui.previewTabs", message: "Usa ui.specialViews con type pdfPreview." });
  if (isRecord(ui.treeView)) warnings.push({ code: "legacy.treeView", path: "ui.treeView", message: "Usa una tab de tipo treeview." });
  if (isRecord(ui.calendar) && typeof ui.calendar.sourceTable === "string") warnings.push({ code: "legacy.calendar.sourceTable", path: "ui.calendar.sourceTable", message: "Usa sourceModuleSlug." });

  const tabs = Array.isArray(ui.tabs) ? ui.tabs : [];
  tabs.forEach((tab, index) => {
    if (!isRecord(tab)) return;
    const cfg = isRecord(tab.config) ? tab.config : tab;
    if ((tab.type || tab.kind) === "treeview") {
      if (typeof cfg.sourceTable === "string") warnings.push({ code: "legacy.treeView.sourceTable", path: `ui.tabs[${index}].config.sourceTable`, message: "Usa source.table." });
      if (Array.isArray(cfg.groupBy)) warnings.push({ code: "legacy.treeView.groupBy", path: `ui.tabs[${index}].config.groupBy`, message: "Usa grouping.groupByField." });
      if (Array.isArray(cfg.columns) && cfg.columns.some((column) => typeof column === "string")) warnings.push({ code: "legacy.treeView.columns", path: `ui.tabs[${index}].config.columns`, message: "Usa columns como objetos { field, label }." });
    }
    if ((tab.type || tab.kind) === "calendar" && typeof cfg.sourceTable === "string") {
      warnings.push({ code: "legacy.calendar.sourceTable", path: `ui.tabs[${index}].config.sourceTable`, message: "Usa sourceModuleSlug." });
    }
  });

  return warnings;
}
