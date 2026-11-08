import type { CSSProperties, ReactNode } from "react";

export interface ContainerProps {
  children: ReactNode;
  maxWidth?: "narrow" | "default" | "wide" | "full";
  as?: "div" | "main";
}
const widths = { narrow: "48rem", default: "64rem", wide: "80rem", full: "100%" } as const;
export function Container({ children, maxWidth = "default", as: Tag = "div" }: ContainerProps) {
  return <Tag className="jws-container" style={{ "--jws-container-width": widths[maxWidth] } as CSSProperties}>{children}</Tag>;
}
