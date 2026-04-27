type AnyObj = Record<string, any>;

export type PdfPlanRenderOptions = {
  width?: number;
  height?: number;
  includeBackground?: boolean;
  includeGrid?: boolean;
  includeHiddenLayers?: boolean;
  includeMeasurements?: boolean;
  includeAreas?: boolean;
  includeLayerLegend?: boolean;
  fit?: "contain" | "cover" | "stretch";
  backgroundColor?: string;
  pixelRatio?: number;
  placeholder?: string;
};

export type PdfPlanRenderCache = Map<string, string>;

type Point = { x: number; y: number };
type NormalizedPlan = {
  version: number;
  canvas: {
    width: number;
    height: number;
    unit: string;
    scale: { pixels: number; realValue: number; unit: string } | null;
    grid: { enabled: boolean; size: number };
  };
  background?: { url?: string; opacity?: number };
  layers: Array<{ id: string; name: string; visible: boolean; order: number }>;
  objects: AnyObj[];
};

export function normalizePlanForRender(input: unknown): NormalizedPlan | null {
  const raw = parseMaybeJson(input);
  if (!isRecord(raw)) return null;
  const canvas = isRecord(raw.canvas) ? raw.canvas : {};
  const width = positiveNumber(canvas.width, 0);
  const height = positiveNumber(canvas.height, 0);
  const objects = Array.isArray(raw.objects) ? raw.objects.filter(isRecord) : [];
  if (!width || !height) return null;
  const layers = normalizeLayers(raw.layers);
  return {
    version: positiveNumber(raw.version, 0) || 1,
    canvas: {
      width,
      height,
      unit: typeof canvas.unit === "string" ? canvas.unit : "m",
      scale: normalizeScale(canvas.scale),
      grid: normalizeGrid(canvas.grid),
    },
    background: isRecord(raw.background) ? { url: text(raw.background.url), opacity: numberOr(raw.background.opacity, 1) } : undefined,
    layers,
    objects,
  };
}

export function getPlanRenderSize(plan: NormalizedPlan, options?: PdfPlanRenderOptions) {
  const maxWidth = positiveNumber(options?.width, 520) || 520;
  const requestedHeight = positiveNumber(options?.height, 0);
  if (requestedHeight) return { width: maxWidth, height: requestedHeight };
  const ratio = plan.canvas.height / Math.max(1, plan.canvas.width);
  return { width: maxWidth, height: Math.max(120, Math.round(maxWidth * ratio)) };
}

export function createPlanRenderCache(): PdfPlanRenderCache {
  return new Map();
}

export function getPlanRenderCacheKey(planInput: unknown, options?: PdfPlanRenderOptions) {
  return `${stableStringify(parseMaybeJson(planInput))}|${stableStringify(options || {})}`;
}

export function renderPlanToDataUrl(planInput: unknown, options?: PdfPlanRenderOptions, cache?: PdfPlanRenderCache) {
  const key = getPlanRenderCacheKey(planInput, options);
  const cached = cache?.get(key);
  if (cached) return cached;
  const plan = normalizePlanForRender(planInput);
  if (!plan || !plan.objects.length) return "";
  const svg = renderPlanSvg(plan, options);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache?.set(key, dataUrl);
  return dataUrl;
}

export async function renderPlanToBlob(planInput: unknown, options?: PdfPlanRenderOptions, cache?: PdfPlanRenderCache) {
  const dataUrl = renderPlanToDataUrl(planInput, options, cache);
  if (!dataUrl) return new Blob([]);
  const svg = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
  return new Blob([svg], { type: "image/svg+xml" });
}

export function renderPlanToHtml(planInput: unknown, options?: PdfPlanRenderOptions, cache?: PdfPlanRenderCache) {
  const plan = normalizePlanForRender(planInput);
  const placeholder = escapeHtml(options?.placeholder || "[Plano no disponible]");
  if (!plan || !plan.objects.length) return `<span class="pdf-plan-placeholder">${placeholder}</span>`;
  const src = renderPlanToDataUrl(planInput, options, cache);
  if (!src) return `<span class="pdf-plan-placeholder">${placeholder}</span>`;
  const size = getPlanRenderSize(plan, options);
  return `<img class="pdf-plan-img" src="${src}" alt="Plano" width="${size.width}" height="${size.height}" style="width:${size.width}px;height:${size.height}px;max-width:100%;object-fit:${options?.fit || "contain"};" />`;
}

