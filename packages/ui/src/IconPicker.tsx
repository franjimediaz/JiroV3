"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type IconOption = {
  name: string;
  value: string; // bootstrap icon class, ej: "bi-person"
  keywords?: string[];
};

/**
 * Catálogo interno (puedes ampliarlo cuando quieras).
 * Consejo: mantén "value" como clase de Bootstrap Icons.
 */
const DEFAULT_ICON_OPTIONS: IconOption[] = [
  // 👤 Personas / Usuarios
  
  
  { name: "Usuario Plus", value: "bi-person-plus", keywords: ["usuario", "añadir", "nuevo", "add", "plus"] },
  { name: "Usuario Check", value: "bi-person-check", keywords: ["usuario", "validado", "ok", "check", "aprobado"] },
  { name: "Usuario Gear", value: "bi-person-gear", keywords: ["usuario", "ajustes", "configuración", "settings", "gear"] },
  { name: "Usuario X", value: "bi-person-x", keywords: ["usuario", "bloquear", "eliminar", "remove", "x"] },
  { name: "Usuario Lock", value: "bi-person-lock", keywords: ["usuario", "seguridad", "bloqueo", "lock", "permiso"] },
  { name: "Usuario Badge", value: "bi-person-badge", keywords: ["usuario", "credencial", "id", "badge", "tarjeta"] },
  { name: "Persona", value: "bi-person-circle", keywords: ["persona", "perfil", "avatar", "user"] },

  // 🏢 Negocio / Organización
  { name: "Empresa", value: "bi-building", keywords: ["empresa", "oficina", "negocio", "company", "building"] },
  { name: "Oficina", value: "bi-building-gear", keywords: ["oficina", "empresa", "configuración", "building", "settings"] },
  { name: "Edificio", value: "bi-buildings", keywords: ["edificios", "empresa", "organización", "buildings"] },
  { name: "Briefcase", value: "bi-briefcase", keywords: ["maletín", "trabajo", "empresa", "job", "work"] },
  { name: "Tienda", value: "bi-shop", keywords: ["tienda", "shop", "negocio", "store"] },
  { name: "Bag", value: "bi-bag", keywords: ["bolsa", "compra", "bag", "shopping"] },
  
  { name: "Carpeta", value: "bi-folder", keywords: ["carpeta", "folder", "archivo", "organizar"] },
  { name: "Carpeta Abierta", value: "bi-folder2-open", keywords: ["carpeta", "abierta", "folder", "open"] },
  { name: "Carpeta Check", value: "bi-folder-check", keywords: ["carpeta", "ok", "check", "validado"] },
  { name: "Carpeta X", value: "bi-folder-x", keywords: ["carpeta", "eliminar", "x", "remove"] },
  { name: "Archivo", value: "bi-file-earmark", keywords: ["archivo", "documento", "file", "doc"] },
  { name: "Archivos", value: "bi-files", keywords: ["archivos", "documentos", "files", "docs"] },
  { name: "Archivo PDF", value: "bi-file-earmark-pdf", keywords: ["pdf", "archivo", "documento", "file"] },
  { name: "Archivo Word", value: "bi-file-earmark-word", keywords: ["word", "doc", "archivo", "documento"] },
  { name: "Archivo Excel", value: "bi-file-earmark-excel", keywords: ["excel", "xls", "archivo", "hoja"] },
  { name: "Archivo Imagen", value: "bi-file-earmark-image", keywords: ["imagen", "foto", "archivo", "image"] },
  { name: "Archivo Texto", value: "bi-file-earmark-text", keywords: ["texto", "nota", "archivo", "text"] },
  { name: "Portapapeles", value: "bi-clipboard", keywords: ["clipboard", "portapapeles", "copiar", "pegar"] },
  { name: "Portapapeles Check", value: "bi-clipboard-check", keywords: ["clipboard", "ok", "check", "tarea"] },

  // 🧾 Datos / Tablas
  { name: "Tabla", value: "bi-table", keywords: ["tabla", "table", "datos", "grid"] },
  { name: "Lista", value: "bi-list-ul", keywords: ["lista", "list", "items", "menú"] },
  { name: "Checklist", value: "bi-list-check", keywords: ["checklist", "lista", "tareas", "check"] },
  { name: "Lista Numerada", value: "bi-list-ol", keywords: ["lista", "orden", "numerada", "ordered"] },
  { name: "Filtro", value: "bi-funnel", keywords: ["filtro", "filter", "buscar"] },
  { name: "Buscar", value: "bi-search", keywords: ["buscar", "search", "lupa"] },
  { name: "Sort", value: "bi-sort-down", keywords: ["ordenar", "sort", "desc"] },
  { name: "Gráfico", value: "bi-bar-chart", keywords: ["gráfico", "chart", "barras", "estadísticas"] },
  { name: "Gráfico Lineal", value: "bi-graph-up", keywords: ["gráfico", "línea", "line", "stats", "tendencia"] },
  { name: "Pie Chart", value: "bi-pie-chart", keywords: ["gráfico", "tarta", "pie", "porcentaje"] },
  { name: "Actividad", value: "bi-activity", keywords: ["actividad", "monitor", "status", "heartbeat"] },
  { name: "Diagrama", value: "bi-diagram-3", keywords: ["diagrama", "relaciones", "flow", "estructura"] },

  // ⚙️ Configuración / Sistema
  { name: "Configuración", value: "bi-gear", keywords: ["configuración", "ajustes", "settings", "gear"] },
  { name: "Ajustes", value: "bi-sliders", keywords: ["ajustes", "sliders", "config", "tune"] },
  
  { name: "Llave", value: "bi-key", keywords: ["llave", "key", "acceso", "token"] },
  { name: "Escudo", value: "bi-shield-lock", keywords: ["escudo", "seguridad", "lock", "shield"] },
  { name: "Escudo Check", value: "bi-shield-check", keywords: ["seguridad", "verificado", "shield", "check"] },
  { name: "Bug", value: "bi-bug", keywords: ["bug", "error", "debug"] },
  { name: "Terminal", value: "bi-terminal", keywords: ["terminal", "consola", "cli", "dev"] },
  { name: "CPU", value: "bi-cpu", keywords: ["cpu", "procesador", "hardware"] },
  { name: "Servidor", value: "bi-hdd-network", keywords: ["servidor", "network", "disco", "infra"] },
  { name: "Base de datos", value: "bi-database", keywords: ["base de datos", "database", "db", "datos"] },
  { name: "Nube", value: "bi-cloud", keywords: ["nube", "cloud", "online"] },
  { name: "Nube Upload", value: "bi-cloud-upload", keywords: ["nube", "subir", "upload", "cloud"] },
  { name: "Nube Download", value: "bi-cloud-download", keywords: ["nube", "bajar", "download", "cloud"] },
  { name: "Enlace", value: "bi-link-45deg", keywords: ["enlace", "link", "relación", "vínculo"] },
  
  { name: "Candado Abierto", value: "bi-unlock", keywords: ["unlock", "abierto", "seguridad"] },

  // 📅 Tiempo / Planificación
  { name: "Calendario", value: "bi-calendar-week", keywords: ["calendario", "agenda", "calendar", "week"] },
  { name: "Calendario Día", value: "bi-calendar-day", keywords: ["calendario", "día", "calendar"] },
  { name: "Calendario Mes", value: "bi-calendar-month", keywords: ["calendario", "mes", "calendar"] },
  { name: "Reloj", value: "bi-clock", keywords: ["reloj", "hora", "clock", "time"] },
  { name: "Alarma", value: "bi-alarm", keywords: ["alarma", "recordatorio", "alarm"] },
  { name: "Cronómetro", value: "bi-stopwatch", keywords: ["cronómetro", "tiempo", "stopwatch"] },
  { name: "Flecha Repetir", value: "bi-arrow-repeat", keywords: ["repetir", "refresh", "sync"] },

  // 💰 Finanzas
  
  { name: "Moneda", value: "bi-currency-euro", keywords: ["euro", "moneda", "currency", "precio"] },
 
  { name: "Tarjeta", value: "bi-credit-card", keywords: ["tarjeta", "pago", "credit", "card"] },
  { name: "Caja Registradora", value: "bi-cash-register", keywords: ["caja", "cobro", "tpv", "register"] },
  { name: "Porcentaje", value: "bi-percent", keywords: ["porcentaje", "%", "percent", "descuento"] },
  { name: "Billetera", value: "bi-wallet2", keywords: ["billetera", "wallet", "dinero"] },


  // ✉️ Comunicación
  { name: "Email", value: "bi-envelope", keywords: ["email", "correo", "mail", "mensaje"] },
  
  { name: "Chat Texto", value: "bi-chat-text", keywords: ["chat", "texto", "message"] },
  { name: "Teléfono", value: "bi-telephone", keywords: ["teléfono", "phone", "llamada"] },
  { name: "Enviar", value: "bi-send", keywords: ["enviar", "send", "mensaje"] },

  // 🔔 Estados / UX
  { name: "Check", value: "bi-check-circle", keywords: ["check", "ok", "confirmar", "aprobado"] },
  { name: "Error", value: "bi-x-circle", keywords: ["error", "cancelar", "x", "fallo"] },
  { name: "Info", value: "bi-info-circle", keywords: ["info", "información", "ayuda"] },
  { name: "Advertencia", value: "bi-exclamation-triangle", keywords: ["advertencia", "warning", "alerta"] },
  { name: "Pregunta", value: "bi-question-circle", keywords: ["pregunta", "help", "duda"] },
  { name: "Ojo", value: "bi-eye", keywords: ["ojo", "ver", "view", "preview"] },
  { name: "Ojo Tachado", value: "bi-eye-slash", keywords: ["ocultar", "privado", "hide", "eye"] },
  { name: "Campana", value: "bi-bell", keywords: ["notificación", "campana", "bell", "alert"] },

  // ⭐ Extras
  { name: "Estrella", value: "bi-star", keywords: ["estrella", "favorito", "star", "favorite"] },
  { name: "Corazón", value: "bi-heart", keywords: ["corazón", "like", "heart", "favorito"] },
  
  { name: "Bandera", value: "bi-flag", keywords: ["bandera", "flag", "objetivo"] },
  { name: "Etiqueta", value: "bi-tag", keywords: ["etiqueta", "tag", "label"] },
  { name: "Bookmarks", value: "bi-bookmark", keywords: ["marcador", "bookmark", "guardar"] },

  // ➕ Acciones CRUD (muy usado en tu CRM)
  { name: "Añadir", value: "bi-plus-circle", keywords: ["añadir", "nuevo", "add", "plus", "crear"] },
  { name: "Editar", value: "bi-pencil", keywords: ["editar", "edit", "modificar", "lápiz"] },
  { name: "Guardar", value: "bi-save", keywords: ["guardar", "save", "disquete"] },
  { name: "Eliminar", value: "bi-trash", keywords: ["eliminar", "delete", "trash", "borrar"] },
  { name: "Volver", value: "bi-arrow-left", keywords: ["volver", "atrás", "back", "left"] },
  { name: "Ir", value: "bi-arrow-right", keywords: ["ir", "continuar", "next", "right"] },

  // Obras

  { name: "Obra", value: "bi-cone-striped", keywords: ["obra", "construcción", "worksite", "construction", "señal"] },
  { name: "Construcción", value: "bi-hammer", keywords: ["construcción", "obra", "martillo", "hammer", "tools"] },
  { name: "Herramientas", value: "bi-tools", keywords: ["herramientas", "tools", "obra", "mantenimiento"] },
  { name: "Llave Inglesa", value: "bi-wrench", keywords: ["wrench", "llave", "mantenimiento", "reparación"] },
  { name: "Destornillador", value: "bi-screwdriver", keywords: ["destornillador", "screwdriver", "obra", "tools"] },
  { name: "Rayo", value: "bi-lightning", keywords: ["electricidad", "instalación", "rayo", "energy"] },
  { name: "Enchufe", value: "bi-plug", keywords: ["enchufe", "electricidad", "plug", "instalación"] },
  { name: "Bombilla", value: "bi-lightbulb", keywords: ["luz", "bombilla", "idea", "electricidad"] },
  { name: "Casa", value: "bi-house", keywords: ["casa", "vivienda", "home", "obra"] },
  
  { name: "Puerta", value: "bi-door-closed", keywords: ["puerta", "door", "carpintería", "obra"] },
  { name: "Ventana", value: "bi-window", keywords: ["ventana", "window", "carpintería", "obra"] },
  { name: "Ladrillos", value: "bi-bricks", keywords: ["ladrillo", "muro", "bricks", "obra"] },
  
  { name: "Cinta Métrica", value: "bi-rulers", keywords: ["cinta", "métrica", "medir", "medición"] }, // alias keyword
  
  { name: "Pintura", value: "bi-paint-bucket", keywords: ["pintura", "paint", "cubeta", "obra"] },
  { name: "Brocha", value: "bi-brush", keywords: ["brocha", "brush", "pintar", "obra"] },
  
  { name: "Gota", value: "bi-droplet", keywords: ["agua", "fontanería", "droplet", "instalación"] },
  { name: "Tubería", value: "bi-pipe", keywords: ["tubería", "pipe", "fontanería", "obra"] },
  { name: "Termómetro", value: "bi-thermometer-half", keywords: ["calefacción", "temperatura", "termómetro"] },
  { name: "Ventilación", value: "bi-wind", keywords: ["ventilación", "aire", "wind", "climatización"] },
  { name: "Herramienta Precisión", value: "bi-nut", keywords: ["tornillo", "tuerca", "nut", "obra"] },
  { name: "Casco de obra", value: "bi-person-hard-hat", keywords: ["casco", "seguridad", "obra", "hardhat"] },
  { name: "Señal", value: "bi-sign-stop", keywords: ["señal", "parar", "stop", "obra"] },
  { name: "Camión", value: "bi-truck", keywords: ["camión", "transporte", "materiales", "truck"] },
  { name: "Palé", value: "bi-box-seam", keywords: ["palé", "caja", "material", "almacén"] },
  
  { name: "Almacén", value: "bi-house-gear", keywords: ["almacén", "logística", "stock", "warehouse"] },
  { name: "Carretilla", value: "bi-cart", keywords: ["carretilla", "carrito", "materiales", "obra"] },
  { name: "Mapa/Plano", value: "bi-map", keywords: ["plano", "mapa", "map", "obra", "ubicación"] },
  { name: "Ubicación", value: "bi-geo-alt", keywords: ["ubicación", "dirección", "pin", "obra"] },
  
  { name: "Tareas", value: "bi-card-checklist", keywords: ["tareas", "checklist", "trabajos", "to-do"] },
  
  { name: "Factura", value: "bi-receipt-cutoff", keywords: ["factura", "billing", "recibo"] },
  
  { name: "Foto", value: "bi-camera", keywords: ["foto", "cámara", "evidencia", "obra"] },

  // Clinicas

   { name: "Clínica", value: "bi-hospital", keywords: ["clínica", "hospital", "salud", "medical"] },
  { name: "Cruz médica", value: "bi-plus-square", keywords: ["médico", "salud", "cruz", "medical", "plus"] },
  { name: "Botiquín", value: "bi-bandaid", keywords: ["botiquín", "curas", "bandaid", "salud"] },
  { name: "Píldora", value: "bi-capsule", keywords: ["medicación", "píldora", "capsule", "farmacia"] },
  { name: "Jeringa", value: "bi-syringe", keywords: ["jeringa", "vacuna", "inyección", "salud"] },
  { name: "Termómetro", value: "bi-thermometer", keywords: ["termómetro", "fiebre", "temperatura"] },
  { name: "Estetoscopio", value: "bi-stethoscope", keywords: ["estetoscopio", "doctor", "médico", "consulta"] },
  { name: "Cita", value: "bi-calendar2-check", keywords: ["cita", "agenda", "calendario", "appointment"] },
  { name: "Sesión", value: "bi-calendar2-event", keywords: ["sesión", "evento", "cita", "calendar"] },
  { name: "Historia clínica", value: "bi-clipboard2-data", keywords: ["historial", "historia", "clínica", "datos"] },
  { name: "Checklist clínico", value: "bi-clipboard2-check", keywords: ["checklist", "evaluación", "lista", "clínica"] },
  { name: "Informe", value: "bi-file-earmark-medical", keywords: ["informe", "médico", "documento", "reporte"] },
  
  { name: "Paciente", value: "bi-person", keywords: ["paciente", "persona", "user", "perfil"] },
  { name: "Pacientes", value: "bi-people", keywords: ["pacientes", "lista", "personas", "users"] },
  { name: "Psicología / Chat", value: "bi-chat-heart", keywords: ["psicología", "terapia", "chat", "apoyo"] },
  { name: "Conversación", value: "bi-chat-dots", keywords: ["conversación", "terapia", "chat", "mensaje"] },
  
  { name: "Confidencial", value: "bi-lock", keywords: ["confidencial", "seguro", "lock"] },
  { name: "Pago", value: "bi-cash", keywords: ["pago", "cobro", "cash", "facturación"] },
  { name: "Factura", value: "bi-receipt", keywords: ["factura", "recibo", "billing"] },
  
  
  
  
  
  
];

