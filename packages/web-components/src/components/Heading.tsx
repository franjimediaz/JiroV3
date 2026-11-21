import { visualStyle, type VisualStyle } from "../styles/visual.js";

export interface HeadingProps {
  text: string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  align?: "left" | "center" | "right";
  id?: string;
  style?: VisualStyle;
}
export function Heading({ text, level = 2, align = "left", id, style }: HeadingProps) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  return <Tag id={id} className={`jws-heading jws-heading--${level}`} style={{ textAlign: align, ...visualStyle(style) }}>{text}</Tag>;
}
