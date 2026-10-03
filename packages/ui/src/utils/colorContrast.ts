const FALLBACK_BACKGROUND = "#e2e8f0";

/** Resolve HEX (including alpha) to an opaque color on the form's light surface. */
export function normalizeHexColor(value: unknown): string {
  if (typeof value !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value.trim())) return FALLBACK_BACKGROUND;
  let hex = value.trim().slice(1);
  if (hex.length <= 4) hex = [...hex].map((digit) => digit + digit).join("");
  const alpha = hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1;
  return "#" + [0, 2, 4].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(channel * alpha + 255 * (1 - alpha)).toString(16).padStart(2, "0");
  }).join("");
}

/** Choose black or white by the greater relative-luminance contrast ratio. */
export function getContrastingTextColor(background: unknown): "#000000" | "#ffffff" {
  const hex = normalizeHexColor(background).slice(1);
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
}

export function getFormSectionColors(value: unknown) {
  const background = normalizeHexColor(value);
  return { background, foreground: getContrastingTextColor(background) };
}

/** Mix with white, sharing the same HEX/alpha normalization as section headers. */
export function lightenColor(value: unknown, amount = 0.18): string {
  const hex = normalizeHexColor(value).slice(1);
  const ratio = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0.18;
  return "#" + [0, 2, 4].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(channel + (255 - channel) * ratio).toString(16).padStart(2, "0");
  }).join("");
}

/** Local CSS palette shared by module surfaces and portaled action menus. */
export function getModuleColorVariables(value: unknown) {
  const base = normalizeHexColor(value);
  const contrast = getContrastingTextColor(base);
  const light = lightenColor(base);
  const soft = lightenColor(base, 0.94);
  const neutral = contrast === "#ffffff" ? "#f5f5f5" : "#262626";
  return {
    "--module-color": base,
    "--module-contrast": contrast,
    "--module-color-light": light,
    "--module-light-contrast": getContrastingTextColor(light),
    "--module-color-soft": soft,
    "--module-soft-contrast": getContrastingTextColor(soft),
    "--module-border": lightenColor(base, 0.6),
    "--module-action": neutral,
    "--module-action-text": getContrastingTextColor(neutral),
    "--module-action-hover": contrast === "#ffffff" ? "#e5e5e5" : "#404040",
  };
}
