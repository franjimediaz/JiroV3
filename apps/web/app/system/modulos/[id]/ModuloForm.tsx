"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./modulo-detalle.module.css";
import { upsertModuloAction } from "@/actions/modulos";

// Validación mínima (misma que en server, simplificada)
const FIELD_TYPES = new Set([
  "text","textarea","number","money","date","datetime","boolean",
  "select","multiselect","color","file","image","selectorTabla",
]);



export default function ModuloForm({
  initialData,
  mode,
}: {
  initialData: any;
  mode: "view" | "edit" | "create";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const readOnly = mode === "view";

  const [nombre, setNombre] = useState(initialData?.nombre ?? "");
  const [route, setRoute] = useState(initialData?.route ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [tipo, setTipo] = useState(initialData?.tipo ?? "tabla");
  const [orden, setOrden] = useState<number>(initialData?.orden ?? 0);
  const [activo, setActivo] = useState<boolean>(!!initialData?.activo);
  const [parentId, setParentId] = useState<string | null>(initialData?.parent_id ?? null);
  const [propsText, setPropsText] = useState(
    JSON.stringify(initialData?.props ?? { db:{table:"",softDelete:false}, fields:[], ui:{} }, null, 2)
  );

  const [msg, setMsg] = useState<{ok:boolean; text:string} | null>(null);
  function validatePropsClient(props: any): string | null {
  if (!props || typeof props !== "object") return "props debe ser un objeto";
  if (!props.db || typeof props.db !== "object") return "props.db es requerido";
  if (!props.db.table || typeof props.db.table !== "string") return "props.db.table (string) es requerido";
  if (!Array.isArray(props.fields)) return "props.fields debe ser un array";
  for (let i = 0; i < props.fields.length; i++) {
    const f = props.fields[i];
    if (!f || typeof f !== "object") return `fields[${i}] debe ser objeto`;
    if (!f.name || typeof f.name !== "string") return `fields[${i}].name requerido`;
    if (!f.label || typeof f.label !== "string") return `fields[${i}].label requerido`;
    if (!FIELD_TYPES.has(f.type)) return `fields[${i}].type inválido`;
    if (f.type === "selectorTabla") {
      const r = f.ref;
      if (!r || typeof r !== "object" || typeof r.moduleSlug !== "string" || typeof r.displayField !== "string") {
        return `fields[${i}].ref inválido para selectorTabla`;
      }
    }
  }
  return null;
}

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;

    setMsg(null);

    if (!nombre) return setMsg({ ok:false, text:"nombre es requerido" });
    if (!slug) return setMsg({ ok:false, text:"slug es requerido" });
    if (!["carpeta","tabla","subtabla","vista"].includes(tipo)) return setMsg({ ok:false, text:"tipo inválido" });
    if (Number.isNaN(orden) || orden < 0) return setMsg({ ok:false, text:"orden debe ser un entero ≥ 0" });

    let parsedProps: any = {};
    try {
      parsedProps = JSON.parse(propsText || "{}");
    } catch {
      return setMsg({ ok:false, text:"El JSON de props no es válido." });
    }

    if (tipo !== "carpeta") {
      const err = validatePropsClient(parsedProps);
      if (err) return setMsg({ ok:false, text:`Props inválidos: ${err}` });
    }

    start(async () => {
      const fd = new FormData();
      if (initialData?.id) fd.set("id", initialData.id);
      if (parentId !== undefined) fd.set("parent_id", parentId ?? "");
      fd.set("nombre", nombre);
      fd.set("slug", slug);
      fd.set("route", route);
      fd.set("tipo", tipo);
      fd.set("orden", String(orden));
      fd.set("activo", String(activo));
      fd.set("props", JSON.stringify(parsedProps));

      const res = await upsertModuloAction(fd);
      setMsg({ ok: res.ok, text: res.detail });

      if (res.ok && res.id) {
        const sp = new URLSearchParams(searchParams.toString());
        sp.set("edit", "false");
        router.replace(`/system/modulos/${res.id}?${sp.toString()}`);
        router.refresh();
      }
    });
  };

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      <div className={styles.grid}>
        <div>
          <label className={styles.label}>Nombre</label>
          <input className={styles.input} value={nombre} onChange={e=>setNombre(e.target.value)} disabled={readOnly}/>
        </div>
        <div>
          <label className={styles.label}>Slug</label>
          <input className={styles.input} value={slug} onChange={e=>setSlug(e.target.value)} disabled={readOnly}/>
        </div>
        <div>
          <label className={styles.label}>Tipo</label>
          <select className={styles.input} value={tipo} onChange={e=>setTipo(e.target.value)} disabled={readOnly}>
            <option value="carpeta">carpeta</option>
            <option value="tabla">tabla</option>
            <option value="subtabla">subtabla</option>
            <option value="vista">vista</option>
          </select>
        </div>
        <div>
          <label className={styles.label}>Orden</label>
          <input type="number" className={styles.input} value={orden} onChange={e=>setOrden(Number(e.target.value))} disabled={readOnly}/>
        </div>
        <div>
          <label className={styles.label}>Ruta (route)</label>
          <input className={styles.input} value={route} onChange={e=>setRoute(e.target.value)} disabled={readOnly}/>
        </div>
        <div className={styles.switchRow}>
          <label className={styles.label}>Activo</label>
          <input type="checkbox" checked={activo} onChange={e=>setActivo(e.target.checked)} disabled={readOnly}/>
        </div>
        <div>
          <label className={styles.label}>Parent ID (opcional)</label>
          <input className={styles.input} value={parentId ?? ""} onChange={e=>setParentId(e.target.value || null)} disabled={readOnly}/>
        </div>
      </div>

      <div className={styles.propsBox}>
        <label className={styles.label}>Props (JSON)</label>
        {readOnly ? (
          <pre className={styles.code}>{propsText}</pre>
        ) : (
          <textarea className={styles.textarea} rows={18} value={propsText} onChange={e=>setPropsText(e.target.value)} spellCheck={false}/>
        )}
        {!readOnly && <p className={styles.hint}>Edita db/fields/ui/permissions…</p>}
      </div>

      <div className={styles.actionsRow}>
        {readOnly ? (
          <a className={styles.btn} href="?edit=true">Editar</a>
        ) : (
          <button type="submit" disabled={pending} className={styles.btn}>
            {pending ? (mode === "create" ? "Creando..." : "Guardando...") : (mode === "create" ? "Crear módulo" : "Guardar cambios")}
          </button>
        )}
        {msg && <span className={msg.ok ? styles.msgOk : styles.msgErr}>{msg.text}</span>}
      </div>
    </form>
  );
}
