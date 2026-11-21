import { safeUrl } from "./urls.js";
import { visualStyle, type VisualStyle } from "../styles/visual.js";

export interface ButtonLinkProps {
  text: string;
  href: string;
  variant?: "primary" | "secondary" | "outline";
  newTab?: boolean;
  style?: VisualStyle;
}
export function ButtonLink({ text, href, variant = "primary", newTab = false, style }: ButtonLinkProps) {
  const url = safeUrl(href);
  const external = /^https?:/i.test(url);
  return <a className={`jws-button jws-button--${variant}`} style={visualStyle(style)} href={url} target={newTab ? "_blank" : undefined} rel={newTab || external ? "noopener noreferrer" : undefined}>{text}</a>;
}
