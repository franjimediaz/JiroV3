"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { upsertPdfTemplateAction, deletePdfTemplateAction } from "./actions/pdfTemplates";
import { RichTextEditor} from "@repo/ui";
import dynamic from "next/dynamic";
import "react-quill/dist/quill.snow.css";


/* ------------------------------------------------------------------ */
/* ------------------------------ TYPES ------------------------------ */
/* ------------------------------------------------------------------ */

type Mode = "view" | "edit" | "create";

type Relation = {
  key: string;
  table: string;
  fkField: string;
};

type Theme = {
  fontFamily: "inter" | "roboto" | "times" | "georgia";
  baseFontSize: number;

  textColor: string;
  mutedColor: string;
  primaryColor: string;

  pageBg: string;

  headerBg: string;
  headerTextColor: string;
  headerBorderColor: string;

  dividerColor: string;
  

  table: {
    headerBg: string;
    headerTextColor: string;
    borderColor: string;
    zebra: boolean;
    zebraBg: string;
    dense: boolean;
  };
 budgetPartidas?: {
    variants?: Record<
      string,
      {
        chapterBg?: string;
        chapterBorder?: string;
        taskMuted?: string;
        materialMuted?: string;
        totalBg?: string;

        // extras “pro” opcionales
        taskBorder?: string;
        taskBg?: string;
        taskRadius?: number;
        chapterRadius?: number;
        showTaskBox?: boolean; // si quieres tareas “en cards” o plano
      }
    >;
  };
};
type BlockStyle = {
  color?: string;
  background?: string;
  fontSize?: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
  italic?: boolean;
  padding?: number;
  borderRadius?: number; // px
  borderColor?: string;
  borderWidth?: number; // px
  borderStyle?: "solid" | "dashed" | "dotted" | "none";
};
type CardStyle = BlockStyle & {
  shadow?: "none" | "sm" | "md";
};
type LookupConfig = {
  refTable: string;        // tabla donde vive el UUID
  refLabelField: string;   // campo visible (nombre/title)
  refIdField?: string;     // normalmente "id"
  outField?: string;       // default: `${groupByField}__label`
};
type LookupSpec = {
  in: "record" | "related";
  relatedKey?: string;     // requerido si in="related"
  field: string;           // campo UUID en la fila (ej: "material")
  refTable: string;        // tabla referencia (ej: "materiales")
  refIdField?: string;     // default "id"
  refLabelField: string;   // campo label (ej: "nombre" o "title")
  outField?: string;       // default `${field}__label`
};
type BudgetPartidasVariantName = string;
type BudgetPartidasVariantOverrides = Partial<{
  chapterBg: string;
  chapterBorder: string;
  taskMuted: string;
  materialMuted: string;
  totalBg: string;

  taskBorder: string;
  taskBg: string;
  taskRadius: number;
  chapterRadius: number;
  showTaskBox: boolean;
}>;
type BudgetPartidasBlock = {
  id: string;
  type: "budgetPartidas";
  title?: string;

  mode?: "groupByTaskField";

  tareasKey: string;
  materialesKey?: string;

  groupByField: string;
  groupTitleTpl: string;

  materialesFkToTarea: string;

  tareaTitleTpl: string;
  materialLineTpl: string;

  tareaTotalField?: string;
  materialTotalField?: string;
  showSubtotals?: boolean;

  // ✅ NUEVO (opcional, safe)
  variant?: BudgetPartidasVariantName; // ej: "classic"
  variantOverrides?: BudgetPartidasVariantOverrides; // override por bloque

  // LEGACY (no tocar)
  partidasKey?: string;
  tareasFkToPartida?: string;
  partidaTitleTpl?: string;
  groupByLookup?: LookupConfig;
};
type CardsLayout = {
  cols?: number; 
  gap?: number;  // px
};

type CardBlock = {
  title?: string;
  subtitle?: string;
  style?: CardStyle;      // estilo por tarjeta
  blocks?: PdfBlock[];    // contenido dentro de la tarjeta
};

type CardsBlock =
  | {
      id: string;
      type: "cards";
      title?: string;
      layout?: CardsLayout;
      style?: BlockStyle;     // estilo del contenedor
      cardStyle?: CardStyle;  // estilo base para todas las tarjetas
      // modo estático
      cards: CardBlock[];
    }
  | {
      id: string;
      type: "cards";
      title?: string;
      layout?: CardsLayout;
      style?: BlockStyle;
      cardStyle?: CardStyle;
      // modo repeat (dinámico)
      repeat: string;         // ej: "related.contactos"
      card: CardBlock;        // plantilla de tarjeta
    };
type PdfBlock =
  | { id: string; type: "header"; title: string; subtitle?: string; style?: BlockStyle }
  | { id: string; type: "text"; value: string; variant?: "normal" | "h1" | "h2" | "muted"; style?: BlockStyle }
  | { id: string; type: "divider" }
  | BudgetPartidasBlock
  | CardsBlock
  | {
      id: string;
      type: "table";
      title?: string;
      repeat: string;
      tableStyle?: { zebra?: boolean; dense?: boolean };
      layout?: {
      widthPct?: number;                 
      align?: "left" | "center" | "right"; 
    };
      columns: { label: string; value: string; align?: "left" | "right" }[];
      rows?: Array<{
      // una entrada por columna; si es null/undefined => fallback a columns[i].value
      values: Array<string | null>;
    }>;
    };

  type Template = {
      page: { size: "A4"; margin: number };
      theme: Theme;
      blocks: PdfBlock[];
      lookups?: LookupSpec[];
  };

/* ------------------------------------------------------------------ */

/* ---------------------------- HELPERS ------------------------------ */
/* ------------------------------------------------------------------ */

const uid = () => Math.random().toString(36).slice(2);
const ReactQuill = dynamic(
  async () => {
    const mod = await import("react-quill");
    return mod.default;
  },
  { ssr: false }
);
const defaultTheme: Theme = {
  fontFamily: "inter",
  baseFontSize: 12,

  textColor: "#111827",
  mutedColor: "#6b7280",
  primaryColor: "#2563eb",

  pageBg: "#ffffff",

  headerBg: "#0f172a",
  headerTextColor: "#ffffff",
  headerBorderColor: "#e5e7eb",

  dividerColor: "#e5e7eb",

  table: {
    headerBg: "#f3f4f6",
    headerTextColor: "#111827",
    borderColor: "#e5e7eb",
    zebra: true,
    zebraBg: "#fafafa",
    dense: false,
  },
};

function ensureTemplate(raw: any): Template {
  // si viene como string (por columna text), intenta parsear
  let t = raw;
  if (typeof t === "string") {
    try { t = JSON.parse(t); } catch { t = null; }
  }

  const blocks = Array.isArray(t?.blocks) ? t.blocks : [];
  const page = t?.page && typeof t.page === "object" ? t.page : {};
  const theme = t?.theme && typeof t.theme === "object" ? t.theme : {};
  const lookups = Array.isArray(t?.lookups) ? t.lookups : []; // ✅ NUEVO

  return {
    page: {
      size: "A4",
      margin: typeof page.margin === "number" ? page.margin : 24,
    },
    theme: {
      ...defaultTheme,
      ...theme,
      table: {
        ...defaultTheme.table,
        ...(theme?.table || {}),
      },
    },
    blocks,
    lookups, // ✅ NUEVO
  };
}

function withDefaultsLookup(lk: Partial<LookupSpec>): LookupSpec {
  const field = (lk.field ?? "").trim();
  return {
    in: lk.in === "record" ? "record" : "related",
    relatedKey: lk.relatedKey,
    field,
    refTable: (lk.refTable ?? "").trim(),
    refIdField: (lk.refIdField ?? "id").trim() || "id",
    refLabelField: (lk.refLabelField ?? "").trim(),
    outField: (lk.outField ?? (field ? `${field}__label` : "")).trim() || undefined,
  };
}
function shadowToCss(sh?: "none" | "sm" | "md") {
  if (sh === "sm") return "0 1px 2px rgba(0,0,0,.08)";
  if (sh === "md") return "0 8px 20px rgba(0,0,0,.10)";
  return "none";
}

/* ------------------------------------------------------------------ */
/* ------------------------- MAIN COMPONENT -------------------------- */
/* ------------------------------------------------------------------ */

