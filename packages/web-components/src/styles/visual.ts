import type { CSSProperties } from "react";

export type VisualStyle = {
  display?: "block" | "flex";
  flexDirection?: "row" | "column";
  justifyContent?: "start" | "center" | "end" | "between";
  alignItems?: "start" | "center" | "end" | "stretch";
  flexWrap?: "nowrap" | "wrap";
  gap?: number;
  width?: "auto" | "full";
  maxWidth?: number;
  minHeight?: number;
  padding?: number;
  margin?: number;
  backgroundColor?: string;
  color?: string;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  boxShadow?: "none" | "small" | "medium" | "large";
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right";
};

const justify = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" } as const;
const align = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const;
const shadows = { none: "none", small: "0 1px 3px rgb(15 23 42 / 0.12)", medium: "0 8px 24px rgb(15 23 42 / 0.14)", large: "0 20px 50px rgb(15 23 42 / 0.18)" } as const;

export function visualStyle(value?: VisualStyle): CSSProperties | undefined {
  if (!value) return undefined;
  return { display: value.display, flexDirection: value.flexDirection,
    justifyContent: value.justifyContent ? justify[value.justifyContent] : undefined,
    alignItems: value.alignItems ? align[value.alignItems] : undefined, flexWrap: value.flexWrap,
    gap: value.gap, width: value.width === "full" ? "100%" : value.width, maxWidth: value.maxWidth,
    minHeight: value.minHeight, padding: value.padding, margin: value.margin,
    backgroundColor: value.backgroundColor, color: value.color,
    borderStyle: value.borderWidth ? "solid" : undefined, borderWidth: value.borderWidth,
    borderColor: value.borderColor, borderRadius: value.borderRadius,
    boxShadow: value.boxShadow ? shadows[value.boxShadow] : undefined,
    fontSize: value.fontSize, fontWeight: value.fontWeight, lineHeight: value.lineHeight,
    textAlign: value.textAlign };
}
