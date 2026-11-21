import type { CSSProperties, ReactNode } from "react";
import { visualStyle, type VisualStyle } from "../styles/visual.js";

export interface SectionProps {
  children: ReactNode;
  background?: string;
  spacing?: "none" | "small" | "medium" | "large";
  id?: string;
  labelledBy?: string;
  style?: VisualStyle;
}
export function Section({ children, background, spacing = "medium", id, labelledBy, style }: SectionProps) {
  return <section id={id} aria-labelledby={labelledBy} className={`jws-section jws-section--${spacing}`} style={{ backgroundColor: background, ...visualStyle(style) } as CSSProperties}>{children}</section>;
}