export default function PdfTemplateForm({
  initialData,
  mode,
}: {
  initialData: any;
  mode: Mode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const readOnly = mode === "view";
  const [pending, start] = useTransition();

  /* ----------------------- BASIC META ----------------------- */
  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [sourceTable, setSourceTable] = useState(initialData?.source_table ?? "");
  const [isActive, setIsActive] = useState(!!initialData?.is_active);
  const [testId, setTestId] = useState(initialData?.test_record_id ?? "");

  /* ----------------------- RELATIONS ------------------------ */
  const [relations, setRelations] = useState<Relation[]>(
    Array.isArray(initialData?.related) ? initialData.related : []
  );

  /* ----------------------- TEMPLATE ------------------------- */
  const [template, setTemplate] = useState<Template>(() => {
  const raw = initialData?.template;
  return ensureTemplate(raw);
});


  /* ----------------------- UI STATE ------------------------- */
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    template.blocks[0]?.id ?? null
  );
  const [tab, setTab] = useState<"builder" | "theme" | "preview">("builder");
  const [previewTick, setPreviewTick] = useState(0);

  const selectedBlock = useMemo(
    () => template.blocks.find((b) => b.id === selectedBlockId),
    [template.blocks, selectedBlockId]
  );

  const previewUrl =
    slug && testId
      ? `/api/pdf/preview?template=${encodeURIComponent(slug)}&id=${encodeURIComponent(
          testId
        )}&t=${previewTick}`
      : null;

  const generateTemplate =
    slug && testId
      ? `/api/pdf/generate?template=${encodeURIComponent(slug)}&id=${encodeURIComponent(
          testId
        )}&t=${previewTick}`
      : null;

  /* ------------------------------------------------------------------ */
  /* ----------------------------- ACTIONS ----------------------------- */
  /* ------------------------------------------------------------------ */

function updateTemplate(patch: Partial<Template>) {
    setTemplate((t) => ensureTemplate({ ...t, ...patch }));
}

function updateBlock<K extends PdfBlock["type"]>(
  id: string,
  type: K,
  patch: Partial<Extract<PdfBlock, { type: K }>>
) {
  setTemplate((t) => ({
    ...t,
    blocks: t.blocks.map((b) => {
      if (b.id !== id) return b;
      if (b.type !== type) return b; 
      return { ...b, ...patch } as Extract<PdfBlock, { type: K }>;
    }),
  }));
}

function addBlock(type: PdfBlock["type"]) {
  const block: PdfBlock =
    type === "header"
      ? { id: uid(), type: "header", title: "Encabezado", subtitle: "" }
      : type === "text"
      ? { id: uid(), type: "text", value: "Texto", variant: "normal" }
      : type === "divider"
      ? { id: uid(), type: "divider" }
      : type === "cards"
      ? {
          id: uid(),
          type: "cards",
          title: "Tarjetas",
          layout: { cols: 2, gap: 12 },
          cardStyle: {
            background: "#ffffff",
            borderColor: "#e5e7eb",
            borderWidth: 1,
            borderStyle: "solid",
            borderRadius: 14,
            padding: 12,
            shadow: "none",
          },
          cards: [
            {
              title: "Empresa",
              subtitle: "{{branding.nombre}}",
              style: { background: "#f8fafc" },
              blocks: [
                { id: uid(), type: "text", value: "CIF: {{branding.cif}}", variant: "muted" },
                { id: uid(), type: "text", value: "{{branding.direccion}}", variant: "normal" },
              ],
            },
            {
              title: "Cliente",
              subtitle: "{{record.cliente_nombre}}",
              blocks: [
                { id: uid(), type: "text", value: "DNI: {{record.cliente_dni}}", variant: "muted" },
                { id: uid(), type: "text", value: "{{record.cliente_direccion}}", variant: "normal" },
              ],
            },
          ],
        }
      : type === "budgetPartidas"
      ? {
          id: uid(),
          type: "budgetPartidas",
          title: "Presupuesto por partidas",
          mode: "groupByTaskField",

          // ✅ tu caso real
          tareasKey: relations[0]?.key ?? "tid",
          groupByField: "service",
          groupTitleTpl: "Partida {{groupLabel}}",

          materialesKey: relations[1]?.key ?? "materiales",
          materialesFkToTarea: "taskId",

          // ✅ usa title porque tú en tareas usas item.title
          tareaTitleTpl: "– {{item.title}}",
          materialLineTpl: "• {{item.nombre}} x{{item.cantidad}} — {{item.total}} €",

          tareaTotalField: "total",
          materialTotalField: "total",
          showSubtotals: true,
        }
      : {
          id: uid(),
          type: "table",
          title: "Tabla",
          repeat: relations[0] ? `related.${relations[0].key}` : "",
          tableStyle: { zebra: true, dense: false },
          layout: { widthPct: 100, align: "left" },
          columns: [
            { label: "Descripción", value: "{{item.descripcion}}" },
            { label: "Total", value: "{{item.total}} €", align: "right" },
          ],
        };

  setTemplate((t) => ({ ...t, blocks: [...t.blocks, block] }));
  setSelectedBlockId(block.id);
}

function deleteBlock(id: string) {
  setTemplate((t) => {
    const nextBlocks = t.blocks.filter((b) => b.id !== id);
    return { ...t, blocks: nextBlocks };
  });

  setSelectedBlockId((prev) => {
    if (prev !== id) return prev;
    const remaining = template.blocks.filter((b) => b.id !== id);
    return remaining[0]?.id ?? null;
  });
}

function moveBlockUp(id: string) {
  setTemplate((t) => {
    const idx = t.blocks.findIndex((b) => b.id === id);
    if (idx <= 0) return t; // ya está arriba

    const next = t.blocks.slice();
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];

    return { ...t, blocks: next };
  });
}

function moveBlockDown(id: string) {
  setTemplate((t) => {
    const idx = t.blocks.findIndex((b) => b.id === id);
    if (idx === -1 || idx >= t.blocks.length - 1) return t; // ya está abajo

    const next = t.blocks.slice();
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];

    return { ...t, blocks: next };
  });
}

