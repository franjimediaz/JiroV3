import type { CSSProperties, ReactNode } from "react";

export interface SectionProps {
  children: ReactNode;
  background?: string;
  spacing?: "none" | "small" | "medium" | "large";
  id?: string;
  labelledBy?: string;
}
export function Section({ children, background, spacing = "medium", id, labelledBy }: SectionProps) {
  return <section id={id} aria-labelledby={labelledBy} className={`jws-section jws-section--${spacing}`} style={{ backgroundColor: background } as CSSProperties}>{children}</section>;
}
