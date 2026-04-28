import type {
  PlanBackgroundConfig,
  PlanCanvasConfig,
  PlanDocument,
  PlanEditorOptions,
  PlanGridConfig,
  PlanGroup,
  PlanLayer,
  PlanLineObject,
  PlanLinkedRecord,
  PlanObject,
  PlanPolygonPoint,
  PlanRectObject,
  PlanScaleConfig,
  PlanSnapConfig,
  PlanSymbolObject,
  PlanUnit,
  PlanViewConfig,
} from "./planTypes";

const DEFAULT_CANVAS: PlanCanvasConfig = {
  width: 1200,
  height: 800,
  unit: "m",
  scale: {
    pixels: 100,
    realValue: 1,
    unit: "m",
  },
  grid: {
    enabled: true,
    size: 20,
    snap: true,
  },
  snap: {
    enabled: true,
    toGrid: true,
    toObjects: true,
    threshold: 8,
  },
  view: {
    showRulers: true,
    showGuides: true,
  },
};

const DEFAULT_BACKGROUND: PlanBackgroundConfig = {
  url: "",
  locked: true,
  opacity: 1,
  fit: "contain",
  source: {
    type: "url",
    fileName: "",
    uploadedAt: "",
  },
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
  version: 8,
  canvas: DEFAULT_CANVAS,
  background: DEFAULT_BACKGROUND,
  layers: [DEFAULT_PLAN_LAYER],
  activeLayerId: DEFAULT_LAYER_ID,
  objects: [],
  groups: [],
  metadata: {},
};

export function createDefaultPlanData(options?: PlanEditorOptions, initialLayers?: PlanLayer[]): PlanDocument {
  const layers = normalizeLayers(initialLayers);
  const canvasUnit = normalizeUnit(options?.unit, DEFAULT_CANVAS.unit);
  return {
    version: 8,
    canvas: {
      width: normalizePositiveNumber(options?.width, DEFAULT_CANVAS.width),
      height: normalizePositiveNumber(options?.height, DEFAULT_CANVAS.height),
      unit: canvasUnit,
      scale: normalizeScale(options?.scale, DEFAULT_CANVAS.scale),
      grid: normalizeGrid(options?.grid, DEFAULT_CANVAS.grid),
      snap: normalizeSnap(options?.snap, DEFAULT_CANVAS.snap),
      view: normalizeView(options?.view, DEFAULT_CANVAS.view),
    },
    background: normalizeBackground(options?.background),
    layers,
    activeLayerId: layers[0]?.id || DEFAULT_LAYER_ID,
    objects: [],
    groups: [],
    metadata: {},
  };
}

export function createDefaultPlanDocument(options?: PlanEditorOptions): PlanDocument {
  return createDefaultPlanData(options);
}

export function shouldInitializeDefaultLayers(input: unknown) {
  const raw = parseMaybeJson(input);
  if (!isRecord(raw)) return true;
  return !Array.isArray(raw.layers) || raw.layers.length === 0;
}

export function mergeDefaultLayersIfNeeded(plan: PlanDocument, externalLayers: PlanLayer[]) {
  if (!externalLayers.length || plan.layers.length > 1 || plan.layers[0]?.id !== DEFAULT_LAYER_ID || plan.objects.length > 0) {
    return plan;
  }

  const layers = normalizeLayers(externalLayers);
  return {
    ...plan,
    layers,
    activeLayerId: layers[0]?.id || plan.activeLayerId,
    objects: plan.objects.map((object) => ({ ...object, layerId: layers[0]?.id || object.layerId })),
  };
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
    version: 8,
    canvas: {
      width: normalizePositiveNumber(rawCanvas.width, fallback.canvas.width),
      height: normalizePositiveNumber(rawCanvas.height, fallback.canvas.height),
      unit: normalizeUnit(rawCanvas.unit, fallback.canvas.unit),
      scale: normalizeScale(rawCanvas.scale, fallback.canvas.scale),
      grid: normalizeGrid(rawCanvas.grid, fallback.canvas.grid),
      snap: normalizeSnap(rawCanvas.snap ?? options?.snap, fallback.canvas.snap),
      view: normalizeView(rawCanvas.view ?? options?.view, fallback.canvas.view),
    },
    background: normalizeBackground(raw.background, fallback.background),
    layers,
    activeLayerId,
    objects: objects as PlanObject[],
    groups: normalizeGroups(raw.groups, (objects as PlanObject[]).map((object) => object.id)),
    metadata: normalizeMetadata(raw.metadata),
  };
}

export function normalizePlanDocument(input: unknown, options?: PlanEditorOptions): PlanDocument {
  return normalizePlanData(input, options);
}