function useOnClickOutside(
  refs: Array<React.RefObject<HTMLElement>>,
  handler: () => void,
  when: boolean
) {
  useEffect(() => {
    if (!when) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const inside = refs.some((r) => r.current && target && r.current.contains(target));
      if (!inside) handler();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handler();
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [refs, handler, when]);
}

function clampToViewport(rect: DOMRect, popW: number, popH: number) {
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.left;
  let top = rect.bottom + 6;

  if (top + popH + margin > vh) top = rect.top - popH - 6;

  left = Math.max(margin, Math.min(left, vw - popW - margin));
  top = Math.max(margin, Math.min(top, vh - popH - margin));

  return { left, top };
}

export function IconPicker({
  value,
  onChange,
  options,
  disabled,
  allowClear = true,
  placeholder = "Seleccionar icono",
  searchPlaceholder = "Buscar icono…",
  popoverWidth = 520,
  popoverHeight = 420,
}: {
  value?: string;
  onChange: (v: string) => void;
  options?: IconOption[]; // 👈 opcional
  disabled?: boolean;
  allowClear?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  popoverWidth?: number;
  popoverHeight?: number;
}) {
  const ICONS = options && options.length ? options : DEFAULT_ICON_OPTIONS;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const anchorRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => ICONS.find((o) => o.value === value), [ICONS, value]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return ICONS;
    return ICONS.filter((o) => {
      const hay = [o.name, o.value, ...(o.keywords || [])].join(" ").toLowerCase();
      return hay.includes(s);
    });
  }, [q, ICONS]);

  const openPopover = () => {
    if (disabled) return;
    const el = anchorRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    setPos(clampToViewport(rect, popoverWidth, popoverHeight));
    setOpen(true);
    setQ("");
  };

  const closePopover = () => setOpen(false);

  useOnClickOutside([anchorRef as any, popRef as any], closePopover, open);

  useEffect(() => {
    if (!open) return;
    const onReflow = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos(clampToViewport(rect, popoverWidth, popoverHeight));
    };
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, popoverWidth, popoverHeight]);

  const popover =
    open && pos
      ? createPortal(
          <div
            ref={popRef}
            role="dialog"
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              width: popoverWidth,
              height: popoverHeight,
              background: "var(--panel, #005068)",
              border: "1px solid var(--border, rgba(0,0,0,0.12))",
              borderRadius: 14,
              boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
              zIndex: 9999,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 12px 10px",
                borderBottom: "1px solid var(--border, rgba(0,0,0,0.08))",
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border, #ddd)",
                  outline: "none",
                }}
              />

              {allowClear && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    closePopover();
                  }}
                  disabled={disabled || !value}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border, #ddd)",
                    background: "transparent",
                    cursor: disabled ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Limpiar
                </button>
              )}

              <button
                type="button"
                onClick={closePopover}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border, #ddd)",
                  background: "transparent",
                  cursor: "pointer",
                }}
                title="Cerrar"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 12, overflow: "auto" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(86px, 1fr))",
                  gap: 10,
                }}
              >
                {filtered.map((icon) => {
                  const active = icon.value === value;
                  return (
                    <button
                      key={icon.value}
                      type="button"
                      onClick={() => {
                        onChange(icon.value);
                        closePopover();
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        padding: 10,
                        borderRadius: 12,
                        border: active
                          ? "2px solid #2563eb"
                          : "1px solid var(--border, rgba(0,0,0,0.12))",
                        background: active ? "rgba(37,99,235,0.10)" : "transparent",
                        cursor: "pointer",
                        minHeight: 72,
                      }}
                      title={icon.name}
                    >
                      <span className={"bi " + icon.value} style={{ fontSize: 18 }} />
                      <span style={{ fontSize: 11, opacity: 0.9, textAlign: "center", lineHeight: 1.1 }}>
                        {icon.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {filtered.length === 0 && (
                <div style={{ padding: 14, opacity: 0.75, fontSize: 13 }}>
                  No hay resultados para “{q}”.
                </div>
              )}
            </div>

            <div
              style={{
                padding: "10px 12px",
                borderTop: "1px solid var(--border, rgba(0,0,0,0.08))",
                fontSize: 12,
                opacity: 0.85,
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>
                Seleccionado: <strong>{selected?.name || "—"}</strong>
                {selected?.value ? <span> ({selected.value})</span> : null}
              </span>
              <span>{filtered.length} iconos</span>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? closePopover() : openPopover())}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          color: "var(--text)",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid var(--border, #ddd)",
          background: disabled ? "rgba(0,0,0,0.03)" : "transparent",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {value ? (
            <span className={"bi " + value} style={{ fontSize: 18 }} />
          ) : (
            <span style={{ width: 18, height: 18, borderRadius: 6, border: "1px dashed #bbb" }} />
          )}
          <span style={{ fontSize: 14, opacity: value ? 1 : 0.7 }}>
            {selected?.name || placeholder}
          </span>
        </span>

        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ opacity: 0.7 }}>▾</span>
        </span>
      </button>

      {popover}
    </>
  );
}
