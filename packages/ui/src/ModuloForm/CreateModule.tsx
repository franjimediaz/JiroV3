"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import styles from "./modulo-detalle.module.css";

type Tipo = "carpeta" | "tabla" | "subtabla" | "vista";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function CreateModule({
  open,
  onClose,
  parentId,
  defaultTipo = "tabla",
  onSave,
  onAfterSave,
}: {
  open: boolean;
  onClose: () => void;
  parentId?: string | null;
  defaultTipo?: Tipo;
  onSave: (fd: FormData) => Promise<{ ok: boolean; detail: string; id?: string }>;
  onAfterSave?: (res: { ok: boolean; detail: string; id?: string }) => void;
}) {

  const [pending, start] = useTransition();

  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [tipo, setTipo] = useState<Tipo>(defaultTipo);
  const [route, setRoute] = useState("");
  const [activo, setActivo] = useState(true);

  // Solo para tipo tabla/subtabla/vista
  const [dbTable, setDbTable] = useState("");

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Reset al abrir/cerrar
  useEffect(() => {
    if (!open) return;
    setNombre("");
    setSlug("");
    setTipo(defaultTipo);
    setRoute("");
    setActivo(true);
    setDbTable("");
    setMsg(null);
  }, [open, defaultTipo]);

  // Auto: slug desde nombre (sin ser intrusivo)
  useEffect(() => {
    if (!open) return;
    if (!nombre) return;
    // Si el usuario ya tocó slug, no lo machaques: solo si está vacío o coincide con el slugify anterior
    setSlug((prev) => (prev ? prev : slugify(nombre)));
  }, [nombre, open]);

  // Auto: route desde slug
  useEffect(() => {
    if (!open) return;
    if (!slug) return;
    setRoute((prev) => (prev ? prev : `/${slug}`));
  }, [slug, open]);

  // Si no pones db.table manualmente, asumimos slug (pero permitimos cambiarlo)
  useEffect(() => {
    if (!open) return;
    if (tipo === "carpeta") return;
    setDbTable((prev) => (prev ? prev : slug));
  }, [tipo, slug, open]);

  const showDb = tipo !== "carpeta";

  const propsToSave = useMemo(() => {
    if (tipo === "carpeta") return {}; // carpeta no necesita db/fields
    return {
      db: { table: dbTable || slug, softDelete: false },
      fields: [],
      ui: { icon: "", color: "#2b2b2b" },
    };
  }, [tipo, dbTable, slug]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!nombre.trim()) return setMsg({ ok: false, text: "Nombre es requerido" });
    if (!slug.trim()) return setMsg({ ok: false, text: "Slug es requerido" });

    // Mini validación: slugs “raros” te van a dar dolor después
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
      return setMsg({ ok: false, text: "Slug inválido (usa minúsculas y guiones)" });
    }

    if (showDb && !(dbTable || slug).trim()) {
      return setMsg({ ok: false, text: "db.table es requerido para este tipo" });
    }

    start(async () => {
      const fd = new FormData();
      if (parentId) fd.set("parent_id", parentId);
      fd.set("nombre", nombre.trim());
      fd.set("slug", slug.trim());
      fd.set("route", route.trim());
      fd.set("tipo", tipo);
      fd.set("orden", "0");
      fd.set("activo", String(activo));
      fd.set("props", JSON.stringify(propsToSave));

      const res = await onSave(fd);
      setMsg({ ok: res.ok, text: res.detail });

      if (res.ok) {
        onClose();
        onAfterSave?.(res);
      }

    });
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        // click fuera para cerrar
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div className={styles.card} style={{ width: "min(720px, 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Crear módulo/tabla</h3>
          <button type="button" className={styles.btn} onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
          <div className={styles.grid}>
            <div>
              <label className={styles.label}>Nombre</label>
              <input
                className={styles.input}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Obras"
              />
            </div>

            <div>
              <label className={styles.label}>Slug</label>
              <input
                className={styles.input}
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="ej: obras"
              />
            </div>

            <div>
              <label className={styles.label}>Tipo</label>
              <select
                className={styles.input}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as Tipo)}
              >
                <option value="carpeta">carpeta</option>
                <option value="tabla">tabla</option>
                <option value="subtabla">subtabla</option>
                <option value="vista">vista</option>
              </select>
            </div>

            <div>
              <label className={styles.label}>Route</label>
              <input
                className={styles.input}
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="/obras"
              />
            </div>

            {showDb && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label className={styles.label}>db.table</label>
                <input
                  className={styles.input}
                  value={dbTable}
                  onChange={(e) => setDbTable(e.target.value)}
                  placeholder="Ej: obras"
                />
                <div className={styles.hint}>
                  Si no sabes qué poner, normalmente coincide con el slug.
                </div>
              </div>
            )}

            <div className={styles.switchRow}>
              <label className={styles.label}>Activo</label>
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
              />
            </div>
          </div>

          <div className={styles.actionsRow} style={{ marginTop: 12 }}>
            <button type="button" className={styles.btn} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className={styles.btn} disabled={pending}>
              {pending ? "Creando..." : "Crear"}
            </button>
            {msg && <span className={msg.ok ? styles.msgOk : styles.msgErr}>{msg.text}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
