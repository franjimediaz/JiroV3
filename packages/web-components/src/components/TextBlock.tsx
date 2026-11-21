import { visualStyle, type VisualStyle } from "../styles/visual.js";

export interface TextBlockProps {
  text: string;
  align?: "left" | "center" | "right";
  style?: VisualStyle;
}
export function TextBlock({ text, align = "left", style }: TextBlockProps) {
  return <p className="jws-text" style={{ textAlign: align, ...visualStyle(style) }}>{text}</p>;
}