function renderPlanSvg(plan: NormalizedPlan, options?: PdfPlanRenderOptions) {
  const size = getPlanRenderSize(plan, options);
  const visibleLayers = new Map(
    plan.layers
      .filter((layer) => options?.includeHiddenLayers || layer.visible !== false)
      .map((layer) => [layer.id, layer]),
  );
  const objects = plan.objects.filter((object) => !object.layerId || visibleLayers.has(String(object.layerId)));
  const scaleX = size.width / plan.canvas.width;
  const scaleY = size.height / plan.canvas.height;
  const scale = Math.min(scaleX, scaleY);
  const contentWidth = plan.canvas.width * scale;
  const contentHeight = plan.canvas.height * scale;
  const offsetX = options?.fit === "stretch" ? 0 : (size.width - contentWidth) / 2;
  const offsetY = options?.fit === "stretch" ? 0 : (size.height - contentHeight) / 2;
  const transform = options?.fit === "stretch"
    ? `scale(${scaleX} ${scaleY})`
    : `translate(${round(offsetX)} ${round(offsetY)}) scale(${round(scale)})`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">
    <rect width="100%" height="100%" fill="${escapeAttr(options?.backgroundColor || "#ffffff")}" />
    <g transform="${transform}">
      ${options?.includeBackground !== false && plan.background?.url ? `<image href="${escapeAttr(plan.background.url)}" x="0" y="0" width="${plan.canvas.width}" height="${plan.canvas.height}" opacity="${numberOr(plan.background.opacity, 1)}" preserveAspectRatio="xMidYMid meet" />` : ""}
      ${options?.includeGrid ? renderGrid(plan) : ""}
      ${objects.map((object) => renderPlanObject(object, plan, options)).join("")}
    </g>
    ${options?.includeLayerLegend ? renderLegend(plan, visibleLayers, size) : ""}
  </svg>`;
}

function renderGrid(plan: NormalizedPlan) {
  const step = plan.canvas.grid.size || 20;
  const lines: string[] = [];
  for (let x = 0; x <= plan.canvas.width; x += step) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${plan.canvas.height}" stroke="#cbd5e1" stroke-width="1" opacity=".45" />`);
  for (let y = 0; y <= plan.canvas.height; y += step) lines.push(`<line x1="0" y1="${y}" x2="${plan.canvas.width}" y2="${y}" stroke="#cbd5e1" stroke-width="1" opacity=".45" />`);
  return lines.join("");
}

function renderPlanObject(object: AnyObj, plan: NormalizedPlan, options?: PdfPlanRenderOptions) {
  const stroke = escapeAttr(object.stroke || object.symbolColor || object.fill || "#111827");
  const sw = positiveNumber(object.strokeWidth, 2) || 2;
  if (object.type === "line") {
    const measure = options?.includeMeasurements !== false && object.showMeasure ? renderLineMeasure(object, plan) : "";
    return `<line x1="${num(object.x1)}" y1="${num(object.y1)}" x2="${num(object.x2)}" y2="${num(object.y2)}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" />${labelText(object.label, mid(object.x1, object.x2) + 6, mid(object.y1, object.y2) + 6, stroke)}${measure}`;
  }
  if (object.type === "rect") {
    const area = options?.includeAreas !== false && object.showArea ? renderAreaLabel(rectAreaLabel(object, plan), num(object.x) + num(object.width) / 2, num(object.y) + num(object.height) / 2) : "";
    return `<rect x="${num(object.x)}" y="${num(object.y)}" width="${Math.abs(num(object.width))}" height="${Math.abs(num(object.height))}" fill="${escapeAttr(object.fill || "transparent")}" stroke="${stroke}" stroke-width="${sw}" />${labelText(object.label, num(object.x) + 8, num(object.y) + 18, stroke)}${area}`;
  }
  if (object.type === "polygon") {
    const points = Array.isArray(object.points) ? object.points.filter(isRecord).map((p) => `${num(p.x)},${num(p.y)}`).join(" ") : "";
    const center = polygonCenter(object.points);
    const area = options?.includeAreas !== false && object.showArea ? renderAreaLabel(polygonAreaLabel(object, plan), center.x, center.y) : "";
    return `<polygon points="${points}" fill="${escapeAttr(object.fill || "rgba(37,99,235,.12)")}" stroke="${stroke}" stroke-width="${sw}" />${labelText(object.label, center.x + 8, center.y + 18, stroke)}${area}`;
  }
  if (object.type === "text") {
    return labelText(object.text, num(object.x), num(object.y) + positiveNumber(object.fontSize, 16), escapeAttr(object.fill || "#111827"), positiveNumber(object.fontSize, 16) || 16);
  }
  if (object.type === "symbol") {
    return renderSymbol(object);
  }
  return "";
}

function renderSymbol(object: AnyObj) {
  const size = positiveNumber(object.size, 34) || 34;
  const x = num(object.x);
  const y = num(object.y);
  const color = escapeAttr(object.symbolColor || "#111827");
  const icon = text(object.symbolIcon);
  const label = text(object.symbolLabel || object.symbolId);
  if (/^https?:\/\//i.test(icon) || icon.startsWith("data:image/") || icon.startsWith("/")) {
    return `<image href="${escapeAttr(icon)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" />${labelText(label, x, y + size + 14, color, 11)}`;
  }
  const visual = icon && !/^bi(?:\s|-)/.test(icon)
    ? icon
    : (label || object.symbolId || "?").split(/\s+/).map((part: string) => part[0]).join("").slice(0, 2).toUpperCase();
  return `<g><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="6" fill="#f8fafc" stroke="${color}" stroke-width="2" /><text x="${x + size / 2}" y="${y + size / 2 + 5}" text-anchor="middle" font-size="${Math.max(11, size * 0.38)}" font-weight="700" fill="${color}">${escapeHtml(visual)}</text>${labelText(label, x - size * .7, y + size + 14, color, 11, size * 2.4)}</g>`;
}

