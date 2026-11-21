
import type { CSSProperties, ReactNode } from "react";
import { visualStyle, type VisualStyle } from "../styles/visual.js";

export interface ContainerProps {
  children: ReactNode;
  maxWidth?: "narrow" | "default" | "wide" | "full";
  as?: "div" | "main";
  backgroundColor?: string;
  padding?: number;
  borderRadius?: number;
  display?: "block" | "flex" | "grid";
  gap?: number;
  justifyContent?: "start" | "center" | "end" | "between";
  alignItems?: "start" | "center" | "end" | "stretch";
  style?: VisualStyle;
}

const widths = {
  narrow: "48rem",
  default: "64rem",
  wide: "80rem",
  full: "100%",
} as const;

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

export function Container({
  children,
  maxWidth = "default",
  as: Tag = "div",
  backgroundColor,
  padding,
  borderRadius,
  display,
  gap,
  justifyContent,
  alignItems,
  style: safeStyle,
}: ContainerProps) {
  const style: CSSProperties = {
    ...visualStyle(safeStyle),
    "--jws-container-width": widths[maxWidth],
    backgroundColor: safeStyle?.backgroundColor ?? backgroundColor,
    padding: safeStyle?.padding ?? padding,
    borderRadius: safeStyle?.borderRadius ?? borderRadius,
    display: safeStyle?.display ?? display,
    gap: safeStyle?.gap ?? gap,
    justifyContent: justifyContent ? justifyValues[justifyContent] : visualStyle(safeStyle)?.justifyContent,
    alignItems: alignItems ? alignValues[alignItems] : visualStyle(safeStyle)?.alignItems,
  } as CSSProperties;

  return (
    <Tag className="jws-container" style={style}>
      {children}
    </Tag>
  );
}
