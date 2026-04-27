export type PlanIconKind = "empty" | "bootstrap" | "emoji" | "image" | "text";

export type PlanIconInfo = {
  kind: PlanIconKind;
  value: string;
  className?: string;
};

export function getPlanIconInfo(input?: string | null): PlanIconInfo {
  const value = String(input || "").trim();
  if (!value) return { kind: "empty", value: "" };
  if (isImageUrl(value)) return { kind: "image", value };
  if (isBootstrapIcon(value)) return { kind: "bootstrap", value, className: normalizeBootstrapIconClass(value) };
  if (isLikelyEmoji(value)) return { kind: "emoji", value };
  return { kind: "text", value };
}

export function getSymbolCanvasText(icon: string | undefined, label: string, fallbackId?: string) {
  const info = getPlanIconInfo(icon);
  if (info.kind === "emoji" || info.kind === "text") return info.value;
  return getSymbolInitials(label || fallbackId || "");
}

export function getSymbolInitials(value: string) {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "?";
}

export function isImageUrl(value: string) {
  return /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(value) || /^data:image\//i.test(value);
}

function isBootstrapIcon(value: string) {
  return /^bi-[\w-]+$/.test(value) || /\bbi\s+bi-[\w-]+\b/.test(value);
}

function normalizeBootstrapIconClass(value: string) {
  if (/\bbi\s+bi-[\w-]+\b/.test(value)) return value;
  return `bi ${value}`;
}

function isLikelyEmoji(value: string) {
  return [...value].length <= 4 && /\p{Extended_Pictographic}/u.test(value);
}