export function createPlanObjectId() {
  return `obj_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function createPlanGroupId() {
  return `group_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function updatePlanObject(document: PlanDocument, objectId: string, patch: Partial<PlanObject>): PlanDocument {
  return {
    ...document,
    objects: document.objects.map((object) => (object.id === objectId ? ({ ...object, ...patch } as PlanObject) : object)),
  };
}

export function removePlanObject(document: PlanDocument, objectId: string): PlanDocument {
  return cleanPlanGroups({
    ...document,
    objects: document.objects.filter((object) => object.id !== objectId),
  });
}

export function getPlanLayer(document: PlanDocument, layerId?: string) {
  return document.layers.find((layer) => layer.id === layerId) || document.layers[0] || DEFAULT_PLAN_LAYER;
}

export function isPlanObjectEditable(document: PlanDocument, object: PlanObject | null | undefined, readOnly?: boolean) {
  if (readOnly || !object?.id) return false;
  const layer = getPlanLayer(document, object.layerId);
  return !object.locked && !layer.locked && layer.visible !== false && !isObjectInLockedGroup(document.groups, object.id);
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
  if (!hasValidScale(scale)) return "Sin escala";

  const pixels = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
  const realValue = (pixels / scale.pixels) * scale.realValue;
  const decimals = realValue >= 10 ? 1 : 2;
  return `${trimNumber(realValue, decimals)} ${scale.unit}`;
}

export function snapValue(value: number, gridSize: number) {
  if (!Number.isFinite(value) || !Number.isFinite(gridSize) || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(point: PlanPolygonPoint, gridSize: number): PlanPolygonPoint {
  return {
    x: snapValue(point.x, gridSize),
    y: snapValue(point.y, gridSize),
  };
}

export function shouldSnap(plan: PlanDocument, mode: "create" | "move" | "edit" = "create") {
  void mode;
  return plan.canvas.snap.enabled && plan.canvas.snap.toGrid && plan.canvas.grid.enabled && plan.canvas.grid.snap && plan.canvas.grid.size > 0;
}

export function hasValidScale(scale: PlanScaleConfig | null | undefined): scale is PlanScaleConfig {
  return !!scale && scale.pixels > 0 && scale.realValue > 0;
}

export const isValidScale = hasValidScale;

export function pixelsToReal(px: number, scale: PlanScaleConfig | null | undefined) {
  if (!hasValidScale(scale) || !Number.isFinite(px)) return null;
  return (px / scale.pixels) * scale.realValue;
}

export function realToPixels(value: number, scale: PlanScaleConfig | null | undefined) {
  if (!hasValidScale(scale) || !Number.isFinite(value) || value <= 0) return null;
  return (value / scale.realValue) * scale.pixels;
}

export function getRectRealSize(rect: Pick<PlanRectObject, "width" | "height">, scale: PlanScaleConfig | null | undefined) {
  const width = pixelsToReal(Math.abs(rect.width), scale);
  const height = pixelsToReal(Math.abs(rect.height), scale);
  if (width === null || height === null || !scale) return null;
  return { width, height, area: width * height, unit: scale.unit };
}

export function updateRectFromRealSize<T extends PlanRectObject>(rect: T, realWidth: number, realHeight: number, scale: PlanScaleConfig | null | undefined): T {
  const width = realToPixels(realWidth, scale);
  const height = realToPixels(realHeight, scale);
  if (width === null || height === null) return rect;
  return { ...rect, width, height };
}

export function formatRealLength(value: number | null | undefined, unit: PlanUnit | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Sin escala";
  const decimals = value >= 100 ? 1 : value >= 10 ? 2 : 3;
  return `${trimNumber(value, decimals)} ${unit || "m"}`;
}

export function parsePlanDecimal(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateRectArea(rect: Pick<PlanRectObject, "width" | "height">, scale: PlanScaleConfig | null | undefined) {
  if (!hasValidScale(scale)) return null;
  const areaPx = Math.abs(rect.width * rect.height);
  return areaPx * Math.pow(scale.realValue / scale.pixels, 2);
}

export function calculatePolygonArea(points: PlanPolygonPoint[], scale: PlanScaleConfig | null | undefined) {
  if (!hasValidScale(scale) || points.length < 3) return null;
  const areaPx = getPolygonAreaPx(points);
  return areaPx * Math.pow(scale.realValue / scale.pixels, 2);
}

export function formatArea(value: number | null | undefined, unit: PlanUnit | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Sin escala";
  if (value <= 0) return "0";
  const decimals = value >= 100 ? 1 : value >= 10 ? 2 : 3;
  return `${trimNumber(value, decimals)} ${unit || "m"}²`;
}

export function calculateObjectAreaLabel(object: PlanObject, scale: PlanScaleConfig | null | undefined) {
  return getObjectAreaLabel(object, scale, true);
}

export function getObjectAreaLabel(object: PlanObject, scale: PlanScaleConfig | null | undefined, includeUnscaled = false) {
  if (object.type !== "rect" && object.type !== "polygon") return "";
  if (!object.showArea) return "";
  if (object.manualAreaLabel?.trim()) return object.manualAreaLabel.trim();
  if (!hasValidScale(scale)) return includeUnscaled ? "Sin escala" : "";
  if (object.type === "polygon" && !validatePolygon(object.points).valid) return "";
  const area = object.type === "rect" ? calculateRectArea(object, scale) : calculatePolygonArea(object.points, scale);
  return formatArea(area, scale?.unit);
}

export type PolygonValidationResult = {
  valid: boolean;
  warnings: string[];
  errors: string[];
};

export function getPolygonAreaPx(points: PlanPolygonPoint[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!isFinitePoint(current) || !isFinitePoint(next)) return 0;
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

export function hasDuplicateOrNearDuplicatePoints(points: PlanPolygonPoint[], epsilon = 0.5) {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) <= epsilon) return true;
    }
  }
  return false;
}

export function doSegmentsIntersect(a1: PlanPolygonPoint, a2: PlanPolygonPoint, b1: PlanPolygonPoint, b2: PlanPolygonPoint) {
  const d1 = direction(a1, a2, b1);
  const d2 = direction(a1, a2, b2);
  const d3 = direction(b1, b2, a1);
  const d4 = direction(b1, b2, a2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return d1 === 0 && onSegment(a1, a2, b1) || d2 === 0 && onSegment(a1, a2, b2) || d3 === 0 && onSegment(b1, b2, a1) || d4 === 0 && onSegment(b1, b2, a2);
}

export function polygonHasSelfIntersections(points: PlanPolygonPoint[]) {
  if (points.length < 4) return false;
  for (let i = 0; i < points.length; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === points.length - 1)) continue;
      if (doSegmentsIntersect(a1, a2, points[j], points[(j + 1) % points.length])) return true;
    }
  }
  return false;
}