function renderLineMeasure(object: AnyObj, plan: NormalizedPlan) {
  const label = object.manualMeasureLabel || lengthLabel(Math.hypot(num(object.x2) - num(object.x1), num(object.y2) - num(object.y1)), plan);
  return renderAreaLabel(label, mid(object.x1, object.x2) + 10, mid(object.y1, object.y2) - 8);
}

function rectAreaLabel(object: AnyObj, plan: NormalizedPlan) {
  if (object.manualAreaLabel) return text(object.manualAreaLabel);
  if (!plan.canvas.scale?.pixels || !plan.canvas.scale.realValue) return "";
  const area = Math.abs(num(object.width) * num(object.height)) * Math.pow(plan.canvas.scale.realValue / plan.canvas.scale.pixels, 2);
  return `${trim(area)} ${plan.canvas.scale.unit}²`;
}

function polygonAreaLabel(object: AnyObj, plan: NormalizedPlan) {
  if (object.manualAreaLabel) return text(object.manualAreaLabel);
  if (!plan.canvas.scale?.pixels || !plan.canvas.scale.realValue) return "";
  const areaPx = polygonArea(object.points);
  const area = areaPx * Math.pow(plan.canvas.scale.realValue / plan.canvas.scale.pixels, 2);
  return `${trim(area)} ${plan.canvas.scale.unit}²`;
}

function lengthLabel(px: number, plan: NormalizedPlan) {
  if (!plan.canvas.scale?.pixels || !plan.canvas.scale.realValue) return `${trim(px)} px`;
  return `${trim((px / plan.canvas.scale.pixels) * plan.canvas.scale.realValue)} ${plan.canvas.scale.unit}`;
}

function renderAreaLabel(label: string, x: number, y: number) {
  if (!label) return "";
  return `<text x="${num(x)}" y="${num(y)}" text-anchor="middle" font-size="13" font-weight="700" fill="#2563eb">${escapeHtml(label)}</text>`;
}

function labelText(label: any, x: number, y: number, fill = "#111827", fontSize = 13, width?: number) {
  const value = text(label);
  if (!value) return "";
  return `<text x="${num(x)}" y="${num(y)}" ${width ? `textLength="${num(width)}"` : ""} font-size="${num(fontSize)}" fill="${escapeAttr(fill)}">${escapeHtml(value)}</text>`;
}

function renderLegend(plan: NormalizedPlan, visibleLayers: Map<string, AnyObj>, size: { width: number; height: number }) {
  const names = plan.layers.filter((layer) => visibleLayers.has(layer.id)).map((layer) => layer.name).join(", ");
  return names ? `<text x="8" y="${size.height - 8}" font-size="10" fill="#64748b">${escapeHtml(names)}</text>` : "";
}

function normalizeLayers(input: unknown) {
  const layers = Array.isArray(input) ? input : [];
  const normalized = layers.filter(isRecord).map((layer, index) => ({
    id: text(layer.id) || `layer_${index + 1}`,
    name: text(layer.name) || `Capa ${index + 1}`,
    visible: layer.visible !== false,
    order: positiveNumber(layer.order, index + 1) || index + 1,
  }));
  return normalized.length ? normalized : [{ id: "layer_default", name: "Capa 1", visible: true, order: 1 }];
}

function normalizeScale(input: unknown) {
  if (!isRecord(input)) return null;
  const pixels = positiveNumber(input.pixels, 0);
  const realValue = positiveNumber(input.realValue, 0);
  return pixels && realValue ? { pixels, realValue, unit: text(input.unit) || "m" } : null;
}

function normalizeGrid(input: unknown) {
  return isRecord(input) ? { enabled: input.enabled !== false, size: positiveNumber(input.size, 20) || 20 } : { enabled: true, size: 20 };
}

function polygonCenter(points: unknown): Point {
  const list = Array.isArray(points) ? points.filter(isRecord).map((p) => ({ x: num(p.x), y: num(p.y) })) : [];
  if (!list.length) return { x: 0, y: 0 };
  return { x: list.reduce((sum, point) => sum + point.x, 0) / list.length, y: list.reduce((sum, point) => sum + point.y, 0) / list.length };
}

function polygonArea(points: unknown) {
  const list = Array.isArray(points) ? points.filter(isRecord).map((p) => ({ x: num(p.x), y: num(p.y) })) : [];
  if (list.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < list.length; i++) {
    const current = list[i];
    const next = list[(i + 1) % list.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function isRecord(value: unknown): value is AnyObj {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseMaybeJson(input: unknown) {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as AnyObj;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000) / 1000 : 0;
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function numberOr(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function mid(a: unknown, b: unknown) {
  return (num(a) + num(b)) / 2;
}

function trim(value: number) {
  return Number(value.toFixed(value >= 10 ? 2 : 3)).toLocaleString("es-ES");
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function escapeHtml(value: unknown) {
  return text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function escapeAttr(value: unknown) {
  return escapeHtml(value);
}
