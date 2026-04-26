import type {
  PlanBackgroundConfig,
  PlanCanvasConfig,
  PlanDocument,
  PlanEditorOptions,
  PlanLayer,
  PlanLineObject,
  PlanLinkedRecord,
  PlanObject,
  PlanScaleConfig,
  PlanSymbolObject,
  PlanUnit,
} from "./planTypes";

const DEFAULT_CANVAS: PlanCanvasConfig = {
  width: 1200,
  height: 800,
  unit: "m",
  scale: null,
};

const DEFAULT_BACKGROUND: PlanBackgroundConfig = {
  url: "",
  locked: true,
  opacity: 1,
};

export const DEFAULT_LAYER_ID = "layer_default";

export const DEFAULT_PLAN_LAYER: PlanLayer = {
  id: DEFAULT_LAYER_ID,
  name: "Capa 1",
  visible: true,
  locked: false,
  order: 1,
};

export const DEFAULT_PLAN_DOCUMENT: PlanDocument = {
  version: 3,
  canvas: DEFAULT_CANVAS,
  background: DEFAULT_BACKGROUND,
  layers: [DEFAULT_PLAN_LAYER],
  activeLayerId: DEFAULT_LAYER_ID,
  objects: [],
};

export function createDefaultPlanData(options?: PlanEditorOptions, initialLayers?: PlanLayer[]): PlanDocument {
  const layers = normalizeLayers(initialLayers);
  return {
    version: 3,
    canvas: {
      width: normalizePositiveNumber(options?.width, DEFAULT_CANVAS.width),
      height: normalizePositiveNumber(options?.height, DEFAULT_CANVAS.height),
      unit: options?.unit || DEFAULT_CANVAS.unit,
      scale: normalizeScale(options?.scale, null),
    },
    background: DEFAULT_BACKGROUND,
    layers,
    activeLayerId: layers[0]?.id || DEFAULT_LAYER_ID,
    objects: [],
  };
}

export function createDefaultPlanDocument(options?: PlanEditorOptions): PlanDocument {
  return createDefaultPlanData(options);
}

export function normalizePlanData(input: unknown, options?: PlanEditorOptions): PlanDocument {
  const fallback = createDefaultPlanData(options);
  const raw = parseMaybeJson(input);
  if (!isRecord(raw)) return fallback;

  const rawCanvas = isRecord(raw.canvas) ? raw.canvas : {};
  const layers = normalizeLayers(raw.layers);
  const activeLayerId = normalizeActiveLayerId(raw.activeLayerId, layers);
  const objects = Array.isArray(raw.objects)
    ? raw.objects.map((object) => normalizePlanObject(object, activeLayerId)).filter(Boolean)
    : [];

  return {
    version: 3,
    canvas: {
      width: normalizePositiveNumber(rawCanvas.width, fallback.canvas.width),
      height: normalizePositiveNumber(rawCanvas.height, fallback.canvas.height),
      unit: rawCanvas.unit === "cm" || rawCanvas.unit === "mm" || rawCanvas.unit === "px" ? rawCanvas.unit : fallback.canvas.unit,
      scale: normalizeScale(rawCanvas.scale, fallback.canvas.scale),
    },
    background: normalizeBackground(raw.background),
    layers,
    activeLayerId,
    objects: objects as PlanObject[],
  };
}

export function normalizePlanDocument(input: unknown, options?: PlanEditorOptions): PlanDocument {
  return normalizePlanData(input, options);
}