export function validatePolygon(points: PlanPolygonPoint[], epsilon = 0.5): PolygonValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (points.length < 3) errors.push("La zona tiene menos de 3 puntos.");
  if (points.some((point) => !isFinitePoint(point))) errors.push("La zona tiene coordenadas invalidas.");
  if (hasDuplicateOrNearDuplicatePoints(points, epsilon)) errors.push("La zona tiene puntos duplicados.");
  if (points.length >= 3 && getPolygonAreaPx(points) <= epsilon) errors.push("La superficie no se puede calcular correctamente.");
  if (polygonHasSelfIntersections(points)) errors.push("La zona tiene segmentos cruzados.");
  return { valid: errors.length === 0, warnings, errors };
}

export function calculateDistancePx(a: PlanPolygonPoint, b: PlanPolygonPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function projectPointOnSegment(point: PlanPolygonPoint, a: PlanPolygonPoint, b: PlanPolygonPoint): PlanPolygonPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0) return a;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function distancePointToSegment(point: PlanPolygonPoint, a: PlanPolygonPoint, b: PlanPolygonPoint) {
  const projected = projectPointOnSegment(point, a, b);
  return calculateDistancePx(point, projected);
}

export function getClosestSegment(points: PlanPolygonPoint[], point: PlanPolygonPoint, threshold = 10) {
  if (points.length < 2) return null;
  let best: { index: number; distance: number; point: PlanPolygonPoint } | null = null;
  for (let index = 0; index < points.length; index++) {
    const projected = projectPointOnSegment(point, points[index], points[(index + 1) % points.length]);
    const distance = calculateDistancePx(point, projected);
    if (distance <= threshold && (!best || distance < best.distance)) best = { index, distance, point: projected };
  }
  return best;
}

export function insertPointInPolygonSegment(points: PlanPolygonPoint[], segmentIndex: number, point: PlanPolygonPoint) {
  const index = Math.max(0, Math.min(segmentIndex, points.length - 1));
  return [...points.slice(0, index + 1), point, ...points.slice(index + 1)];
}

