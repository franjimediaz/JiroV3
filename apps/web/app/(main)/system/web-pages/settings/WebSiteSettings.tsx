"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AutoField, FieldLabel, type Field } from "@puckeditor/core";
import type { WebGlobalHeader } from "@repo/web-schema";
import { getWebSiteSettings, saveWebSiteSettings } from "@/actions/webSiteSettings";
import { jiroPuckConfig } from "../../web-editor/jiroPuckConfig";
import styles from "../../web-editor/web-editor.module.css";
import "@puckeditor/core/no-external.css";

const sections = [
  ["Identidad", ["brandText", "logoSrc", "logoAlt", "homeHref"]],
  ["Navegación", ["links"]],
  ["Colores", ["backgroundColor", "color"]],
  ["Diseño y dimensiones", ["alignment", "minHeight", "maxWidth", "paddingX", "paddingY", "sticky"]],
] as const;
const defaults: WebGlobalHeader = { enabled: false, brandText: "Jiro", homeHref: "/", links: [], backgroundColor: "#ffffff", color: "#172033", sticky: false };

export default function WebSiteSettings({ result }: { result: Awaited<ReturnType<typeof getWebSiteSettings>> }) {
  const [header, setHeader] = useState<WebGlobalHeader>(result.header ?? defaults);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState(result.message);
  const [failed, setFailed] = useState(!result.ok);
  const lock = useRef(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(key: keyof WebGlobalHeader, value: unknown) {
    setDirty(true);
    setHeader(previous => { const next = { ...previous, [key]: value }; if (value === undefined || (key === "logoSrc" && value === "")) delete next[key]; return next; });
  }
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const saved = await saveWebSiteSettings(header);
      setNotice(saved.message); setFailed(!saved.ok);
      if (saved.ok) { setHeader(saved.header); setDirty(false); }
    } catch { setFailed(true); setNotice("No se pudo guardar. Inténtalo de nuevo."); }
    finally { lock.current = false; setBusy(false); }
  }
  const fields = jiroPuckConfig.components.Header.fields!;
  return <section className={`${styles.editor} p-3`}>
    <Link href="/system/web-pages">Volver a páginas web</Link>
    <h1>Header global</h1>
    <p>Se aplica a las páginas que no contienen su propio Header. Los cambios se publican desde Páginas web.</p>
    {notice && <p role={failed ? "alert" : "status"} className={failed ? styles.error : styles.success}>{notice}</p>}
    <form onSubmit={event => { event.preventDefault(); void save(); }} className={styles.settingsForm}>
      <fieldset disabled={busy || !result.ok}>
        <label className="d-flex gap-2 mb-3"><input type="checkbox" checked={header.enabled !== false} onChange={event => change("enabled", event.target.checked)} />Mostrar Header global</label>
        {sections.map(([title, keys]) => <section key={title} className={styles.settingsSection}><h2>{title}</h2><div className={styles.propertyGrid}>
          {keys.map(key => {
            const field = fields[key] as Field;
            const input = <AutoField field={field} value={header[key]} onChange={value => change(key, value)} />;
            return field.type === "custom" ? <div key={key}>{input}</div> : <FieldLabel key={key} el={field.type === "array" ? "div" : "label"} label={field.label || key}>{input}</FieldLabel>;
          })}
        </div></section>)}
        <section className={styles.settingsSection}><h2>Llamada a la acción</h2>
          <label className="d-flex gap-2 mb-3"><input type="checkbox" checked={!!header.cta} onChange={event => change("cta", event.target.checked ? { label: "Contacto", href: "/contacto" } : undefined)} />Mostrar CTA</label>
          {header.cta && <AutoField field={fields.cta as Field} value={header.cta} onChange={value => change("cta", value)} />}
        </section>
        <button className="btn btn-primary" type="submit" disabled={busy || !dirty}>{busy ? "Guardando…" : "Guardar configuración"}</button>
      </fieldset>
    </form>
  </section>;
}