export function createPlanObjectId() {
  return `obj_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function updatePlanObject(document: PlanDocument, objectId: string, patch: Partial<PlanObject>): PlanDocument {
  return {
    ...document,
    objects: document.objects.map((object) => (object.id === objectId ? ({ ...object, ...patch } as PlanObject) : object)),
  };
}

export function removePlanObject(document: PlanDocument, objectId: string): PlanDocument {
  return {
    ...document,
    objects: document.objects.filter((object) => object.id !== objectId),
  };
}

export function getPlanLayer(document: PlanDocument, layerId?: string) {
  return document.layers.find((layer) => layer.id === layerId) || document.layers[0] || DEFAULT_PLAN_LAYER;
}

export function isPlanObjectEditable(document: PlanDocument, object: PlanObject | null | undefined, readOnly?: boolean) {
  if (readOnly || !object?.id) return false;
  const layer = getPlanLayer(document, object.layerId);
  return !object.locked && !layer.locked && layer.visible !== false;
}

export function getVisiblePlanObjects(document: PlanDocument) {
  const layers = new Map(document.layers.map((layer) => [layer.id, layer]));
  return document.objects.filter((object) => {
    const layer = object.layerId ? layers.get(object.layerId) : document.layers[0];
    return layer?.visible !== false;
  });
}

export function calculateLineMeasure(line: PlanLineObject, scale: PlanScaleConfig | null) {
  if (!line.showMeasure) return "";
  if (line.manualMeasureLabel?.trim()) return line.manualMeasureLabel.trim();
  if (!scale || scale.pixels <= 0 || scale.realValue <= 0) return "sin escala";

  const pixels = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
  const realValue = (pixels / scale.pixels) * scale.realValue;
  const decimals = realValue >= 10 ? 1 : 2;
  return `${trimNumber(realValue, decimals)} ${scale.unit}`;
}

function normalizePlanObject(input: unknown, fallbackLayerId: string): PlanObject | null {
  if (!isRecord(input) || typeof input.id !== "string") return null;
  const base = {
    id: input.id,
    layerId: typeof input.layerId === "string" && input.layerId.trim() ? input.layerId.trim() : fallbackLayerId,
    locked: input.locked === true,
    linkedTo: normalizeLinkedRecord(input.linkedTo),
  };

  if (input.type === "line") {
    return {
      ...base,
      type: "line",
      x1: normalizeNumber(input.x1, 0),
      y1: normalizeNumber(input.y1, 0),
      x2: normalizeNumber(input.x2, 0),
      y2: normalizeNumber(input.y2, 0),
      stroke: normalizeColor(input.stroke, "#111827"),
      strokeWidth: normalizePositiveNumber(input.strokeWidth, 3),
      label: typeof input.label === "string" ? input.label : "",
      showMeasure: typeof input.showMeasure === "boolean" ? input.showMeasure : false,
      manualMeasureLabel: typeof input.manualMeasureLabel === "string" ? input.manualMeasureLabel : undefined,
    };
  }

  if (input.type === "rect") {
    return {
      ...base,
      type: "rect",
      x: normalizeNumber(input.x, 0),
      y: normalizeNumber(input.y, 0),
      width: normalizePositiveNumber(input.width, 1),
      height: normalizePositiveNumber(input.height, 1),
      stroke: normalizeColor(input.stroke, "#111827"),
      strokeWidth: normalizePositiveNumber(input.strokeWidth, 2),
      fill: typeof input.fill === "string" ? input.fill : "transparent",
      label: typeof input.label === "string" ? input.label : "",
    };
  }

  if (input.type === "text") {
    return {
      ...base,
      type: "text",
      x: normalizeNumber(input.x, 0),
      y: normalizeNumber(input.y, 0),
      text: typeof input.text === "string" ? input.text : "Texto",
      fontSize: normalizePositiveNumber(input.fontSize, 16),
      fill: normalizeColor(input.fill, "#111827"),
    };
  }

  if (input.type === "symbol") {
    return {
      ...base,
      type: "symbol",
      x: normalizeNumber(input.x, 0),
      y: normalizeNumber(input.y, 0),
      symbolId: typeof input.symbolId === "string" ? input.symbolId : "",
      symbolLabel: typeof input.symbolLabel === "string" ? input.symbolLabel : "",
      symbolIcon: typeof input.symbolIcon === "string" ? input.symbolIcon : undefined,
      symbolColor: normalizeColor(input.symbolColor, "#111827"),
      size: normalizePositiveNumber(input.size, 32),
      source: normalizeObjectSource(input.source),
    } satisfies PlanSymbolObject;
  }

  return null;
}

export function normalizeLayers(input: unknown): PlanLayer[] {
  const rawLayers = Array.isArray(input) ? input : [];
  const layers = rawLayers
    .map((layer, index) => normalizeLayer(layer, index + 1))
    .filter((layer): layer is PlanLayer => !!layer);

  return layers.length
    ? layers.sort((a, b) => a.order - b.order)
    : [DEFAULT_PLAN_LAYER];
}

function normalizeLayer(input: unknown, order: number): PlanLayer | null {
  if (!isRecord(input)) return null;
  const id = typeof input.id === "string" && input.id.trim() ? input.id.trim() : "";
  if (!id) return null;
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : `Capa ${order}`;
  return {
    id,
    name,
    visible: input.visible !== false,
    locked: input.locked === true,
    order: normalizePositiveNumber(input.order, order),
    color: typeof input.color === "string" && input.color.trim() ? input.color.trim() : undefined,
    source: normalizeObjectSource(input.source),
  };
}

function normalizeActiveLayerId(input: unknown, layers: PlanLayer[]) {
  const requested = typeof input === "string" ? input.trim() : "";
  if (requested && layers.some((layer) => layer.id === requested)) return requested;
  return layers[0]?.id || DEFAULT_LAYER_ID;
}

function normalizeScale(input: unknown, fallback: PlanScaleConfig | null): PlanScaleConfig | null {
  if (!isRecord(input)) return fallback;
  const pixels = normalizePositiveNumber(input.pixels, 0);
  const realValue = normalizePositiveNumber(input.realValue, 0);
  if (!pixels || !realValue) return fallback;

  return {
    pixels,
    realValue,
    unit: normalizeUnit(input.unit, fallback?.unit || "m"),
  };
}

function normalizeBackground(input: unknown): PlanBackgroundConfig {
  if (!isRecord(input)) return DEFAULT_BACKGROUND;
  return {
    url: typeof input.url === "string" ? input.url : "",
    locked: input.locked !== false,
    opacity: clamp(normalizeNumber(input.opacity, 1), 0, 1),
  };
}

function normalizeLinkedRecord(input: unknown): PlanLinkedRecord | undefined {
  if (!isRecord(input)) return undefined;
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const moduleSlug = typeof input.moduleSlug === "string" ? input.moduleSlug.trim() : "";
  const table = typeof input.table === "string" ? input.table.trim() : "";
  const recordId = typeof input.recordId === "string" ? input.recordId.trim() : "";
  const displayValue = typeof input.displayValue === "string" ? input.displayValue.trim() : "";
  if (!table && !recordId && !label && !moduleSlug && !displayValue) return undefined;
  return { label: label || undefined, moduleSlug: moduleSlug || undefined, table, recordId, displayValue: displayValue || undefined };
}

function normalizeObjectSource(input: unknown) {
  if (!isRecord(input)) return undefined;
  const moduleSlug = typeof input.moduleSlug === "string" ? input.moduleSlug.trim() : "";
  const table = typeof input.table === "string" ? input.table.trim() : "";
  const recordId = typeof input.recordId === "string" ? input.recordId.trim() : "";
  if (!moduleSlug && !table && !recordId) return undefined;
  return { moduleSlug: moduleSlug || undefined, table: table || undefined, recordId: recordId || undefined };
}

function normalizeUnit(input: unknown, fallback: PlanUnit): PlanUnit {
  return input === "m" || input === "cm" || input === "mm" || input === "px" ? input : fallback;
}

function parseMaybeJson(input: unknown) {
  if (typeof input !== "string") return input;
  if (!input.trim()) return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function trimNumber(value: number, decimals: number) {
  return Number(value.toFixed(decimals)).toLocaleString("es-ES", {
    maximumFractionDigits: decimals,
  });
}
