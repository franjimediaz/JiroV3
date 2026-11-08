import { safeUrl } from "./urls.js";

export interface ButtonLinkProps {
  text: string;
  href: string;
  variant?: "primary" | "secondary" | "outline";
  newTab?: boolean;
}
export function ButtonLink({ text, href, variant = "primary", newTab = false }: ButtonLinkProps) {
  const url = safeUrl(href);
  const external = /^https?:/i.test(url);
  return <a className={`jws-button jws-button--${variant}`} href={url} target={newTab ? "_blank" : undefined} rel={newTab || external ? "noopener noreferrer" : undefined}>{text}</a>;
}