function save() {
    start(async () => {
      const fd = new FormData();
      if (initialData?.id) fd.set("id", initialData.id);

      fd.set("name", name);
      fd.set("slug", slug);
      fd.set("source_table", sourceTable);
      fd.set("is_active", String(isActive));
      fd.set("related", JSON.stringify(relations));
      fd.set("template", JSON.stringify(template));

      const res = await upsertPdfTemplateAction(fd);
      if (res.ok) {
        setPreviewTick((x) => x + 1);
        router.refresh();
      } else {
        alert(res.detail);
      }
    });
}

  /* ------------------------------------------------------------------ */
  /* ------------------------------- UI -------------------------------- */
  /* ------------------------------------------------------------------ */

  return (
    <form className="d-flex flex-column gap-3" onSubmit={(e) => e.preventDefault()}>
      {/* HEADER */}
      <div className="d-flex justify-content-between align-items-center">
        <div>
          <h2 className="mb-0">{mode === "create" ? "Nueva plantilla PDF" : name}</h2>
          <div className="text-muted small">{readOnly ? "Vista" : "Edición"}</div>
        </div>

        <div className="d-flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
            ← Volver
          </button>

          {!readOnly && (
            <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
              Guardar
            </button>
          )}
        </div>
      </div>

      {/* META */}
      <div className="card">
        <div className="card-body row g-3">
          <div className="col-md-4">
            <label className="form-label">Nombre</label>
            <input className="form-control" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Slug</label>
            <input className="form-control" value={slug} disabled={readOnly} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Tabla origen</label>
            <input className="form-control" value={sourceTable} disabled={readOnly} onChange={(e) => setSourceTable(e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label">ID prueba</label>
            <input className="form-control" value={testId} onChange={(e) => setTestId(e.target.value)} />
          </div>
        </div>
      </div>

      {/* TABS */}
      <ul className="nav nav-tabs">
        <li className="nav-item">
          <button type="button" className={`nav-link ${tab === "builder" ? "active" : ""}`} onClick={() => setTab("builder")}>
            Constructor
          </button>
        </li>
        <li className="nav-item">
          <button type="button" className={`nav-link ${tab === "theme" ? "active" : ""}`} onClick={() => setTab("theme")}>
            Tema
          </button>
        </li>
        <li className="nav-item">
          <button type="button" className={`nav-link ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>
            Preview
          </button>
        </li>
      </ul>

      {/* BUILDER */}
      {tab === "builder" && (
        <div className="row g-3">
          <div className="col-md-4">
            <div className="card mb-4">
              <div className="card-header text-white">Bloques</div>
              <div className="list-group list-group-flush">
                {template.blocks.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    className={`list-group-item list-group-item-action ${b.id === selectedBlockId ? "active" : ""}`}
                    onClick={() => setSelectedBlockId(b.id)}
                  >
                    {b.type}
                  </button>
                ))}
              </div>
              {!readOnly && (
                <div className="card-footer d-flex flex-wrap gap-2">
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => addBlock("header")}>
                    + Header
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => addBlock("text")}>
                    + Texto
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => addBlock("divider")}>
                    + Divider
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => addBlock("table")}>
                    + Tabla
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => addBlock("budgetPartidas")}>
                      + Partidas
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => addBlock("cards")}>
                      + Tarjetas
                    </button>
                </div>
                )}
            
            </div>
            <div className="card mb-4">
                <div className="card-header d-flex justify-content-between align-items-center">
                    <div>
                    <div className="fw-semibold">Relaciones (related)</div>
                    <div className="text-muted small">
                        Define subtablas para poder usar <code>repeat: related.key</code> en tablas.
                    </div>
                    </div>

                    {!readOnly && (
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() =>
                        setRelations((r) => [
                            ...r,
                            { key: `items${r.length + 1}`, table: "", fkField: "" },
                        ])
                        }
                    >
                        + Añadir relación
                    </button>
                    )}
                </div>

                <div className="card-body">
                    {relations.length === 0 ? (
                    <div className="text-muted">
                        No hay relaciones definidas. Añade una para poder repetir tablas.
                    </div>
                    ) : (
                    <div className="d-flex flex-column gap-2">
                        {relations.map((rel, idx) => (
                        <div key={idx} className="border rounded p-2">
                            <div className="row g-2 align-items-end">
                            <div className="col-12 col-md-3">
                                <label className="form-label small mb-1">Key</label>
                                <input
                                className="form-control form-control-sm"
                                value={rel.key}
                                disabled={readOnly}
                                onChange={(e) => {
                                    const next = relations.slice();
                                    next[idx] = { ...next[idx], key: e.target.value };
                                    setRelations(next);
                                }}
                                />
                                <div className="form-text">
                                
                                </div>
                            </div>

                            <div className="col-12 col-md-5">
                                <label className="form-label small mb-1">Tabla</label>
                                <input
                                className="form-control form-control-sm"
                                value={rel.table}
                                disabled={readOnly}
                                onChange={(e) => {
                                    const next = relations.slice();
                                    next[idx] = { ...next[idx], table: e.target.value };
                                    setRelations(next);
                                }}
                                placeholder='Ej: "budget_task"'
                                />
                            </div>

                            <div className="col-12 col-md-3">
                                <label className="form-label small mb-1">FK field</label>
                                <input
                                className="form-control form-control-sm"
                                value={rel.fkField}
                                disabled={readOnly}
                                onChange={(e) => {
                                    const next = relations.slice();
                                    next[idx] = { ...next[idx], fkField: e.target.value };
                                    setRelations(next);
                                }}
                                placeholder='Ej: "presupuestoId"'
                                />
                            </div>

                            <div className="col-12 col-md-1">
                                {!readOnly && (
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger w-100"
                                    onClick={() => setRelations((r) => r.filter((_, i) => i !== idx))}
                                    title="Eliminar"
                                >
                                    ✕
                                </button>
                                )}
                            </div>

                            <div className="col-12">
                                <div className="alert alert-light small mb-0">
                                Uso en tabla: <code>repeat</code> ={" "}
                                <code>{`related.${rel.key || "key"}`}</code> ·
                                Dentro de columnas: <code>{"{{item.campo}}"}</code>
                                </div>
                            </div>
                            </div>
                        </div>
                        ))}
                    </div>
                    )}
                </div>
            </div>

            <div className="card mb-4">
              <div className="card-header d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-semibold">Lookups</div>
                  <div className="text-muted small">
                    Convierte UUIDs en labels para usarlos como <code>{"{{item.campo__label}}"}</code> o <code>{"{{record.campo__label}}"}</code>.
                  </div>
                </div>

                {!readOnly && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => {
                      const next = [...(template.lookups ?? [])];
                      next.push(
                        withDefaultsLookup({
                          in: "related",
                          relatedKey: relations?.[0]?.key ?? "",
                          field: "",
                          refTable: "",
                          refIdField: "id",
                          refLabelField: "",
                        })
                      );
                      updateTemplate({ lookups: next });
                    }}
                  >
                    + Añadir
                  </button>
                )}
              </div>

              <div className="card-body">
                {(template.lookups ?? []).length === 0 ? (
                  <div className="text-muted">No hay lookups definidos.</div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {(template.lookups ?? []).map((lk, idx) => {
                      const val = withDefaultsLookup(lk);

                      const updateLookup = (patch: Partial<LookupSpec>) => {
                        const next = [...(template.lookups ?? [])];
                        next[idx] = withDefaultsLookup({ ...val, ...patch });
                        updateTemplate({ lookups: next });
                      };

                      const removeLookup = () => {
                        const next = [...(template.lookups ?? [])];
                        next.splice(idx, 1);
                        updateTemplate({ lookups: next });
                      };

                      return (
                        <div key={idx} className="border rounded p-2">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="small fw-semibold">
                              Lookup #{idx + 1} → <code>{val.outField ?? `${val.field || "campo"}__label`}</code>
                            </div>
                            {!readOnly && (
                              <button type="button" className="btn btn-sm btn-outline-danger" onClick={removeLookup}>
                                Eliminar
                              </button>
                            )}
                          </div>

                          <div className="row g-2">
                            <div className="col-6">
                              <label className="form-label small mb-1">in</label>
                              <select
                                className="form-select form-select-sm"
                                value={val.in}
                                disabled={readOnly}
                                onChange={(e) => updateLookup({ in: e.target.value as any })}
                              >
                                <option value="related">related</option>
                                <option value="record">record</option>
                              </select>
                            </div>

                            <div className="col-6">
                              <label className="form-label small mb-1">relatedKey</label>
                              <select
                                className="form-select form-select-sm"
                                value={val.in === "related" ? (val.relatedKey ?? "") : ""}
                                disabled={readOnly || val.in !== "related"}
                                onChange={(e) => updateLookup({ relatedKey: e.target.value })}
                              >
                                <option value="">(elige)</option>
                                {relations.map((r) => (
                                  <option key={r.key} value={r.key}>
                                    {r.key}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="col-6">
                              <label className="form-label small mb-1">field (uuid)</label>
                              <input
                                className="form-control form-control-sm"
                                value={val.field}
                                disabled={readOnly}
                                onChange={(e) => updateLookup({ field: e.target.value })}
                                placeholder="Ej: material"
                              />
                            </div>

                            <div className="col-6">
                              <label className="form-label small mb-1">outField</label>
                              <input
                                className="form-control form-control-sm"
                                value={val.outField ?? ""}
                                disabled={readOnly}
                                onChange={(e) => updateLookup({ outField: e.target.value })}
                                placeholder={val.field ? `${val.field}__label` : "campo__label"}
                              />
                            </div>

                            <div className="col-6">
                              <label className="form-label small mb-1">refTable</label>
                              <input
                                className="form-control form-control-sm"
                                value={val.refTable}
                                disabled={readOnly}
                                onChange={(e) => updateLookup({ refTable: e.target.value })}
                                placeholder="Ej: materiales"
                              />
                            </div>

                            <div className="col-6">
                              <label className="form-label small mb-1">refLabelField</label>
                              <input
                                className="form-control form-control-sm"
                                value={val.refLabelField}
                                disabled={readOnly}
                                onChange={(e) => updateLookup({ refLabelField: e.target.value })}
                                placeholder="Ej: nombre"
                              />
                            </div>

                            <div className="col-12">
                              <label className="form-label small mb-1">refIdField</label>
                              <input
                                className="form-control form-control-sm"
                                value={val.refIdField ?? "id"}
                                disabled={readOnly}
                                onChange={(e) => updateLookup({ refIdField: e.target.value || "id" })}
                                placeholder="id"
                              />
                            </div>
                          </div>

                          <div className="alert alert-light small mt-2 mb-0">
                            Usa:{" "}
                            <code>
                              {val.in === "record"
                                ? `{{record.${val.outField ?? `${val.field}__label`}}}`
                                : `{{item.${val.outField ?? `${val.field}__label`}}}`}
                            </code>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>


          </div>

          <div className="col-md-8">

            {selectedBlock && selectedBlock.type === "text" && (
              <div className="card">
                <div className="card-header">Texto</div>
                <div className="card-body">
                  <RichTextEditor
                    value={selectedBlock.value || ""}
                    readOnly={readOnly}
                    onChange={(html) =>
                      updateBlock(selectedBlock.id, "text", { value: html })
                    }
                  />
                  <textarea
                      className="form-control"
                      value={selectedBlock.value || ""}
                      readOnly={readOnly}
                      rows={8}
                      onChange={(e) =>
                        updateBlock(selectedBlock.id, "text", { value: e.target.value })
                      }
                      placeholder="Escribe aquí…"
                    />
                  <div className="form-text mt-2">
                    Se guarda como HTML.
                  </div>
                </div>
              </div>
            )}
            {selectedBlock && selectedBlock.type === "header" && (
                <div className="card">
                    <div className="card-header">Header</div>
                    <div className="card-body">
                    <div className="mb-3">
                        <label className="form-label">Título</label>
                        <input
                        className="form-control"
                        value={selectedBlock.title}
                        disabled={readOnly}
                        onChange={(e) => updateBlock(selectedBlock.id, "header", { title: e.target.value })}
                        />
                    </div>

                    <div className="mb-3">
                        <label className="form-label">Subtítulo</label>
                        <input
                        className="form-control"
                        value={selectedBlock.subtitle ?? ""}
                        disabled={readOnly}
                        onChange={(e) => updateBlock(selectedBlock.id, "header", { subtitle: e.target.value })}
                        />
                    </div>

                    <div className="alert alert-info small mb-0">
                        Variables: <code>{"{{record.campo}}"}</code> · <code>{"{{now}}"}</code>
                    </div>
                    </div>
                </div>
            )}
            {selectedBlock && selectedBlock.type === "divider" && (
                <div className="card">
                    <div className="card-header">Divider</div>
                    <div className="card-body">
                    <div className="text-muted small">
                        Este bloque es una línea separadora. No tiene propiedades.
                    </div>
                    </div>
                </div>
            )}
            {selectedBlock && selectedBlock.type === "table" && (
                <div className="card">
                    <div className="card-header">Tabla</div>
                    <div className="card-body">
                    <div className="mb-3">
                        <label className="form-label">Título</label>
                        <input
                        className="form-control"
                        value={selectedBlock.title ?? ""}
                        disabled={readOnly}
                        onChange={(e) => updateBlock(selectedBlock.id, "table", { title: e.target.value })}
                        />
                    </div>

                    <div className="mb-3">
                        <label className="form-label">Repeat (lista)</label>
                        <input
                        className="form-control"
                        value={selectedBlock.repeat}
                        disabled={readOnly}
                        onChange={(e) => updateBlock(selectedBlock.id, "table", { repeat: e.target.value })}
                        />
                        <div className="form-text">
                        Ej: <code>related.tareas</code>
                        </div>
                    </div>

                    <div className="d-flex gap-3 mb-3">
                        <div className="form-check">
                        <input
                            className="form-check-input"
                            type="checkbox"
                            checked={!!selectedBlock.tableStyle?.zebra}
                            disabled={readOnly}
                            onChange={(e) =>
                            updateBlock(selectedBlock.id, "table", {
                                tableStyle: { ...(selectedBlock.tableStyle || {}), zebra: e.target.checked },
                            })
                            }
                        />
                        <label className="form-check-label">Zebra</label>
                        </div>

                        <div className="form-check">
                        <input
                            className="form-check-input"
                            type="checkbox"
                            checked={!!selectedBlock.tableStyle?.dense}
                            disabled={readOnly}
                            onChange={(e) =>
                            updateBlock(selectedBlock.id, "table", {
                                tableStyle: { ...(selectedBlock.tableStyle || {}), dense: e.target.checked },
                            })
                            }
                        />
                        <label className="form-check-label">Dense</label>
                        </div>
                    </div>
                    <div className="row g-2 mb-3">
                        <div className="col-12 col-md-6">
                          <label className="form-label">Ancho de tabla (%)</label>
                          <input
                            type="number"
                            className="form-control"
                            min={10}
                            max={100}
                            value={selectedBlock.layout?.widthPct ?? 100}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "table", {
                                layout: {
                                  ...(selectedBlock.layout || {}),
                                  widthPct: Number(e.target.value || 100),
                                },
                              })
                            }
                          />
                          <div className="form-text">Ej: 40 para totales (más estrecha)</div>
                        </div>

                        <div className="col-12 col-md-6">
                          <label className="form-label">Alineación</label>
                          <select
                            className="form-select"
                            value={selectedBlock.layout?.align ?? "left"}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "table", {
                                layout: {
                                  ...(selectedBlock.layout || {}),
                                  align: e.target.value as any,
                                },
                              })
                            }
                          >
                            <option value="left">Izquierda</option>
                            <option value="center">Centro</option>
                            <option value="right">Derecha</option>
                          </select>
                          <div className="form-text">Para totales: Derecha</div>
                          </div>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              disabled={readOnly}
                              onClick={() =>
                                updateBlock(selectedBlock.id, "table", {
                                  layout: { widthPct: 45, align: "right" },
                                  tableStyle: { ...(selectedBlock.tableStyle || {}), zebra: false, dense: true },
                                })
                              }
                            >
                              Preset totales (45% derecha)
                          </button>
                        </div>
                      


                    <div className="border rounded p-2">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="fw-semibold">Columnas</div>

                        {!readOnly && (
                            <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() =>
                                updateBlock(selectedBlock.id, "table", {
                                columns: [
                                    ...selectedBlock.columns,
                                    { label: "Nueva", value: "{{item.campo}}", align: "left" },
                                ],
                                })
                            }
                            >
                            + Columna
                            </button>
                        )}
                        </div>

                        {selectedBlock.columns.map((c, idx) => (
                        <div key={idx} className="row g-2 align-items-end mb-2">
                            <div className="col-4">
                            <label className="form-label small mb-1">Label</label>
                            <input
                                className="form-control form-control-sm"
                                value={c.label}
                                disabled={readOnly}
                                onChange={(e) => {
                                const next = selectedBlock.columns.slice();
                                next[idx] = { ...next[idx], label: e.target.value };
                                updateBlock(selectedBlock.id, "table", { columns: next });
                                }}
                            />
                            </div>

                            <div className="col-5">
                            <label className="form-label small mb-1">Value</label>
                            <input
                                className="form-control form-control-sm"
                                value={c.value}
                                disabled={readOnly}
                                onChange={(e) => {
                                const next = selectedBlock.columns.slice();
                                next[idx] = { ...next[idx], value: e.target.value };
                                updateBlock(selectedBlock.id, "table", { columns: next });
                                }}
                            />
                            </div>

                            <div className="col-2">
                            <label className="form-label small mb-1">Align</label>
                            <select
                                className="form-select form-select-sm"
                                value={c.align ?? "left"}
                                disabled={readOnly}
                                onChange={(e) => {
                                const next = selectedBlock.columns.slice();
                                next[idx] = { ...next[idx], align: e.target.value as any };
                                updateBlock(selectedBlock.id, "table", { columns: next });
                                }}
                            >
                                <option value="left">Left</option>
                                <option value="right">Right</option>
                            </select>
                            </div>

                            <div className="col-1">
                            {!readOnly && (
                                <button
                                type="button"
                                className="btn btn-sm btn-outline-danger w-100"
                                onClick={() => {
                                    const next = selectedBlock.columns.filter((_, i) => i !== idx);
                                    updateBlock(selectedBlock.id, "table", { columns: next });
                                }}
                                >
                                ✕
                                </button>
                            )}
                            </div>
                        </div>
                        ))}

                        <div className="card mt-3">
                          <div className="card-header d-flex justify-content-between align-items-center">
                            <div>
                              <div className="fw-semibold">Filas manuales (opcional)</div>
                              <div className="text-muted small">
                                Si defines filas aquí, la tabla usa estas filas. Si una celda es <code>null</code>,
                                se usa el <code>value</code> de la columna como fallback.
                              </div>
                            </div>

                            {!readOnly && (
                              <div className="d-flex gap-2">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  onClick={() =>
                                    updateBlock(selectedBlock.id, "table", { rows: undefined })
                                  }
                                  disabled={readOnly || !(selectedBlock as any).rows}
                                  title="Vuelve al modo repeat"
                                >
                                  Quitar filas manuales
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => {
                                    const colsLen = selectedBlock.columns.length;
                                    const next = [ ...((selectedBlock as any).rows ?? []) ];
                                    next.push({ values: Array.from({ length: colsLen }, () => null) });
                                    updateBlock(selectedBlock.id, "table", { rows: next } as any);
                                  }}
                                  disabled={readOnly}
                                >
                                  + Añadir fila
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="card-body">
                            {(((selectedBlock as any).rows ?? []) as any[]).length === 0 ? (
                              <div className="text-muted">
                                No hay filas manuales. La tabla usará <code>repeat</code>.
                              </div>
                            ) : (
                              <div className="d-flex flex-column gap-2">
                                {((selectedBlock as any).rows as any[]).map((row, rIdx) => {
                                  const values: Array<string | null> = Array.isArray(row?.values)
                                    ? row.values
                                    : [];

                                  const ensureLen = (arr: Array<string | null>, len: number) => {
                                    const next = arr.slice(0, len);
                                    while (next.length < len) next.push(null);
                                    return next;
                                  };

                                  const fixed = ensureLen(values, selectedBlock.columns.length);

                                  const patchRow = (nextValues: Array<string | null>) => {
                                    const nextRows = [ ...((selectedBlock as any).rows ?? []) ];
                                    nextRows[rIdx] = { values: ensureLen(nextValues, selectedBlock.columns.length) };
                                    updateBlock(selectedBlock.id, "table", { rows: nextRows } as any);
                                  };

                                  const removeRow = () => {
                                    const nextRows = [ ...((selectedBlock as any).rows ?? []) ];
                                    nextRows.splice(rIdx, 1);
                                    updateBlock(selectedBlock.id, "table", { rows: nextRows.length ? nextRows : undefined } as any);
                                  };

                                  return (
                                    <div key={rIdx} className="border rounded p-2">
                                      <div className="d-flex justify-content-between align-items-center mb-2">
                                        <div className="fw-semibold small">Fila #{rIdx + 1}</div>
                                        {!readOnly && (
                                          <button
                                            type="button"
                                            className="btn btn-sm btn-outline-danger"
                                            onClick={removeRow}
                                          >
                                            Eliminar fila
                                          </button>
                                        )}
                                      </div>

                                      <div className="row g-2">
                                        {selectedBlock.columns.map((col, cIdx) => {
                                          const v = fixed[cIdx];

                                          return (
                                            <div key={cIdx} className="col-12 col-md-6">
                                              <label className="form-label small mb-1">
                                                {col.label}{" "}
                                                <span className="text-muted">
                                                  (fallback: <code>{col.value}</code>)
                                                </span>
                                              </label>

                                              <div className="input-group">
                                                <input
                                                  className="form-control form-control-sm"
                                                  value={v ?? ""}
                                                  disabled={readOnly}
                                                  placeholder="(vacío = usar fallback)"
                                                  onChange={(e) => {
                                                    const txt = e.target.value;
                                                    const next = fixed.slice();
                                                    next[cIdx] = txt === "" ? null : txt;
                                                    patchRow(next);
                                                  }}
                                                />
                                                {!readOnly && (
                                                  <button
                                                    type="button"
                                                    className="btn btn-outline-secondary btn-sm"
                                                    title="Reset a fallback (null)"
                                                    onClick={() => {
                                                      const next = fixed.slice();
                                                      next[cIdx] = null;
                                                      patchRow(next);
                                                    }}
                                                  >
                                                    ↺
                                                  </button>
                                                )}
                                              </div>

                                              <div className="form-text">
                                                Puedes usar plantillas: <code>{"{{record.total}}"}</code>, etc.
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div className="alert alert-light small mt-3 mb-0">
                              Consejo: para totales, pon <code>repeat</code> vacío y usa filas manuales + layout (45% derecha).
                            </div>
                          </div>
                        </div>
                    </div>

                    

                    <div className="alert alert-info small mt-3 mb-0">
                        En la tabla usa <code>{"{{item.campo}}"}</code> (porque el repeat crea <code>item</code>)
                    </div>
                    </div>
                </div>
            )}
            {selectedBlock && selectedBlock.type === "budgetPartidas" && (
                    <div className="card">
                      <div className="card-header text-white">Partidas (agrupado por campo de tarea)</div>

                      <div className="card-body">
                        {/* -------- Title -------- */}
                        <div className="mb-3">
                          <label className="form-label">Título del bloque</label>
                          <input
                            className="form-control"
                            value={selectedBlock.title ?? ""}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "budgetPartidas", { title: e.target.value })
                            }
                          />
                        </div>

                        {/* -------- Related keys -------- */}
                        <div className="row g-2 mb-3">
                          <div className="col-12 col-md-6">
                            <label className="form-label">Related: Tareas</label>
                            <select
                              className="form-select"
                              value={selectedBlock.tareasKey ?? ""}  // ✅ no rompe si falta
                              disabled={readOnly}
                              onChange={(e) =>
                                updateBlock(selectedBlock.id, "budgetPartidas", { tareasKey: e.target.value })
                              }
                            >
                              {relations.map((r) => (
                                <option key={r.key} value={r.key}>
                                  {r.key} ({r.table})
                                </option>
                              ))}
                            </select>
                            <div className="form-text">Ej: tid</div>
                          </div>

                          <div className="col-12 col-md-6">
                            <label className="form-label">Related: Materiales (opcional)</label>
                            <select
                              className="form-select"
                              value={selectedBlock.materialesKey ?? ""}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateBlock(selectedBlock.id, "budgetPartidas", {
                                  materialesKey: e.target.value || undefined,
                                })
                              }
                            >
                              <option value="">(sin materiales)</option>
                              {relations.map((r) => (
                                <option key={r.key} value={r.key}>
                                  {r.key} ({r.table})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* -------- Grouping -------- */}
                        <div className="row g-2 mb-3">
                          <div className="col-12 col-md-6">
                            <label className="form-label">Agrupar por campo de tarea</label>
                            <input
                              className="form-control"
                              value={selectedBlock.groupByField ?? ""} // ✅ no rompe si falta
                              disabled={readOnly}
                              onChange={(e) =>
                                updateBlock(selectedBlock.id, "budgetPartidas", { groupByField: e.target.value })
                              }
                              placeholder="Ej: service o serviceId"
                            />
                            <div className="form-text">
                              Si es UUID, el renderer usará{" "}
                              <code>{(selectedBlock.groupByField ?? "campo") + "__label"}</code> si existe.
                            </div>
                          </div>

                          <div className="col-12 col-md-6">
                            <label className="form-label">Título de la partida</label>
                            <input
                              className="form-control"
                              value={selectedBlock.groupTitleTpl ?? ""} // ✅ no rompe si falta
                              disabled={readOnly}
                              onChange={(e) =>
                                updateBlock(selectedBlock.id, "budgetPartidas", { groupTitleTpl: e.target.value })
                              }
                              placeholder='Ej: Partida {{groupLabel}}'
                            />
                            <div className="form-text">
                              Variables: <code>{"{{groupLabel}}"}</code> y <code>{"{{groupValue}}"}</code>
                            </div>
                          </div>

                          {/* -------- Variante visual (budgetPartidas) -------- */}
                            <div className="card mt-3">
                              <div className="card-header">Estilo del bloque (variant)</div>
                              <div className="card-body">
                                {(() => {
                                  // variants disponibles: si existen en theme, úsalas; si no, fallback
                                  const variantsFromTheme = Object.keys(
                                    (template as any)?.theme?.budgetPartidas?.variants ?? {}
                                  );

                                  const variants =
                                    variantsFromTheme.length > 0
                                      ? variantsFromTheme
                                      : ["classic", "compact", "boxed", "minimal"];

                                  const currentVariant = (selectedBlock as any).variant ?? "classic";

                                  return (
                                    <>
                                      <div className="row g-2">
                                        <div className="col-12 col-md-6">
                                          <label className="form-label">Variant</label>
                                          <select
                                            className="form-select"
                                            value={currentVariant}
                                            disabled={readOnly}
                                            onChange={(e) =>
                                              updateBlock(selectedBlock.id, "budgetPartidas", {
                                                variant: e.target.value,
                                              } as any)
                                            }
                                          >
                                            {variants.map((v) => (
                                              <option key={v} value={v}>
                                                {v}
                                              </option>
                                            ))}
                                          </select>
                                          <div className="form-text">
                                            Esto solo afecta a este bloque. El renderer aplicará <code>bp-{currentVariant}</code> y variables CSS.
                                          </div>
                                        </div>

                                        <div className="col-12 col-md-6">
                                          <label className="form-label">Reset overrides</label>
                                          <button
                                            type="button"
                                            className="btn btn-outline-secondary w-100"
                                            disabled={readOnly || !(selectedBlock as any).variantOverrides}
                                            onClick={() =>
                                              updateBlock(selectedBlock.id, "budgetPartidas", {
                                                variantOverrides: undefined,
                                              } as any)
                                            }
                                          >
                                            Quitar overrides (usar preset del tema)
                                          </button>
                                          <div className="form-text">
                                            Si quitamos overrides, se usa el preset del theme.
                                          </div>
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
     
                        </div>
                        
                       {/* -------- Overrides por bloque -------- */}
                        <div className="card mt-3">
                          <div className="card-header">Overrides por bloque (opcional)</div>
                          <div className="card-body">
                            {(() => {
                              const ov = ((selectedBlock as any).variantOverrides ?? {}) as any;

                              const patchOv = (patch: any) => {
                                const next = { ...(ov || {}), ...patch };
                                // limpia undefined/"" si quieres (opcional)
                                Object.keys(next).forEach((k) => {
                                  if (next[k] === "" || next[k] === undefined) delete next[k];
                                });

                                updateBlock(selectedBlock.id, "budgetPartidas", {
                                  variantOverrides: Object.keys(next).length ? next : undefined,
                                } as any);
                              };

                              return (
                                <>
                                  <div className="row g-2">
                                    <div className="col-12 col-md-4">
                                      <label className="form-label">Chapter BG</label>
                                      <input
                                        type="color"
                                        className="form-control form-control-color"
                                        value={ov.chapterBg ?? "#f8fafc"}
                                        disabled={readOnly}
                                        onChange={(e) => patchOv({ chapterBg: e.target.value })}
                                      />
                                    </div>

                                    <div className="col-12 col-md-4">
                                      <label className="form-label">Chapter Border</label>
                                      <input
                                        type="color"
                                        className="form-control form-control-color"
                                        value={ov.chapterBorder ?? "#e5e7eb"}
                                        disabled={readOnly}
                                        onChange={(e) => patchOv({ chapterBorder: e.target.value })}
                                      />
                                    </div>

                                    <div className="col-12 col-md-4">
                                      <label className="form-label">Total BG</label>
                                      <input
                                        type="color"
                                        className="form-control form-control-color"
                                        value={ov.totalBg ?? "#f3f4f6"}
                                        disabled={readOnly}
                                        onChange={(e) => patchOv({ totalBg: e.target.value })}
                                      />
                                    </div>
                                  </div>

                                  <div className="row g-2 mt-2">
                                    <div className="col-12 col-md-4">
                                      <label className="form-label">Task BG</label>
                                      <input
                                        type="color"
                                        className="form-control form-control-color"
                                        value={ov.taskBg ?? "#ffffff"}
                                        disabled={readOnly}
                                        onChange={(e) => patchOv({ taskBg: e.target.value })}
                                      />
                                    </div>

                                    <div className="col-12 col-md-4">
                                      <label className="form-label">Task Border</label>
                                      <input
                                        type="color"
                                        className="form-control form-control-color"
                                        value={ov.taskBorder ?? "#e5e7eb"}
                                        disabled={readOnly}
                                        onChange={(e) => patchOv({ taskBorder: e.target.value })}
                                      />
                                    </div>

                                    <div className="col-12 col-md-4">
                                      <label className="form-label">Task text</label>
                                      <input
                                        type="color"
                                        className="form-control form-control-color"
                                        value={ov.taskMuted ?? "#374151"}
                                        disabled={readOnly}
                                        onChange={(e) => patchOv({ taskMuted: e.target.value })}
                                      />
                                    </div>
                                  </div>

                                  <div className="row g-2 mt-2">
                                    <div className="col-12 col-md-6">
                                      <label className="form-label">Material text</label>
                                      <input
                                        type="color"
                                        className="form-control form-control-color"
                                        value={ov.materialMuted ?? "#6b7280"}
                                        disabled={readOnly}
                                        onChange={(e) => patchOv({ materialMuted: e.target.value })}
                                      />
                                    </div>

                                    <div className="col-12 col-md-3">
                                      <label className="form-label">Task radius</label>
                                      <input
                                        type="number"
                                        className="form-control"
                                        value={typeof ov.taskRadius === "number" ? ov.taskRadius : 10}
                                        disabled={readOnly}
                                        onChange={(e) => patchOv({ taskRadius: Number(e.target.value) })}
                                        min={0}
                                      />
                                    </div>

                                    <div className="col-12 col-md-3">
                                      <label className="form-label">Chapter radius</label>
                                      <input
                                        type="number"
                                        className="form-control"
                                        value={typeof ov.chapterRadius === "number" ? ov.chapterRadius : 12}
                                        disabled={readOnly}
                                        onChange={(e) => patchOv({ chapterRadius: Number(e.target.value) })}
                                        min={0}
                                      />
                                    </div>
                                  </div>

                                  <div className="form-check mt-3">
                                    <input
                                      className="form-check-input"
                                      type="checkbox"
                                      checked={ov.showTaskBox !== false} // default true
                                      disabled={readOnly}
                                      onChange={(e) => patchOv({ showTaskBox: e.target.checked })}
                                    />
                                    <label className="form-check-label">
                                      Mostrar tareas en “caja” (card)
                                    </label>
                                  </div>

                                  <div className="alert alert-light small mt-3 mb-0">
                                    Estos overrides solo afectan a <b>este bloque</b>. Si lo dejas vacío, se usa el preset del theme.
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>         
                    {/* -------- Lookup (UUID -> label) -------- */}
                        <div className="card mt-3">
                          <div className="card-header text-white">Resolver nombre de la partida</div>
                          <div className="card-body">
                            <div className="form-check mb-3">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={!!(selectedBlock as any).groupByLookup}
                                disabled={readOnly}
                                onChange={(e) => {
                                  const checked = e.target.checked;

                                  if (checked) {
                                    const groupByField = (selectedBlock.groupByField ?? "").trim();
                                    updateBlock(selectedBlock.id, "budgetPartidas", {
                                      groupByLookup: {
                                        refTable: "",
                                        refLabelField: "",
                                        refIdField: "id",
                                        outField: groupByField ? `${groupByField}__label` : "group__label",
                                      },
                                    } as any);
                                  } else {
                                    // ✅ no toca legacy fields; solo quita lookup
                                    updateBlock(selectedBlock.id, "budgetPartidas", {
                                      groupByLookup: undefined,
                                    } as any);
                                  }
                                }}
                              />
                              <label className="form-check-label">
                                El campo de agrupación es un UUID y necesito mostrar su nombre
                              </label>
                            </div>

                            {!!(selectedBlock as any).groupByLookup && (
                              <>
                                <div className="mb-3">
                                  <label className="form-label">Tabla de referencia</label>
                                  <input
                                    className="form-control"
                                    placeholder="Ej: servicios_config"
                                    value={(selectedBlock as any).groupByLookup?.refTable ?? ""}
                                    disabled={readOnly}
                                    onChange={(e) =>
                                      updateBlock(selectedBlock.id, "budgetPartidas", {
                                        groupByLookup: {
                                          ...(selectedBlock as any).groupByLookup,
                                          refTable: e.target.value,
                                        },
                                      } as any)
                                    }
                                  />
                                  <div className="form-text">
                                    Tabla donde vive el UUID (servicios, partidas, etc.)
                                  </div>
                                </div>

                                <div className="mb-3">
                                  <label className="form-label">Campo visible (label)</label>
                                  <input
                                    className="form-control"
                                    placeholder="Ej: nombre o title"
                                    value={(selectedBlock as any).groupByLookup?.refLabelField ?? ""}
                                    disabled={readOnly}
                                    onChange={(e) =>
                                      updateBlock(selectedBlock.id, "budgetPartidas", {
                                        groupByLookup: {
                                          ...(selectedBlock as any).groupByLookup,
                                          refLabelField: e.target.value,
                                        },
                                      } as any)
                                    }
                                  />
                                  <div className="form-text">Campo que quieres mostrar en el PDF</div>
                                </div>

                                <div className="row g-2">
                                  <div className="col-12 col-md-6">
                                    <label className="form-label">Campo ID (opcional)</label>
                                    <input
                                      className="form-control"
                                      placeholder="id"
                                      value={(selectedBlock as any).groupByLookup?.refIdField ?? "id"}
                                      disabled={readOnly}
                                      onChange={(e) =>
                                        updateBlock(selectedBlock.id, "budgetPartidas", {
                                          groupByLookup: {
                                            ...(selectedBlock as any).groupByLookup,
                                            refIdField: e.target.value || "id",
                                          },
                                        } as any)
                                      }
                                    />
                                  </div>

                                  <div className="col-12 col-md-6">
                                    <label className="form-label">Campo de salida (opcional)</label>
                                    <input
                                      className="form-control"
                                      placeholder={`${(selectedBlock.groupByField ?? "campo")}__label`}
                                      value={
                                        (selectedBlock as any).groupByLookup?.outField ??
                                        `${(selectedBlock.groupByField ?? "campo")}__label`
                                      }
                                      disabled={readOnly}
                                      onChange={(e) =>
                                        updateBlock(selectedBlock.id, "budgetPartidas", {
                                          groupByLookup: {
                                            ...(selectedBlock as any).groupByLookup,
                                            outField: e.target.value,
                                          },
                                        } as any)
                                      }
                                    />
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* -------- Materials FK -------- */}
                        <div className="mb-3 mt-3">
                          <label className="form-label">FK en Materiales → Tarea</label>
                          <input
                            className="form-control"
                            value={selectedBlock.materialesFkToTarea ?? ""} // ✅ no rompe si falta
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "budgetPartidas", { materialesFkToTarea: e.target.value })
                            }
                            placeholder="Ej: taskId"
                          />
                        </div>

                        {/* -------- Templates -------- */}
                        <div className="mb-3">
                          <label className="form-label">Texto de Tarea</label>
                          <input
                            className="form-control"
                            value={selectedBlock.tareaTitleTpl ?? ""} // ✅ no rompe si falta
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "budgetPartidas", { tareaTitleTpl: e.target.value })
                            }
                            placeholder="Ej: – {{item.title}}"
                          />
                          <div className="form-text">item = tarea</div>
                        </div>

                        <div className="mb-3">
                          <label className="form-label">Línea de Material</label>
                          <input
                            className="form-control"
                            value={selectedBlock.materialLineTpl ?? ""} // ✅ no rompe si falta
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "budgetPartidas", { materialLineTpl: e.target.value })
                            }
                            placeholder="Ej: • {{item.nombre}} x{{item.cantidad}} — {{item.total}} €"
                          />
                          <div className="form-text">item = material</div>
                        </div>

                        {/* -------- Totals -------- */}
                        <div className="row g-2 mb-3">
                          <div className="col-12 col-md-6">
                            <label className="form-label">Campo total tarea (opcional)</label>
                            <input
                              className="form-control"
                              value={selectedBlock.tareaTotalField ?? ""}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateBlock(selectedBlock.id, "budgetPartidas", {
                                  tareaTotalField: e.target.value || undefined,
                                })
                              }
                              placeholder="Ej: total"
                            />
                          </div>

                          <div className="col-12 col-md-6">
                            <label className="form-label">Campo total material (opcional)</label>
                            <input
                              className="form-control"
                              value={selectedBlock.materialTotalField ?? ""}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateBlock(selectedBlock.id, "budgetPartidas", {
                                  materialTotalField: e.target.value || undefined,
                                })
                              }
                              placeholder="Ej: total"
                            />
                          </div>
                        </div>

                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            checked={!!selectedBlock.showSubtotals}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "budgetPartidas", { showSubtotals: e.target.checked })
                            }
                          />
                          <label className="form-check-label">Mostrar subtotales por partida</label>
                        </div>

                        {/* -------- Legacy info (no rompe datos previos) -------- */}
                        {((selectedBlock as any).partidasKey ||
                          (selectedBlock as any).tareasFkToPartida ||
                          (selectedBlock as any).partidaTitleTpl) && (
                          <div className="alert alert-warning mt-3 mb-0">
                            <div className="fw-semibold mb-1">Legacy detectado</div>
                            <div className="small">
                              Esta plantilla tiene campos antiguos (partidasKey / tareasFkToPartida / partidaTitleTpl).
                              No se borran, pero este editor usa el modo nuevo (groupByField + groupTitleTpl).
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
            )}
            {selectedBlock && selectedBlock.type === "cards" && (
                <div className="card">
                  <div className="card-header">Tarjetas</div>

                  <div className="card-body">
                    {/* título */}
                    <div className="mb-3">
                      <label className="form-label">Título</label>
                      <input
                        className="form-control"
                        value={selectedBlock.title ?? ""}
                        disabled={readOnly}
                        onChange={(e) => updateBlock(selectedBlock.id, "cards", { title: e.target.value } as any)}
                      />
                    </div>

                    {/* layout */}
                    <div className="row g-2 mb-3">
                      <div className="col-6">
                        <label className="form-label">Columnas</label>
                        <input
                          type="number"
                          min={1}
                          max={4}
                          className="form-control"
                          value={selectedBlock.layout?.cols ?? 2}
                          disabled={readOnly}
                          onChange={(e) =>
                            updateBlock(selectedBlock.id, "cards", {
                              layout: { ...(selectedBlock.layout || {}), cols: Number(e.target.value || 2) },
                            } as any)
                          }
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label">Gap (px)</label>
                        <input
                          type="number"
                          min={0}
                          max={40}
                          className="form-control"
                          value={selectedBlock.layout?.gap ?? 12}
                          disabled={readOnly}
                          onChange={(e) =>
                            updateBlock(selectedBlock.id, "cards", {
                              layout: { ...(selectedBlock.layout || {}), gap: Number(e.target.value || 12) },
                            } as any)
                          }
                        />
                      </div>
                    </div>

                    {/* repeat (si quieres permitir dinámico) */}
                    {"repeat" in selectedBlock && (
                      <div className="mb-3">
                        <label className="form-label">Repeat (opcional)</label>
                        <input
                          className="form-control"
                          value={selectedBlock.repeat ?? ""}
                          disabled={readOnly}
                          onChange={(e) => updateBlock(selectedBlock.id, "cards", { repeat: e.target.value } as any)}
                          placeholder='Ej: related.contactos'
                        />
                        <div className="form-text">
                          Si pones repeat, se usan tarjetas dinámicas con <code>{"{{item.campo}}"}</code>.
                        </div>
                      </div>
                    )}

                    {/* estilo base de tarjeta */}
                    <div className="border rounded p-2 mb-3">
                      <div className="fw-semibold mb-2">Estilo base de tarjeta</div>

                      <div className="row g-2">
                        <div className="col-6">
                          <label className="form-label">Fondo</label>
                          <input
                            type="color"
                            className="form-control form-control-color"
                            value={selectedBlock.cardStyle?.background ?? "#ffffff"}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "cards", {
                                cardStyle: { ...(selectedBlock.cardStyle || {}), background: e.target.value },
                              } as any)
                            }
                          />
                        </div>

                        <div className="col-6">
                          <label className="form-label">Borde</label>
                          <input
                            type="color"
                            className="form-control form-control-color"
                            value={selectedBlock.cardStyle?.borderColor ?? "#e5e7eb"}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "cards", {
                                cardStyle: { ...(selectedBlock.cardStyle || {}), borderColor: e.target.value, borderWidth: 1, borderStyle: "solid" },
                              } as any)
                            }
                          />
                        </div>

                        <div className="col-6">
                          <label className="form-label">Padding</label>
                          <input
                            type="number"
                            min={0}
                            max={40}
                            className="form-control"
                            value={selectedBlock.cardStyle?.padding ?? 12}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "cards", {
                                cardStyle: { ...(selectedBlock.cardStyle || {}), padding: Number(e.target.value || 12) },
                              } as any)
                            }
                          />
                        </div>

                        <div className="col-6">
                          <label className="form-label">Sombra</label>
                          <select
                            className="form-select"
                            value={selectedBlock.cardStyle?.shadow ?? "none"}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "cards", {
                                cardStyle: { ...(selectedBlock.cardStyle || {}), shadow: e.target.value as any },
                              } as any)
                            }
                          >
                            <option value="none">none</option>
                            <option value="sm">sm</option>
                            <option value="md">md</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* listado de tarjetas (modo estático) */}
                    {"cards" in selectedBlock && (
                      <div className="border rounded p-2">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <div className="fw-semibold">Tarjetas</div>

                          {!readOnly && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => {
                                const next = [...(selectedBlock.cards ?? [])];
                                next.push({
                                  title: "Nueva tarjeta",
                                  subtitle: "",
                                  blocks: [{ id: uid(), type: "text", value: "Contenido", variant: "normal" }],
                                });
                                updateBlock(selectedBlock.id, "cards", { cards: next } as any);
                              }}
                            >
                              + Añadir tarjeta
                            </button>
                          )}
                        </div>

                        {(selectedBlock.cards ?? []).map((c: any, idx: number) => (
                          <div key={idx} className="border rounded p-2 mb-2">
                            <div className="row g-2 align-items-end">
                              <div className="col-5">
                                <label className="form-label small mb-1">Title</label>
                                <input
                                  className="form-control form-control-sm"
                                  value={c.title ?? ""}
                                  disabled={readOnly}
                                  onChange={(e) => {
                                    const next = [...selectedBlock.cards];
                                    next[idx] = { ...next[idx], title: e.target.value };
                                    updateBlock(selectedBlock.id, "cards", { cards: next } as any);
                                  }}
                                />
                              </div>
                              <div className="col-6">
                                <label className="form-label small mb-1">Subtitle</label>
                                <input
                                  className="form-control form-control-sm"
                                  value={c.subtitle ?? ""}
                                  disabled={readOnly}
                                  onChange={(e) => {
                                    const next = [...selectedBlock.cards];
                                    next[idx] = { ...next[idx], subtitle: e.target.value };
                                    updateBlock(selectedBlock.id, "cards", { cards: next } as any);
                                  }}
                                />
                              </div>
                              <div className="col-1">
                                {!readOnly && (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger w-100"
                                    onClick={() => {
                                      const next = selectedBlock.cards.filter((_: any, i: number) => i !== idx);
                                      updateBlock(selectedBlock.id, "cards", { cards: next } as any);
                                    }}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="alert alert-light small mt-2 mb-0">
                              Dentro de esta tarjeta, mete bloques (text/table/divider/partidas).  
                              *Tip*: si quieres “solo datos” sin HTML raro, usa el textarea normal en los `text`.
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}



            




          </div>
          {!readOnly && selectedBlock && (
                <div className="mt-3 d-flex gap-2">
                    <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => moveBlockUp(selectedBlock.id)}
                    title="Subir bloque"
                    >
                    ↑
                    </button>

                    <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => moveBlockDown(selectedBlock.id)}
                    title="Bajar bloque"
                    >
                    ↓
                    </button>

                    <button
                    type="button"
                    className="btn btn-outline-danger btn-sm ms-auto"
                    onClick={() => {
                        if (confirm("¿Eliminar este bloque?")) {
                        deleteBlock(selectedBlock.id);
                        }
                    }}
                    title="Eliminar bloque"
                    >
                    🗑 Eliminar
                    </button>
                </div>
                )}

        </div>
      )}

      {/* THEME */}
      {tab === "theme" && (
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-semibold">Tema</div>
                <div className="text-muted small">
                  Cambios en vivo: guarda y refresca preview para verlos.
                </div>
              </div>

              {!readOnly && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => updateTemplate({ theme: defaultTheme })}
                >
                  Reset tema
                </button>
              )}
            </div>

            <div className="card-body">
              <div className="row g-3">
                {/* Fuente */}
                <div className="col-12 col-md-4">
                  <label className="form-label">Fuente</label>
                  <select
                    className="form-select"
                    value={template.theme.fontFamily}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({
                        theme: { ...template.theme, fontFamily: e.target.value as any },
                      })
                    }
                  >
                    <option value="inter">Inter</option>
                    <option value="roboto">Roboto</option>
                    <option value="times">Times</option>
                    <option value="georgia">Georgia</option>
                  </select>
                </div>

                {/* Base font */}
                <div className="col-12 col-md-4">
                  <label className="form-label">Tamaño base (px)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={10}
                    max={18}
                    value={template.theme.baseFontSize}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({
                        theme: { ...template.theme, baseFontSize: Number(e.target.value || 12) },
                      })
                    }
                  />
                </div>

                {/* Page margin */}
                <div className="col-12 col-md-4">
                  <label className="form-label">Margen página (px)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={10}
                    max={60}
                    value={template.page.margin}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({
                        page: { ...template.page, margin: Number(e.target.value || 24) },
                      })
                    }
                  />
                </div>

                <div className="col-12">
                  <hr />
                </div>

                {/* Colores base */}
                <div className="col-12 col-md-3">
                  <label className="form-label">Fondo página</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={template.theme.pageBg}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({ theme: { ...template.theme, pageBg: e.target.value } })
                    }
                  />
                </div>

                <div className="col-12 col-md-3">
                  <label className="form-label">Texto</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={template.theme.textColor}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({ theme: { ...template.theme, textColor: e.target.value } })
                    }
                  />
                </div>

                <div className="col-12 col-md-3">
                  <label className="form-label">Muted</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={template.theme.mutedColor}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({ theme: { ...template.theme, mutedColor: e.target.value } })
                    }
                  />
                </div>

                <div className="col-12 col-md-3">
                  <label className="form-label">Primary</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={template.theme.primaryColor}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({ theme: { ...template.theme, primaryColor: e.target.value } })
                    }
                  />
                </div>

                <div className="col-12">
                  <hr />
                </div>

                {/* Header */}
                <div className="col-12 col-md-4">
                  <label className="form-label">Header fondo</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={template.theme.headerBg}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({ theme: { ...template.theme, headerBg: e.target.value } })
                    }
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label">Header texto</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={template.theme.headerTextColor}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({ theme: { ...template.theme, headerTextColor: e.target.value } })
                    }
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label">Header borde</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={template.theme.headerBorderColor}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({ theme: { ...template.theme, headerBorderColor: e.target.value } })
                    }
                  />
                </div>

                {/* Divider */}
                <div className="col-12 col-md-4">
                  <label className="form-label">Divider color</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={template.theme.dividerColor}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({ theme: { ...template.theme, dividerColor: e.target.value } })
                    }
                  />
                </div>

                <div className="col-12">
                  <hr />
                </div>

                {/* Tabla */}
                <div className="col-12 col-md-4">
                  <label className="form-label">Tabla header bg</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={template.theme.table.headerBg}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({
                        theme: {
                          ...template.theme,
                          table: { ...template.theme.table, headerBg: e.target.value },
                        },
                      })
                    }
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label">Tabla header texto</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={template.theme.table.headerTextColor}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({
                        theme: {
                          ...template.theme,
                          table: { ...template.theme.table, headerTextColor: e.target.value },
                        },
                      })
                    }
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label">Borde tabla</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={template.theme.table.borderColor}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateTemplate({
                        theme: {
                          ...template.theme,
                          table: { ...template.theme.table, borderColor: e.target.value },
                        },
                      })
                    }
                  />
                </div>

                <div className="col-12 col-md-6 d-flex gap-4 align-items-center">
                  <div className="form-check mt-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={!!template.theme.table.zebra}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateTemplate({
                          theme: {
                            ...template.theme,
                            table: { ...template.theme.table, zebra: e.target.checked },
                          },
                        })
                      }
                    />
                    <label className="form-check-label text-dark">Zebra</label>
                  </div>

                  <div className="form-check mt-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={!!template.theme.table.dense}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateTemplate({
                          theme: {
                            ...template.theme,
                            table: { ...template.theme.table, dense: e.target.checked },
                          },
                        })
                      }
                    />
                    <label className="form-check-label text-dark">Dense</label>
                  </div>
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label">Zebra bg</label>
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={template.theme.table.zebraBg}
                    disabled={readOnly || !template.theme.table.zebra}
                    onChange={(e) =>
                      updateTemplate({
                        theme: {
                          ...template.theme,
                          table: { ...template.theme.table, zebraBg: e.target.value },
                        },
                      })
                    }
                  />
                  <div className="form-text">Solo si zebra está activo</div>
                </div>
              </div>
            </div>
          </div>
        )}


      {/* PREVIEW */}
      {tab === "preview" && (
        <div className="card">
          <div className="card-body p-0" style={{ height: 700 }}>
            {previewUrl ? (
              <iframe key={previewUrl} src={previewUrl} style={{ width: "100%", height: "100%", border: 0 }} />
            ) : (
              <div className="p-3 text-muted">Introduce slug e ID para ver preview</div>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
