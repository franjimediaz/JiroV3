
import type { CSSProperties } from "react";

// =====================================================
// TIPOS
// =====================================================

export type SpacingValue = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export type VisualStyle = {
  // DISPLAY
  display?: "block" | "flex" | "grid" | "none";

  // FLEXBOX
  flexDirection?: "row" | "column";
  justifyContent?: "start" | "center" | "end" | "between";
  alignItems?: "start" | "center" | "end" | "stretch";
  flexWrap?: "nowrap" | "wrap";
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number;
  order?: number;

  // ESPACIADO
  gap?: number;

  // DIMENSIONES
  width?: "auto" | "full";
  height?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;

  // ESPACIADO LEGACY
  padding?: number;
  margin?: number;

  // NUEVO ESPACIADO POR LADO
  paddingSides?: SpacingValue;
  marginSides?: SpacingValue;

  // FONDOS
  backgroundColor?: string;
  color?: string;

  // BORDES
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;

  // SOMBRAS
  boxShadow?: "none" | "small" | "medium" | "large";

  // TIPOGRAFÍA
  fontFamily?: "inherit" | "sans" | "serif" | "mono";
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: "left" | "center" | "right";

  // COMPORTAMIENTO VISUAL
  opacity?: number;
  overflow?: "visible" | "hidden" | "auto";
};

// =====================================================
// MAPAS CSS
// =====================================================

const justifyValues = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
} as const;

const alignValues = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
} as const;

const shadowValues = {
  none: "none",
  small: "0 1px 3px rgb(15 23 42 / 0.12)",
  medium: "0 8px 24px rgb(15 23 42 / 0.14)",
  large: "0 20px 50px rgb(15 23 42 / 0.18)",
} as const;

const fontFamilies = {
  inherit: "inherit",
  sans: "Arial, Helvetica, sans-serif",
  serif: "Georgia, Times New Roman, serif",
  mono: "Consolas, Monaco, monospace",
} as const;

// =====================================================
// ESPACIADO
// =====================================================

function applySpacing(
  style: CSSProperties,
  property: "padding" | "margin",
  value?: number,
  sides?: SpacingValue
): void {
  // Conserva el comportamiento anterior.
  if (value !== undefined) {
    style[property] = value;
  }

  if (!sides) return;

  // Los valores específicos prevalecen sobre el general.
  if (property === "padding") {
    if (sides.top !== undefined) {
      style.paddingTop = sides.top;
    }
    if (sides.right !== undefined) {
      style.paddingRight = sides.right;
    }
    if (sides.bottom !== undefined) {
      style.paddingBottom = sides.bottom;
    }
    if (sides.left !== undefined) {
      style.paddingLeft = sides.left;
    }
  } else {
    if (sides.top !== undefined) {
      style.marginTop = sides.top;
    }
    if (sides.right !== undefined) {
      style.marginRight = sides.right;
    }
    if (sides.bottom !== undefined) {
      style.marginBottom = sides.bottom;
    }
    if (sides.left !== undefined) {
      style.marginLeft = sides.left;
    }
  }
}

// =====================================================
// GENERADOR DE ESTILOS
// =====================================================

export function visualStyle(
  value?: VisualStyle
): CSSProperties | undefined {
  if (!value) return undefined;

  const style: CSSProperties = {
    // DISPLAY
    display: value.display,

    // FLEXBOX
    flexDirection: value.flexDirection,

    justifyContent: value.justifyContent
      ? justifyValues[value.justifyContent]
      : undefined,

    alignItems: value.alignItems
      ? alignValues[value.alignItems]
      : undefined,

    flexWrap: value.flexWrap,
    flexGrow: value.flexGrow,
    flexShrink: value.flexShrink,
    flexBasis: value.flexBasis,
    order: value.order,

    // ESPACIADO
    gap: value.gap,

    // DIMENSIONES
    width:
      value.width === "full"
        ? "100%"
        : value.width,

    height: value.height,
    minWidth: value.minWidth,
    maxWidth: value.maxWidth,
    minHeight: value.minHeight,
    maxHeight: value.maxHeight,

    // COLORES
    backgroundColor: value.backgroundColor,
    color: value.color,

    // BORDES
    borderStyle:
      value.borderWidth !== undefined &&
      value.borderWidth > 0
        ? "solid"
        : undefined,

    borderWidth: value.borderWidth,
    borderColor: value.borderColor,
    borderRadius: value.borderRadius,

    // SOMBRAS
    boxShadow: value.boxShadow
      ? shadowValues[value.boxShadow]
      : undefined,

    // TIPOGRAFÍA
    fontFamily: value.fontFamily
      ? fontFamilies[value.fontFamily]
      : undefined,

    fontSize: value.fontSize,
    fontWeight: value.fontWeight,
    lineHeight: value.lineHeight,
    letterSpacing: value.letterSpacing,
    textAlign: value.textAlign,

    // COMPORTAMIENTO
    opacity: value.opacity,
    overflow: value.overflow,
  };

  // Aplicar espaciado después de las propiedades base.
  applySpacing(
    style,
    "padding",
    value.padding,
    value.paddingSides
  );

  applySpacing(
    style,
    "margin",
    value.margin,
    value.marginSides
  );

  return style;
}
