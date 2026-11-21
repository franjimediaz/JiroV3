"use client";

import { useEffect, useId, useRef, useState } from "react";
import { safeUrl } from "./urls.js";

export type HeaderLink = { label: string; href: string };
export interface HeaderProps {
  brandText?: string; logoSrc?: string; logoAlt?: string; homeHref?: string;
  links?: HeaderLink[]; cta?: HeaderLink; backgroundColor?: string; color?: string;
  minHeight?: number; paddingX?: number; paddingY?: number; maxWidth?: number;
  alignment?: "start" | "center" | "end"; sticky?: boolean;
}

export function Header({ brandText = "Jiro", logoSrc, logoAlt = "", homeHref = "/", links = [], cta, backgroundColor = "#ffffff", color = "#172033", minHeight = 72, paddingX = 24, paddingY = 12, maxWidth = 1200, alignment = "end", sticky = false }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    const media = window.matchMedia("(min-width: 48rem)");
    const closeDesktop = () => { if (media.matches) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    media.addEventListener("change", closeDesktop); document.addEventListener("keydown", escape);
    return () => { media.removeEventListener("change", closeDesktop); document.removeEventListener("keydown", escape); };
  }, []);
  const close = () => setOpen(false);
  return <header className={`jws-header${sticky ? " jws-header--sticky" : ""}`} style={{ backgroundColor, color, minHeight, padding: `${paddingY}px ${paddingX}px` }}>
    <div className="jws-header__inner" style={{ maxWidth }}>
      <a className="jws-header__brand" href={safeUrl(homeHref)} onClick={close}>
        {logoSrc ? <img className="jws-header__logo" src={safeUrl(logoSrc, true)} alt={logoAlt} /> : null}{brandText ? <span>{brandText}</span> : null}
      </a>
      <button ref={button} className="jws-header__toggle" type="button" aria-expanded={open} aria-controls={menuId} aria-label={open ? "Cerrar menú" : "Abrir menú"} onClick={() => setOpen(value => !value)}><span aria-hidden="true">{open ? "×" : "☰"}</span></button>
      <nav id={menuId} aria-label="Navegación principal" className={`jws-header__nav jws-header__nav--${alignment}${open ? " jws-header__nav--open" : ""}`}>
        {links.map((link, index) => <a key={`${link.href}-${index}`} href={safeUrl(link.href)} onClick={close}>{link.label}</a>)}
        {cta ? <a className="jws-header__cta" href={safeUrl(cta.href)} onClick={close}>{cta.label}</a> : null}
      </nav>
    </div>
  </header>;
}