export function getPolygonBoundingBox(points: PlanPolygonPoint[]) {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

export function getPolygonCentroid(points: PlanPolygonPoint[]) {
  const area = signedPolygonArea(points);
  if (points.length < 3 || Math.abs(area) < 0.000001) {
    const box = getPolygonBoundingBox(points);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    cx += (current.x + next.x) * cross;
    cy += (current.y + next.y) * cross;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function calibrateScaleFromLine(line: PlanLineObject, realLength: number, unit: PlanUnit): PlanScaleConfig {
  const pixelLength = calculateDistancePx({ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 });
  if (pixelLength <= 0) throw new Error("La linea de calibracion no tiene longitud.");
  if (!Number.isFinite(realLength) || realLength <= 0) throw new Error("La medida real debe ser mayor que 0.");
  return {
    pixels: pixelLength,
    realValue: realLength,
    unit,
    calibratedFrom: {
      objectId: line.id,
      pixelLength,
      realLength,
      unit,
      calibratedAt: new Date().toISOString(),
    },
  };
}

export type PlanBounds = { x: number; y: number; width: number; height: number };
export type PlanSnapPoint = { x: number; y: number; objectId?: string; kind?: string };
export type SnapGuide = { orientation: "horizontal" | "vertical"; position: number; from: number; to: number };

export function canEditObject(object: PlanObject, layer: PlanLayer | undefined, readOnly?: boolean) {
  return !readOnly && !object.locked && layer?.locked !== true && layer?.visible !== false;
}

export function canMoveObject(object: PlanObject, layer: PlanLayer | undefined, readOnly?: boolean) {
  return canEditObject(object, layer, readOnly);
}

export function moveObjectByDelta(object: PlanObject, dx: number, dy: number): PlanObject {
  if (object.type === "line") return { ...object, x1: object.x1 + dx, y1: object.y1 + dy, x2: object.x2 + dx, y2: object.y2 + dy };
  if (object.type === "rect") return { ...object, x: object.x + dx, y: object.y + dy };
  if (object.type === "polygon") return { ...object, points: object.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  return { ...object, x: object.x + dx, y: object.y + dy };
}

export function moveObjectsByDelta(objects: PlanObject[], ids: string[], dx: number, dy: number, context?: { layers?: PlanLayer[]; readOnly?: boolean; groups?: PlanGroup[] }) {
  const selected = new Set(ids);
  const layerMap = new Map((context?.layers || []).map((layer) => [layer.id, layer]));
  return objects.map((object) => {
    if (!selected.has(object.id)) return object;
    const layer = object.layerId ? layerMap.get(object.layerId) : context?.layers?.[0];
    return canMoveObject(object, layer, context?.readOnly) && !isObjectInLockedGroup(context?.groups || [], object.id) ? moveObjectByDelta(object, dx, dy) : object;
  });
}

export function getObjectBounds(object: PlanObject): PlanBounds {
  if (object.type === "line") {
    const x = Math.min(object.x1, object.x2);
    const y = Math.min(object.y1, object.y2);
    return { x, y, width: Math.abs(object.x2 - object.x1), height: Math.abs(object.y2 - object.y1) };
  }
  if (object.type === "rect") return normalizeBounds({ x: object.x, y: object.y, width: object.width, height: object.height });
  if (object.type === "polygon") return getPolygonBoundingBox(object.points);
  if (object.type === "symbol") return { x: object.x, y: object.y, width: object.size, height: object.size };
  return { x: object.x, y: object.y, width: Math.max(1, object.text.length * object.fontSize * 0.55), height: object.fontSize };
}

function normalizeBounds(bounds: PlanBounds): PlanBounds {
  const x = bounds.width < 0 ? bounds.x + bounds.width : bounds.x;
  const y = bounds.height < 0 ? bounds.y + bounds.height : bounds.y;
  return { x, y, width: Math.abs(bounds.width), height: Math.abs(bounds.height) };
}

export function getSelectionBounds(objects: PlanObject[], ids?: string[]): PlanBounds | null {
  const selected = ids ? objects.filter((object) => ids.includes(object.id)) : objects;
  if (!selected.length) return null;
  const boxes = selected.map(getObjectBounds);
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function objectIntersectsRect(object: PlanObject, rect: PlanBounds) {
  const box = getObjectBounds(object);
  return box.x >= rect.x && box.y >= rect.y && box.x + box.width <= rect.x + rect.width && box.y + box.height <= rect.y + rect.height;
}

export const isObjectInsideSelectionRect = objectIntersectsRect;

export function filterEditableObjects(objects: PlanObject[], layers: PlanLayer[], readOnly?: boolean, groups: PlanGroup[] = []) {
  const layerMap = new Map(layers.map((layer) => [layer.id, layer]));
  return objects.filter((object) => canEditObject(object, object.layerId ? layerMap.get(object.layerId) : layers[0], readOnly) && !isObjectInLockedGroup(groups, object.id));
}

export function getEditableSelectedObjectIds(document: PlanDocument, ids: string[], readOnly?: boolean) {
  const selected = new Set(ids);
  return filterEditableObjects(
    document.objects.filter((object) => selected.has(object.id)),
    document.layers,
    readOnly,
    document.groups
  ).map((object) => object.id);
}

export function getObjectsBounds(objects: PlanObject[]) {
  return getSelectionBounds(objects);
}

export type PlanAlignMode = "left" | "right" | "top" | "bottom" | "centerH" | "centerV";
export type PlanDistributeDirection = "horizontal" | "vertical";

export function alignObjects(objects: PlanObject[], ids: string[], mode: PlanAlignMode, context?: { layers?: PlanLayer[]; readOnly?: boolean; groups?: PlanGroup[] }) {
  const selected = new Set(ids);
  const editable = filterEditableObjects(objects.filter((object) => selected.has(object.id)), context?.layers || [], context?.readOnly, context?.groups || []);
  if (editable.length < 2) return objects;
  const selection = getSelectionBounds(editable);
  if (!selection) return objects;
  return objects.map((object) => {
    if (!editable.some((item) => item.id === object.id)) return object;
    const box = getObjectBounds(object);
    const dx = mode === "left" ? selection.x - box.x : mode === "right" ? selection.x + selection.width - (box.x + box.width) : mode === "centerH" ? selection.x + selection.width / 2 - (box.x + box.width / 2) : 0;
    const dy = mode === "top" ? selection.y - box.y : mode === "bottom" ? selection.y + selection.height - (box.y + box.height) : mode === "centerV" ? selection.y + selection.height / 2 - (box.y + box.height / 2) : 0;
    return moveObjectByDelta(object, dx, dy);
  });
}

export function distributeObjects(objects: PlanObject[], ids: string[], direction: PlanDistributeDirection, context?: { layers?: PlanLayer[]; readOnly?: boolean; groups?: PlanGroup[] }) {
  const selected = new Set(ids);
  const editable = filterEditableObjects(objects.filter((object) => selected.has(object.id)), context?.layers || [], context?.readOnly, context?.groups || []);
  if (editable.length < 3) return objects;
  const sorted = [...editable].sort((a, b) => {
    const aBox = getObjectBounds(a);
    const bBox = getObjectBounds(b);
    return direction === "horizontal" ? aBox.x - bBox.x : aBox.y - bBox.y;
  });
  const first = getObjectBounds(sorted[0]);
  const last = getObjectBounds(sorted[sorted.length - 1]);
  const start = direction === "horizontal" ? first.x + first.width / 2 : first.y + first.height / 2;
  const end = direction === "horizontal" ? last.x + last.width / 2 : last.y + last.height / 2;
  const gap = (end - start) / (sorted.length - 1);
  const deltas = new Map<string, { dx: number; dy: number }>();
  sorted.forEach((object, index) => {
    if (index === 0 || index === sorted.length - 1) return;
    const box = getObjectBounds(object);
    const current = direction === "horizontal" ? box.x + box.width / 2 : box.y + box.height / 2;
    const delta = start + gap * index - current;
    deltas.set(object.id, direction === "horizontal" ? { dx: delta, dy: 0 } : { dx: 0, dy: delta });
  });
  return objects.map((object) => {
    const delta = deltas.get(object.id);
    return delta ? moveObjectByDelta(object, delta.dx, delta.dy) : object;
  });
}

export function getObjectSnapPoints(object: PlanObject): PlanSnapPoint[] {
  if (object.type === "line") return [{ x: object.x1, y: object.y1, objectId: object.id, kind: "endpoint" }, { x: object.x2, y: object.y2, objectId: object.id, kind: "endpoint" }];
  if (object.type === "polygon") return object.points.map((point) => ({ ...point, objectId: object.id, kind: "vertex" }));
  const box = getObjectBounds(object);
  return [
    { x: box.x, y: box.y, objectId: object.id, kind: "corner" },
    { x: box.x + box.width, y: box.y, objectId: object.id, kind: "corner" },
    { x: box.x + box.width, y: box.y + box.height, objectId: object.id, kind: "corner" },
    { x: box.x, y: box.y + box.height, objectId: object.id, kind: "corner" },
    { x: box.x + box.width / 2, y: box.y + box.height / 2, objectId: object.id, kind: "center" },
  ];
}

export function getSelectionSnapPoints(objects: PlanObject[], ids?: string[]): PlanSnapPoint[] {
  const box = getSelectionBounds(objects, ids);
  if (!box) return [];
  return [
    { x: box.x, y: box.y, kind: "selection-corner" },
    { x: box.x + box.width, y: box.y, kind: "selection-corner" },
    { x: box.x + box.width, y: box.y + box.height, kind: "selection-corner" },
    { x: box.x, y: box.y + box.height, kind: "selection-corner" },
    { x: box.x + box.width / 2, y: box.y + box.height / 2, kind: "selection-center" },
  ];
}

export function findNearestSnapPoint(point: PlanSnapPoint, candidates: PlanSnapPoint[], threshold: number) {
  let best: (PlanSnapPoint & { distance: number }) | null = null;
  for (const candidate of candidates) {
    const distance = calculateDistancePx(point, candidate);
    if (distance <= threshold && (!best || distance < best.distance)) best = { ...candidate, distance };
  }
  return best;
}

export function applyObjectSnap(point: PlanSnapPoint, candidates: PlanSnapPoint[], threshold: number) {
  const target = findNearestSnapPoint(point, candidates, threshold);
  if (!target) return { point, target: null, dx: 0, dy: 0 };
  return { point: { x: target.x, y: target.y }, target, dx: target.x - point.x, dy: target.y - point.y };
}

export function getSnapGuides(sourcePoint: PlanSnapPoint, targetPoint: PlanSnapPoint): SnapGuide[] {
  const guides: SnapGuide[] = [];
  if (Math.abs(sourcePoint.x - targetPoint.x) < 0.001) guides.push({ orientation: "vertical", position: targetPoint.x, from: Math.min(sourcePoint.y, targetPoint.y), to: Math.max(sourcePoint.y, targetPoint.y) });
  if (Math.abs(sourcePoint.y - targetPoint.y) < 0.001) guides.push({ orientation: "horizontal", position: targetPoint.y, from: Math.min(sourcePoint.x, targetPoint.x), to: Math.max(sourcePoint.x, targetPoint.x) });
  return guides;
}

export function calculateTemporaryMeasurement(a: PlanPolygonPoint, b: PlanPolygonPoint, scale: PlanScaleConfig | null | undefined) {
  const pixels = calculateDistancePx(a, b);
  if (!hasValidScale(scale)) return `${trimNumber(pixels, 1)} px`;
  const realValue = (pixels / scale.pixels) * scale.realValue;
  const decimals = realValue >= 10 ? 1 : 2;
  return `${trimNumber(realValue, decimals)} ${scale.unit}`;
}

export function clonePlanObjects(objects: PlanObject[], options?: { activeLayerId?: string; pasteIntoActiveLayer?: boolean; offset?: { x?: number; y?: number }; preserveLinks?: boolean }) {
  const offset = options?.offset || { x: 20, y: 20 };
  return objects.map((object) => {
    const moved = moveObjectByDelta({ ...object, id: createPlanObjectId() } as PlanObject, offset.x || 0, offset.y || 0);
    return {
      ...moved,
      layerId: options?.pasteIntoActiveLayer && options.activeLayerId ? options.activeLayerId : moved.layerId,
      linkedTo: options?.preserveLinks === false ? undefined : moved.linkedTo,
    } as PlanObject;
  });
}

export function pastePlanObjects(document: PlanDocument, objects: PlanObject[], options?: { pasteIntoActiveLayer?: boolean; pasteOffset?: { x?: number; y?: number }; preserveLinks?: boolean }) {
  const layerIds = new Set(document.layers.map((layer) => layer.id));
  const clones = clonePlanObjects(objects, {
    activeLayerId: document.activeLayerId,
    pasteIntoActiveLayer: options?.pasteIntoActiveLayer !== false,
    offset: options?.pasteOffset || { x: 20, y: 20 },
    preserveLinks: options?.preserveLinks,
  }).map((object) => ({
    ...object,
    layerId: options?.pasteIntoActiveLayer === false && object.layerId && layerIds.has(object.layerId) ? object.layerId : document.activeLayerId,
  }));
  return { document: { ...document, objects: [...document.objects, ...clones] }, objects: clones };
}

export function groupObjects(document: PlanDocument, ids: string[], label?: string, options?: { readOnly?: boolean; editableOnly?: boolean }) {
  const sourceIds = options?.editableOnly === false ? ids : getEditableSelectedObjectIds(document, ids, options?.readOnly);
  const uniqueIds = Array.from(new Set(sourceIds)).filter((id) => document.objects.some((object) => object.id === id));
  if (uniqueIds.length < 2) return document;
  return {
    ...document,
    groups: [
      ...document.groups.filter((group) => !uniqueIds.some((id) => group.objectIds.includes(id))),
      {
        id: createPlanGroupId(),
        label: label || `Grupo ${document.groups.length + 1}`,
        objectIds: uniqueIds,
        locked: false,
        collapsed: false,
      },
    ],
  };
}

export function ungroupObjects(document: PlanDocument, groupId: string) {
  return { ...document, groups: document.groups.filter((group) => group.id !== groupId) };
}

export function updatePlanGroup(document: PlanDocument, groupId: string, patch: Partial<PlanGroup>) {
  return { ...document, groups: document.groups.map((group) => group.id === groupId ? { ...group, ...patch, objectIds: normalizeGroupObjectIds(patch.objectIds || group.objectIds, document.objects.map((object) => object.id)) } : group) };
}

export function cleanPlanGroups(document: PlanDocument) {
  const objectIds = document.objects.map((object) => object.id);
  return { ...document, groups: normalizeGroups(document.groups, objectIds) };
}

export const cleanupGroupsAfterObjectDelete = cleanPlanGroups;

export function isObjectInLockedGroup(groups: PlanGroup[] | undefined, objectId: string) {
  return !!groups?.some((group) => group.locked && group.objectIds.includes(objectId));
}

export function applyPlanTemplate(document: PlanDocument, templatePlan: unknown, options?: { mode?: "replace" | "insert"; preserveLinks?: boolean; mergeLayersByName?: boolean; templateId?: string; templateName?: string }) {
  const normalizedTemplate = normalizePlanData(templatePlan);
  if ((options?.mode || "replace") === "replace") {
    return {
      ...normalizedTemplate,
      metadata: {
        ...normalizedTemplate.metadata,
        templateId: options?.templateId,
        templateName: options?.templateName,
        createdFromTemplateAt: new Date().toISOString(),
      },
    };
  }
  const layerResult = mergeTemplateLayers(document.layers, normalizedTemplate.layers, options?.mergeLayersByName !== false);
  const inserted = clonePlanObjects(normalizedTemplate.objects, { offset: { x: 20, y: 20 }, preserveLinks: options?.preserveLinks === true }).map((object) => ({
    ...object,
    layerId: layerResult.layerIdMap.get(object.layerId || "") || document.activeLayerId,
  }));
  return {
    ...document,
    layers: layerResult.layers,
    objects: [...document.objects, ...inserted],
    metadata: {
      ...document.metadata,
      templateId: options?.templateId,
      templateName: options?.templateName,
      createdFromTemplateAt: new Date().toISOString(),
    },
  };
}

export function insertPlanBlock(document: PlanDocument, blockJson: unknown, at: PlanPolygonPoint = { x: 0, y: 0 }, options?: { insertIntoActiveLayer?: boolean; preserveLinks?: boolean }) {
  const raw = parseMaybeJson(blockJson);
  const rawObjects = isRecord(raw) && Array.isArray(raw.objects) ? raw.objects : [];
  const anchor = isRecord(raw) && isRecord(raw.anchor) ? { x: normalizeNumber(raw.anchor.x, 0), y: normalizeNumber(raw.anchor.y, 0) } : { x: 0, y: 0 };
  const objects = rawObjects.map((object) => normalizePlanObject(object, document.activeLayerId)).filter(Boolean) as PlanObject[];
  const inserted = objects.map((object) => {
    const moved = moveObjectByDelta({ ...object, id: createPlanObjectId() } as PlanObject, at.x - anchor.x, at.y - anchor.y);
    return {
      ...moved,
      layerId: options?.insertIntoActiveLayer !== false ? document.activeLayerId : moved.layerId || document.activeLayerId,
      linkedTo: options?.preserveLinks ? moved.linkedTo : undefined,
    } as PlanObject;
  });
  return { document: { ...document, objects: [...document.objects, ...inserted] }, objects: inserted };
}

function mergeTemplateLayers(current: PlanLayer[], incoming: PlanLayer[], mergeByName: boolean) {
  const layers = [...current];
  const layerIdMap = new Map<string, string>();
  for (const layer of incoming) {
    const existing = mergeByName ? layers.find((item) => item.name.trim().toLowerCase() === layer.name.trim().toLowerCase()) : null;
    if (existing) {
      layerIdMap.set(layer.id, existing.id);
      continue;
    }
    const id = `layer_${Math.random().toString(36).slice(2, 10)}`;
    layers.push({ ...layer, id, order: layers.length + 1 });
    layerIdMap.set(layer.id, id);
  }
  return { layers, layerIdMap };
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
      showArea: typeof input.showArea === "boolean" ? input.showArea : false,
      manualAreaLabel: typeof input.manualAreaLabel === "string" ? input.manualAreaLabel : undefined,
    };
  }

  if (input.type === "polygon") {
    const points = Array.isArray(input.points)
      ? input.points
          .filter(isRecord)
          .map((point) => ({ x: normalizeNumber(point.x, 0), y: normalizeNumber(point.y, 0) }))
      : [];
    if (points.length < 3) return null;
    return {
      ...base,
      type: "polygon",
      points,
      stroke: normalizeColor(input.stroke, "#111827"),
      strokeWidth: normalizePositiveNumber(input.strokeWidth, 2),
      fill: typeof input.fill === "string" ? input.fill : "rgba(37, 99, 235, 0.12)",
      label: typeof input.label === "string" ? input.label : "Zona",
      showArea: typeof input.showArea === "boolean" ? input.showArea : true,
      manualAreaLabel: typeof input.manualAreaLabel === "string" ? input.manualAreaLabel : undefined,
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

function normalizeGroups(input: unknown, validObjectIds: string[]): PlanGroup[] {
  const groups = Array.isArray(input) ? input : [];
  return groups
    .filter(isRecord)
    .map((group, index) => {
      const objectIds = normalizeGroupObjectIds(group.objectIds, validObjectIds);
      if (objectIds.length < 2) return null;
      return {
        id: typeof group.id === "string" && group.id.trim() ? group.id.trim() : createPlanGroupId(),
        label: typeof group.label === "string" && group.label.trim() ? group.label.trim() : `Grupo ${index + 1}`,
        objectIds,
        locked: group.locked === true,
        collapsed: group.collapsed === true,
      };
    })
    .filter((group): group is PlanGroup => !!group);
}

function normalizeGroupObjectIds(input: unknown, validObjectIds: string[]) {
  const valid = new Set(validObjectIds);
  return Array.from(new Set(Array.isArray(input) ? input.filter((id): id is string => typeof id === "string" && valid.has(id)) : []));
}

function normalizeMetadata(input: unknown) {
  if (!isRecord(input)) return {};
  return {
    templateId: typeof input.templateId === "string" ? input.templateId : undefined,
    templateName: typeof input.templateName === "string" ? input.templateName : undefined,
    createdFromTemplateAt: typeof input.createdFromTemplateAt === "string" ? input.createdFromTemplateAt : undefined,
  };
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
    calibratedFrom: normalizeCalibration(input.calibratedFrom),
  };
}

function normalizeCalibration(input: unknown) {
  if (!isRecord(input)) return undefined;
  const pixelLength = normalizePositiveNumber(input.pixelLength, 0);
  const realLength = normalizePositiveNumber(input.realLength, 0);
  if (!pixelLength || !realLength) return undefined;
  return {
    objectId: typeof input.objectId === "string" ? input.objectId : undefined,
    pixelLength,
    realLength,
    unit: normalizeUnit(input.unit, "m"),
    calibratedAt: typeof input.calibratedAt === "string" ? input.calibratedAt : "",
  };
}

function normalizeGrid(input: unknown, fallback: PlanGridConfig): PlanGridConfig {
  if (!isRecord(input)) return fallback;
  return {
    enabled: input.enabled !== false,
    size: normalizePositiveNumber(input.size, fallback.size),
    snap: input.snap !== false,
  };
}

function normalizeSnap(input: unknown, fallback: PlanSnapConfig): PlanSnapConfig {
  if (!isRecord(input)) return fallback;
  return {
    enabled: input.enabled !== false,
    toGrid: input.toGrid !== false,
    toObjects: input.toObjects !== false,
    threshold: normalizePositiveNumber(input.threshold, fallback.threshold),
  };
}

function normalizeView(input: unknown, fallback: PlanViewConfig): PlanViewConfig {
  if (!isRecord(input)) return fallback;
  return {
    showRulers: input.showRulers !== false,
    showGuides: input.showGuides !== false,
  };
}

function normalizeBackground(input: unknown, fallback: PlanBackgroundConfig = DEFAULT_BACKGROUND): PlanBackgroundConfig {
  if (!isRecord(input)) return fallback;
  return {
    url: typeof input.url === "string" ? input.url : "",
    locked: input.locked !== false,
    opacity: clamp(normalizeNumber(input.opacity, 1), 0, 1),
    fit: input.fit === "cover" || input.fit === "stretch" || input.fit === "original" || input.fit === "contain" ? input.fit : fallback.fit,
    source: normalizeBackgroundSource(input.source, fallback.source),
  };
}

function normalizeBackgroundSource(input: unknown, fallback: PlanBackgroundConfig["source"]) {
  if (!isRecord(input)) return fallback;
  return {
    type: input.type === "upload" ? "upload" as const : "url" as const,
    fileName: typeof input.fileName === "string" ? input.fileName : "",
    uploadedAt: typeof input.uploadedAt === "string" ? input.uploadedAt : "",
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
  return input === "m" || input === "cm" || input === "mm" || input === "km" || input === "in" || input === "ft" || input === "px" ? input : fallback;
}

function isFinitePoint(point: PlanPolygonPoint) {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function signedPolygonArea(points: PlanPolygonPoint[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function direction(a: PlanPolygonPoint, b: PlanPolygonPoint, c: PlanPolygonPoint) {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}

function onSegment(a: PlanPolygonPoint, b: PlanPolygonPoint, c: PlanPolygonPoint) {
  return Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
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
