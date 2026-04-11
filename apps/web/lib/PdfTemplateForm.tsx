"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { upsertPdfTemplateAction } from "./actions/pdfTemplates";
import { RichTextEditor} from "@repo/ui";



/* ------------------------------------------------------------------ */
/* ------------------------------ TYPES ------------------------------ */
/* ------------------------------------------------------------------ */

type Mode = "view" | "edit" | "create";

type Relation = {
  key: string;
  table: string;
  fkField: string;
};
type TableCatalog = {
  table: string;
  fields: string[];
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

        // extras â€œproâ€ opcionales
        taskBorder?: string;
        taskBg?: string;
        taskRadius?: number;
        chapterRadius?: number;
        showTaskBox?: boolean; // si quieres tareas â€œen cardsâ€ o plano
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

  // âœ… NUEVO (opcional, safe)
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
      // modo estí¡tico
      cards: CardBlock[];
    }
  | {
      id: string;
      type: "cards";
      title?: string;
      layout?: CardsLayout;
      style?: BlockStyle;
      cardStyle?: CardStyle;
      // modo repeat (diní¡mico)
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

type PreviewContext = Record<string, any>;
type BindingOption = {
  label: string;
  token: string;
};
type BindingGroup = {
  label: string;
  options: BindingOption[];
};

function singletonRelatedRows(ctx: PreviewContext | null | undefined) {
  const related = ctx?.related;
  if (!related || typeof related !== "object") return [];

  const relatedEntries = Object.entries(related as Record<string, unknown[]>);

  return relatedEntries
    .filter(([, rows]) => rows.length === 1 && rows[0] && typeof rows[0] === "object")
    .map(([key, rows]) => ({ key, row: rows[0] as PreviewContext }));
}

function preferredLabel(row: PreviewContext) {
  for (const key of ["name", "title", "label"]) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  }
  return undefined;
}

function lookupRelatedFallback(ctx: PreviewContext | null | undefined, field: string) {
  const singletons = singletonRelatedRows(ctx);
  const matches: any[] = [];

  for (const { key, row } of singletons) {
    if (field === key) {
      const label = preferredLabel(row);
      if (label !== undefined) matches.push(label);
      continue;
    }

    if (field.startsWith(`${key}_`)) {
      const nestedField = field.slice(key.length + 1);
      if (nestedField in row) matches.push(row[nestedField]);
      continue;
    }

    const initial = key.charAt(0);
    if (initial && field.startsWith(`${initial}_`)) {
      const nestedField = field.slice(2);
      if (nestedField in row) matches.push(row[nestedField]);
      continue;
    }

    if (field in row) matches.push(row[field]);
  }

  return matches.length === 1 ? matches[0] : undefined;
}

function getByPath(obj: any, path: string) {
  const parts = String(path).split(".");
  const direct = parts.reduce((acc: any, key: string) => (acc && key in acc ? acc[key] : undefined), obj);
  if (direct !== undefined) return direct;

  if (parts.length === 2 && (parts[0] === "record" || parts[0] === "item")) {
    return lookupRelatedFallback(obj, parts[1]);
  }

  return undefined;
}

function applyBindings(input: string, ctx: PreviewContext | null | undefined) {
  if (typeof input !== "string") return "";
  if (!ctx) return input;

  return input.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, raw) => {
    const value = getByPath(ctx, String(raw).trim());
    return value === undefined || value === null ? "" : String(value);
  });
}

function ensureTemplate(raw: any): Template {
  // si viene como string (por columna text), intenta parsear
  let t = raw;
  if (typeof t === "string") {
    try { t = JSON.parse(t); } catch { t = null; }
  }

  const blocks = Array.isArray(t?.blocks) ? t.blocks : [];
  const page = t?.page && typeof t.page === "object" ? t.page : {};
  const theme = t?.theme && typeof t.theme === "object" ? t.theme : {};
  const lookups = Array.isArray(t?.lookups) ? t.lookups : []; // âœ… NUEVO

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
    lookups, // âœ… NUEVO
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

function makeFieldBindingGroup(label: string, prefix: string, fields: string[]): BindingGroup | null {
  const clean = Array.from(new Set((fields ?? []).map((field) => String(field || "").trim()).filter(Boolean))).sort();
  if (!clean.length) return null;

  return {
    label,
    options: clean.map((field) => ({
      label: field,
      token: prefix ? `{{${prefix}.${field}}}` : `{{${field}}}`,
    })),
  };
}

function BindingTokenHelper({
  groups,
  onInsert,
  disabled,
  title = "Insertar campo",
}: {
  groups: BindingGroup[];
  onInsert: (token: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  const [selectedToken, setSelectedToken] = useState("");

  const hasOptions = groups.some((group) => group.options.length > 0);

  return (
    <div className="border rounded-3 p-2 bg-body-tertiary">
      <div className="d-flex flex-column flex-md-row gap-2 align-items-md-center">
        <div className="small fw-semibold">{title}</div>
        <div className="d-flex flex-column flex-md-row gap-2 flex-grow-1">
          <select
            className="form-select form-select-sm"
            value={selectedToken}
            disabled={disabled || !hasOptions}
            onChange={(e) => setSelectedToken(e.target.value)}
          >
            <option value="">{hasOptions ? "Selecciona una variable" : "No hay variables disponibles"}</option>
            {groups.map((group) =>
              group.options.length ? (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={`${group.label}-${option.token}`} value={option.token}>
                      {option.label} - {option.token}
                    </option>
                  ))}
                </optgroup>
              ) : null
            )}
          </select>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            disabled={disabled || !selectedToken}
            onClick={() => onInsert(selectedToken)}
          >
            Insertar
          </button>
        </div>
      </div>
      <div className="form-text mb-0">
        Usa llaves dobles como <code>{"{{record.total}}"}</code>. Si el bloque repite una relación, normalmente usarás <code>{"{{item.campo}}"}</code>.
      </div>
    </div>
  );
}

function ConfigModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
      style={{ background: "rgba(15, 23, 42, 0.45)", zIndex: 1050 }}
    >
      <div className="card shadow-lg border-0 w-100" style={{ maxWidth: 1100, maxHeight: "90vh" }}>
        <div className="card-header bg-white d-flex justify-content-between align-items-start gap-3">
          <div>
            <div className="fw-semibold">{title}</div>
            {subtitle ? <div className="small text-muted">{subtitle}</div> : null}
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="card-body overflow-auto">{children}</div>
      </div>
    </div>
  );
}
/* ------------------------------------------------------------------ */
/* ------------------------- MAIN COMPONENT -------------------------- */
/* ------------------------------------------------------------------ */

export default function PdfTemplateForm({
  initialData,
  mode,
}: {
  initialData: any & { tableCatalog?: TableCatalog[] };
  mode: Mode;
}) {
  const router = useRouter();
  const readOnly = mode === "view";
  const [pending, start] = useTransition();

  /* ----------------------- BASIC META ----------------------- */
  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [sourceTable, setSourceTable] = useState(initialData?.source_table ?? "");
  const [isActive] = useState(!!initialData?.is_active);
  const [testId, setTestId] = useState(initialData?.test_record_id ?? "");
  const tableCatalog = useMemo<TableCatalog[]>(
    () => (Array.isArray(initialData?.tableCatalog) ? initialData.tableCatalog : []),
    [initialData?.tableCatalog]
  );
  const tableOptions = useMemo(
    () => Array.from(new Set(tableCatalog.map((t) => (t.table || "").trim()).filter(Boolean))).sort(),
    [tableCatalog]
  );
  const fieldsByTable = useMemo<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {};
    for (const item of tableCatalog) {
      const t = (item?.table || "").trim();
      if (!t) continue;
      out[t] = Array.from(new Set((item.fields || []).map((f) => (f || "").trim()).filter(Boolean))).sort();
    }
    return out;
  }, [tableCatalog]);

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
  const [tab, setTab] = useState<"builder" | "theme"| "link" | "preview">("builder");
  const [previewTick, setPreviewTick] = useState(0);
  const [previewCtx, setPreviewCtx] = useState<PreviewContext | null>(null);
  const [previewCtxError, setPreviewCtxError] = useState<string | null>(null);
  const [configModal, setConfigModal] = useState<null | "related" | "lookups">(null);

  const selectedBlock = useMemo(
    () => template.blocks.find((b) => b.id === selectedBlockId),
    [template.blocks, selectedBlockId]
  );
  const sourceFields = useMemo(() => fieldsByTable[sourceTable] ?? [], [fieldsByTable, sourceTable]);
  const relationDetails = useMemo(
    () =>
      relations.map((relation) => ({
        ...relation,
        fields: fieldsByTable[relation.table] ?? [],
      })),
    [fieldsByTable, relations]
  );
  const commonBindingGroups = useMemo(() => {
    const groups: BindingGroup[] = [];

    const recordGroup = makeFieldBindingGroup(`Registro (${sourceTable || "tabla origen"})`, "record", sourceFields);
    if (recordGroup) groups.push(recordGroup);

    const pyGroup = makeFieldBindingGroup("Árbol relacionado (py)", "py", Object.keys((previewCtx as any)?.py ?? {}));
    if (pyGroup) groups.push(pyGroup);

    const brandingFields = Array.from(
      new Set([
        ...Object.keys((previewCtx as any)?.branding ?? {}),
        ...Object.keys((previewCtx as any)?.empresa ?? {}),
      ])
    );
    const brandingGroup = makeFieldBindingGroup("Branding / empresa", "branding", brandingFields);
    if (brandingGroup) groups.push(brandingGroup);

    groups.push({
      label: "Variables especiales",
      options: [
        { label: "Fecha actual", token: "{{now}}" },
      ],
    });

    return groups;
  }, [previewCtx, sourceFields, sourceTable]);

  const previewUrl =
    slug && testId
      ? `/api/pdf/preview?template=${encodeURIComponent(slug)}&id=${encodeURIComponent(
          testId
        )}&t=${previewTick}`
      : null;

  useEffect(() => {
    if (!slug || !testId) {
      setPreviewCtx(null);
      setPreviewCtxError(null);
      return;
    }

    const ac = new AbortController();

    (async () => {
      try {
        setPreviewCtxError(null);
        const res = await fetch("/api/pdf/context", {
          method: "POST",
          credentials: "include",
          signal: ac.signal,
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceTable,
            recordId: testId,
            related: relations,
            template,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "No se pudo cargar el contexto de preview");
        }
        setPreviewCtx((json?.ctx ?? null) as PreviewContext | null);
      } catch (e: any) {
        if (ac.signal.aborted) return;
        setPreviewCtx(null);
        setPreviewCtxError(e?.message || "No se pudo cargar el contexto de preview");
      }
    })();

    return () => ac.abort();
  }, [slug, testId, previewTick, sourceTable, relations, template]);

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

          // âœ… tu caso real
          tareasKey: relations[0]?.key ?? "tid",
          groupByField: "service",
          groupTitleTpl: "Partida {{groupLabel}}",

          materialesKey: relations[1]?.key ?? "materiales",
          materialesFkToTarea: "taskId",

          // Usa title porque en tareas se usa item.title
          tareaTitleTpl: "- {{item.title}}",
          materialLineTpl: "- {{item.nombre}} x{{item.cantidad}} - {{item.total}} €",

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
            { label: "Descripcion", value: "{{item.descripcion}}" },
            { label: "Total", value: "{{item.total}} €", align: "right" },
          ],
        };

  setTemplate((t) => ({ ...t, blocks: [...t.blocks, block] }));
  setSelectedBlockId(block.id);
}

function updateStaticCard(
  blockId: string,
  cards: CardBlock[],
  cardIndex: number,
  patch: Partial<CardBlock>
) {
  const next = [...cards];
  next[cardIndex] = { ...(next[cardIndex] ?? {}), ...patch };
  updateBlock(blockId, "cards", { cards: next } as any);
}

function updateStaticCardBlocks(
  blockId: string,
  cards: CardBlock[],
  cardIndex: number,
  blocks: PdfBlock[]
) {
  updateStaticCard(blockId, cards, cardIndex, { blocks });
}

function updateRepeatCardTemplate(blockId: string, card: CardBlock, patch: Partial<CardBlock>) {
  updateBlock(blockId, "cards", { card: { ...card, ...patch } } as any);
}

function plainTextPreview(value: string) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function appendBindingToken(currentValue: string | undefined, token: string) {
  const base = currentValue ?? "";
  return `${base}${base && !/\s$/.test(base) ? " " : ""}${token}`;
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
    if (idx <= 0) return t; // ya estí¡ arriba

    const next = t.blocks.slice();
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];

    return { ...t, blocks: next };
  });
}

function moveBlockDown(id: string) {
  setTemplate((t) => {
    const idx = t.blocks.findIndex((b) => b.id === id);
    if (idx === -1 || idx >= t.blocks.length - 1) return t; // ya estí¡ abajo

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
           Volver
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
            <select className="form-select" value={sourceTable} disabled={readOnly} onChange={(e) => setSourceTable(e.target.value)}>
              <option value="">Selecciona una tabla</option>
              {!tableOptions.includes(sourceTable) && sourceTable ? <option value={sourceTable}>{sourceTable}</option> : null}
              {tableOptions.map((table) => (
                <option key={table} value={table}>
                  {table}
                </option>
              ))}
            </select>
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
          <button type="button" className={`nav-link ${tab === "link" ? "active" : ""}`} onClick={() => setTab("link")}>
            Vinculaciones
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
            {!readOnly && selectedBlock && (
                <div className="mt-3 d-flex gap-2">
                    <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => moveBlockUp(selectedBlock.id)}
                    title="Subir bloque"
                    >
                   Subir
                    </button>

                    <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => moveBlockDown(selectedBlock.id)}
                    title="Bajar bloque"
                    >
                   Bajar
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
                    Eliminar
                    </button>
                </div>
          )}
          


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
                      placeholder="Escribe aquí..."
                    />
                  <div className="form-text mt-2">
                    Se guarda como HTML.
                  </div>
                  <div className="mt-3">
                    <BindingTokenHelper
                      groups={commonBindingGroups}
                      disabled={readOnly}
                      onInsert={(token) =>
                        updateBlock(selectedBlock.id, "text", {
                          value: appendBindingToken(selectedBlock.value, token),
                        })
                      }
                    />
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
                        Variables: <code>{"{{record.campo}}"}</code> <code>{"{{branding.campo}}"}</code> <code>{"{{now}}"}</code>
                    </div>
                    <div className="mt-3">
                      <BindingTokenHelper
                        groups={commonBindingGroups}
                        disabled={readOnly}
                        onInsert={(token) =>
                          updateBlock(selectedBlock.id, "header", {
                            subtitle: appendBindingToken(selectedBlock.subtitle, token),
                          })
                        }
                        title="Insertar variable en el subtítulo"
                      />
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
                        <select
                          className="form-select"
                          value={selectedBlock.repeat}
                          disabled={readOnly}
                          onChange={(e) => updateBlock(selectedBlock.id, "table", { repeat: e.target.value })}
                        >
                          <option value="">Sin repeat</option>
                          {!relationDetails.some((relation) => `related.${relation.key}` === selectedBlock.repeat) && selectedBlock.repeat ? (
                            <option value={selectedBlock.repeat}>{selectedBlock.repeat}</option>
                          ) : null}
                          {relationDetails.map((relation) => (
                            <option key={relation.key} value={`related.${relation.key}`}>
                              {`related.${relation.key}`} ({relation.table || "sin tabla"})
                            </option>
                          ))}
                        </select>
                        <div className="form-text">
                        Selecciona la colección que alimenta la tabla. Dentro de las columnas usarás <code>{"{{item.campo}}"}</code>.
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
                          <div className="form-text">Ej: 40 para totales (mí¡s estrecha)</div>
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
                            <label className="form-label small mb-1">Etiqueta</label>
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
                            <label className="form-label small mb-1">Contenido</label>
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
                            <div className="mt-2">
                              <BindingTokenHelper
                                groups={[
                                  ...commonBindingGroups,
                                  ...(selectedBlock.repeat
                                    ? [
                                        makeFieldBindingGroup(
                                          `Fila repetida (${relationDetails.find((relation) => `related.${relation.key}` === selectedBlock.repeat)?.table || "repeat"})`,
                                          "item",
                                          relationDetails.find((relation) => `related.${relation.key}` === selectedBlock.repeat)?.fields ?? []
                                        ),
                                      ].filter(Boolean) as BindingGroup[]
                                    : []),
                                ]}
                                disabled={readOnly}
                                title="Insertar variable en la columna"
                                onInsert={(token) => {
                                  const next = selectedBlock.columns.slice();
                                  next[idx] = { ...next[idx], value: appendBindingToken(c.value, token) };
                                  updateBlock(selectedBlock.id, "table", { columns: next });
                                }}
                              />
                            </div>
                            </div>

                            <div className="col-2">
                            <label className="form-label small mb-1">Alineación</label>
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
                                <option value="left">Izquierda</option>
                                <option value="right">Derecha</option>
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
                                X
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
                              Consejo: para totales, deja <code>repeat</code> vacío y usa filas manuales + layout (45% derecha).
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
                              value={selectedBlock.tareasKey ?? ""}  // âœ… no rompe si falta
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
                            <select
                              className="form-select"
                              value={selectedBlock.groupByField ?? ""} // âœ… no rompe si falta
                              disabled={readOnly}
                              onChange={(e) =>
                                updateBlock(selectedBlock.id, "budgetPartidas", { groupByField: e.target.value })
                              }
                            >
                              <option value="">Selecciona un campo</option>
                              {!((relationDetails.find((relation) => relation.key === selectedBlock.tareasKey)?.fields ?? []).includes(selectedBlock.groupByField ?? "")) &&
                              selectedBlock.groupByField ? (
                                <option value={selectedBlock.groupByField}>{selectedBlock.groupByField}</option>
                              ) : null}
                              {(relationDetails.find((relation) => relation.key === selectedBlock.tareasKey)?.fields ?? []).map((field) => (
                                <option key={field} value={field}>
                                  {field}
                                </option>
                              ))}
                            </select>
                            <div className="form-text">
                              Si es UUID, el renderer usará{" "}
                              <code>{(selectedBlock.groupByField ?? "campo") + "__label"}</code> si existe.
                            </div>
                          </div>

                          <div className="col-12 col-md-6">
                            <label className="form-label">Título de la partida</label>
                            <input
                              className="form-control"
                              value={selectedBlock.groupTitleTpl ?? ""} // âœ… no rompe si falta
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
                                  // variants disponibles: si existen en theme, íºsalas; si no, fallback
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
                                      Mostrar tareas en caja
                                    </label>
                                  </div>

                                  <div className="alert alert-light small mt-3 mb-0">
                                    Estos overrides solo afectan a <b>este bloque</b>. Si lo dejas vacío, se usa el preset del tema.
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
                                    // âœ… no toca legacy fields; solo quita lookup
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
                                  <select
                                    className="form-select"
                                    value={(selectedBlock as any).groupByLookup?.refTable ?? ""}
                                    disabled={readOnly}
                                    onChange={(e) =>
                                      updateBlock(selectedBlock.id, "budgetPartidas", {
                                        groupByLookup: {
                                          ...(selectedBlock as any).groupByLookup,
                                          refTable: e.target.value,
                                          refLabelField: "",
                                          refIdField: "id",
                                        },
                                      } as any)
                                    }
                                  >
                                    <option value="">Selecciona una tabla</option>
                                    {!tableOptions.includes((selectedBlock as any).groupByLookup?.refTable ?? "") &&
                                    (selectedBlock as any).groupByLookup?.refTable ? (
                                      <option value={(selectedBlock as any).groupByLookup?.refTable}>
                                        {(selectedBlock as any).groupByLookup?.refTable}
                                      </option>
                                    ) : null}
                                    {tableOptions.map((table) => (
                                      <option key={table} value={table}>
                                        {table}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="form-text">
                                    Tabla donde vive el UUID (servicios, partidas, etc.)
                                  </div>
                                </div>

                                <div className="mb-3">
                                  <label className="form-label">Campo visible (label)</label>
                                  <select
                                    className="form-select"
                                    value={(selectedBlock as any).groupByLookup?.refLabelField ?? ""}
                                    disabled={readOnly || !(selectedBlock as any).groupByLookup?.refTable}
                                    onChange={(e) =>
                                      updateBlock(selectedBlock.id, "budgetPartidas", {
                                        groupByLookup: {
                                          ...(selectedBlock as any).groupByLookup,
                                          refLabelField: e.target.value,
                                        },
                                      } as any)
                                    }
                                  >
                                    <option value="">Selecciona el campo a mostrar</option>
                                    {(fieldsByTable[(selectedBlock as any).groupByLookup?.refTable ?? ""] ?? []).map((field) => (
                                      <option key={field} value={field}>
                                        {field}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="form-text">Campo que quieres mostrar en el PDF</div>
                                </div>

                                <div className="row g-2">
                                  <div className="col-12 col-md-6">
                                    <label className="form-label">Campo ID (opcional)</label>
                                    <select
                                      className="form-select"
                                      value={(selectedBlock as any).groupByLookup?.refIdField ?? "id"}
                                      disabled={readOnly || !(selectedBlock as any).groupByLookup?.refTable}
                                      onChange={(e) =>
                                        updateBlock(selectedBlock.id, "budgetPartidas", {
                                          groupByLookup: {
                                            ...(selectedBlock as any).groupByLookup,
                                            refIdField: e.target.value || "id",
                                          },
                                        } as any)
                                      }
                                    >
                                      {(fieldsByTable[(selectedBlock as any).groupByLookup?.refTable ?? ""] ?? ["id"]).map((field) => (
                                        <option key={field} value={field}>
                                          {field}
                                        </option>
                                      ))}
                                    </select>
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
                          <label className="form-label">FK en materiales hacia tarea</label>
                          <select
                            className="form-select"
                            value={selectedBlock.materialesFkToTarea ?? ""} // âœ… no rompe si falta
                            disabled={readOnly || !selectedBlock.materialesKey}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "budgetPartidas", { materialesFkToTarea: e.target.value })
                            }
                          >
                            <option value="">Selecciona un campo</option>
                            {!((relationDetails.find((relation) => relation.key === selectedBlock.materialesKey)?.fields ?? []).includes(selectedBlock.materialesFkToTarea ?? "")) &&
                            selectedBlock.materialesFkToTarea ? (
                              <option value={selectedBlock.materialesFkToTarea}>{selectedBlock.materialesFkToTarea}</option>
                            ) : null}
                            {(relationDetails.find((relation) => relation.key === selectedBlock.materialesKey)?.fields ?? []).map((field) => (
                              <option key={field} value={field}>
                                {field}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* -------- Templates -------- */}
                        <div className="mb-3">
                          <label className="form-label">Texto de Tarea</label>
                          <input
                            className="form-control"
                            value={selectedBlock.tareaTitleTpl ?? ""} // âœ… no rompe si falta
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "budgetPartidas", { tareaTitleTpl: e.target.value })
                            }
                            placeholder="Ej: - {{item.title}}"
                          />
                          <div className="form-text">item = tarea</div>
                          <div className="mt-2">
                            <BindingTokenHelper
                              groups={[
                                ...(makeFieldBindingGroup(
                                  `Campos de tarea (${relationDetails.find((relation) => relation.key === selectedBlock.tareasKey)?.table || "tareas"})`,
                                  "item",
                                  relationDetails.find((relation) => relation.key === selectedBlock.tareasKey)?.fields ?? []
                                )
                                  ? [
                                      makeFieldBindingGroup(
                                        `Campos de tarea (${relationDetails.find((relation) => relation.key === selectedBlock.tareasKey)?.table || "tareas"})`,
                                        "item",
                                        relationDetails.find((relation) => relation.key === selectedBlock.tareasKey)?.fields ?? []
                                      )!,
                                    ]
                                  : []),
                              ]}
                              disabled={readOnly}
                              title="Insertar campo de tarea"
                              onInsert={(token) =>
                                updateBlock(selectedBlock.id, "budgetPartidas", {
                                  tareaTitleTpl: appendBindingToken(selectedBlock.tareaTitleTpl, token),
                                })
                              }
                            />
                          </div>
                        </div>

                        <div className="mb-3">
                          <label className="form-label">Linea de Material</label>
                          <input
                            className="form-control"
                            value={selectedBlock.materialLineTpl ?? ""} // âœ… no rompe si falta
                            disabled={readOnly}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, "budgetPartidas", { materialLineTpl: e.target.value })
                            }
                            placeholder="Ej: - {{item.nombre}} x{{item.cantidad}} - {{item.total}} €"
                          />
                          <div className="form-text">item = material</div>
                          <div className="mt-2">
                            <BindingTokenHelper
                              groups={[
                                ...(makeFieldBindingGroup(
                                  `Campos de material (${relationDetails.find((relation) => relation.key === selectedBlock.materialesKey)?.table || "materiales"})`,
                                  "item",
                                  relationDetails.find((relation) => relation.key === selectedBlock.materialesKey)?.fields ?? []
                                )
                                  ? [
                                      makeFieldBindingGroup(
                                        `Campos de material (${relationDetails.find((relation) => relation.key === selectedBlock.materialesKey)?.table || "materiales"})`,
                                        "item",
                                        relationDetails.find((relation) => relation.key === selectedBlock.materialesKey)?.fields ?? []
                                      )!,
                                    ]
                                  : []),
                              ]}
                              disabled={readOnly}
                              title="Insertar campo de material"
                              onInsert={(token) =>
                                updateBlock(selectedBlock.id, "budgetPartidas", {
                                  materialLineTpl: appendBindingToken(selectedBlock.materialLineTpl, token),
                                })
                              }
                            />
                          </div>
                        </div>

                        {/* -------- Totals -------- */}
                        <div className="row g-2 mb-3">
                          <div className="col-12 col-md-6">
                            <label className="form-label">Campo total tarea (opcional)</label>
                            <select
                              className="form-select"
                              value={selectedBlock.tareaTotalField ?? ""}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateBlock(selectedBlock.id, "budgetPartidas", {
                                  tareaTotalField: e.target.value || undefined,
                                })
                              }
                            >
                              <option value="">Sin total de tarea</option>
                              {(relationDetails.find((relation) => relation.key === selectedBlock.tareasKey)?.fields ?? []).map((field) => (
                                <option key={field} value={field}>
                                  {field}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-12 col-md-6">
                            <label className="form-label">Campo total material (opcional)</label>
                            <select
                              className="form-select"
                              value={selectedBlock.materialTotalField ?? ""}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateBlock(selectedBlock.id, "budgetPartidas", {
                                  materialTotalField: e.target.value || undefined,
                                })
                              }
                            >
                              <option value="">Sin total de material</option>
                              {(relationDetails.find((relation) => relation.key === selectedBlock.materialesKey)?.fields ?? []).map((field) => (
                                <option key={field} value={field}>
                                  {field}
                                </option>
                              ))}
                            </select>
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
                    {!testId && (
                      <div className="alert alert-warning small">
                        Define un <b>ID prueba</b> para resolver variables como <code>{"{{record.c_name}}"}</code> en el constructor.
                      </div>
                    )}
                    {previewCtxError && (
                      <div className="alert alert-danger small">
                        No se pudo cargar el contexto de prueba: {previewCtxError}
                      </div>
                    )}
                    {previewCtx && (
                      <details className="mb-3">
                        <summary className="small fw-semibold" style={{ cursor: "pointer" }}>
                          Debug runtime context
                        </summary>
                        <div className="border rounded p-2 mt-2 bg-light">
                          <div className="small text-muted mb-2">
                            related keys: {Object.keys((previewCtx as any).related ?? {}).join(", ") || "(ninguna)"}
                          </div>
                          <div className="row g-2">
                            <div className="col-12 col-md-6">
                              <label className="form-label small mb-1">record</label>
                              <textarea
                                className="form-control form-control-sm font-monospace"
                                rows={12}
                                readOnly
                                value={prettyJson((previewCtx as any).record)}
                              />
                            </div>
                            <div className="col-12 col-md-6">
                              <label className="form-label small mb-1">singleton related rows</label>
                              <textarea
                                className="form-control form-control-sm font-monospace"
                                rows={12}
                                readOnly
                                value={prettyJson(
                                  singletonRelatedRows(previewCtx).reduce((acc, item) => {
                                    acc[item.key] = item.row;
                                    return acc;
                                  }, {} as Record<string, unknown>)
                                )}
                              />
                            </div>
                            <div className="col-12">
                              <label className="form-label small mb-1">raw related</label>
                              <textarea
                                className="form-control form-control-sm font-monospace"
                                rows={10}
                                readOnly
                                value={prettyJson((previewCtx as any).related)}
                              />
                            </div>
                          </div>
                        </div>
                      </details>
                    )}
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
                        <select
                          className="form-select"
                          value={selectedBlock.repeat ?? ""}
                          disabled={readOnly}
                          onChange={(e) => updateBlock(selectedBlock.id, "cards", { repeat: e.target.value } as any)}
                        >
                          <option value="">Sin repeat</option>
                          {!relationDetails.some((relation) => `related.${relation.key}` === (selectedBlock.repeat ?? "")) &&
                          selectedBlock.repeat ? (
                            <option value={selectedBlock.repeat}>{selectedBlock.repeat}</option>
                          ) : null}
                          {relationDetails.map((relation) => (
                            <option key={relation.key} value={`related.${relation.key}`}>
                              {`related.${relation.key}`} ({relation.table || "sin tabla"})
                            </option>
                          ))}
                        </select>
                        <div className="form-text">
                          Si activas repeat, se usan tarjetas dinámicas con <code>{"{{item.campo}}"}</code>.
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
                                <div className="form-text">
                                  Resuelto: <span className="text-dark">{applyBindings(c.title ?? "", previewCtx) || "(vacío)"}</span>
                                </div>
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
                                <div className="form-text">
                                  Resuelto: <span className="text-dark">{applyBindings(c.subtitle ?? "", previewCtx) || "(vacío)"}</span>
                                </div>
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
                                    X
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="border rounded p-2 mt-2 bg-light-subtle">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <div className="fw-semibold small mb-0">Contenido de la tarjeta</div>
                                {!readOnly && (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() => {
                                      const blocks = Array.isArray(c.blocks) ? c.blocks : [];
                                      updateStaticCardBlocks(selectedBlock.id, selectedBlock.cards ?? [], idx, [
                                        ...blocks,
                                        { id: uid(), type: "text", value: "Contenido", variant: "normal" },
                                      ]);
                                    }}
                                  >
                                    + Texto
                                  </button>
                                )}
                              </div>

                              {Array.isArray(c.blocks) && c.blocks.length ? (
                                <div className="d-flex flex-column gap-2">
                                  {c.blocks.map((inner: any, innerIdx: number) => {
                                    const innerBlocks = Array.isArray(c.blocks) ? c.blocks : [];
                                    const updateInner = (patch: any) => {
                                      const next = [...innerBlocks];
                                      next[innerIdx] = { ...next[innerIdx], ...patch };
                                      updateStaticCardBlocks(selectedBlock.id, selectedBlock.cards ?? [], idx, next);
                                    };

                                    const removeInner = () => {
                                      const next = innerBlocks.filter((_: any, i: number) => i !== innerIdx);
                                      updateStaticCardBlocks(selectedBlock.id, selectedBlock.cards ?? [], idx, next);
                                    };

                                    return (
                                      <div key={inner.id ?? innerIdx} className="border rounded p-2 bg-white">
                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                          <span className="badge text-bg-secondary">{inner.type}</span>
                                          {!readOnly && (
                                            <button
                                              type="button"
                                              className="btn btn-sm btn-outline-danger"
                                              onClick={removeInner}
                                            >
                                              Eliminar
                                            </button>
                                          )}
                                        </div>

                                        {inner.type === "text" ? (
                                          <>
                                            <textarea
                                              className="form-control form-control-sm"
                                              rows={3}
                                              value={inner.value ?? ""}
                                              readOnly={readOnly}
                                              onChange={(e) => updateInner({ value: e.target.value })}
                                            />
                                            <div className="form-text">
                                              Preview: <span className="text-dark">{plainTextPreview(applyBindings(inner.value ?? "", previewCtx)) || "(vacío)"}</span>
                                            </div>
                                          </>
                                        ) : inner.type === "divider" ? (
                                          <div className="small text-muted">Línea divisoria</div>
                                        ) : inner.type === "table" ? (
                                          <div className="small text-muted">
                                            Tabla: {inner.title || "(sin título)"}  columnas {(inner.columns ?? []).length}
                                          </div>
                                        ) : inner.type === "budgetPartidas" ? (
                                          <div className="small text-muted">
                                            Partidas: {inner.title || "(sin título)"}
                                          </div>
                                        ) : inner.type === "header" ? (
                                          <div className="small text-muted">
                                            Header: {inner.title || "(sin título)"}
                                          </div>
                                        ) : (
                                          <div className="small text-muted">Bloque interno configurado</div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="small text-muted">Sin contenido dentro de la tarjeta.</div>
                              )}

                              <div className="form-text mt-2 mb-0">
                                Los bloques internos ya se ven aquí; los de tipo <code>text</code> también se pueden editar directamente.
                              </div>
                            </div>

                            <div className="alert alert-light small mt-2 mb-0">
                              Dentro de esta tarjeta mete bloques como text, table, divider o partidas.
                              Tip: si quieres solo datos sin HTML raro, usa el textarea normal en los bloques `text`.
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {"card" in selectedBlock && (
                      <div className="border rounded p-2 mt-3">
                        <div className="fw-semibold mb-2">Plantilla de tarjeta dinámica</div>
                        <div className="row g-2 align-items-end">
                          <div className="col-6">
                            <label className="form-label small mb-1">Título</label>
                            <input
                              className="form-control form-control-sm"
                              value={selectedBlock.card?.title ?? ""}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateRepeatCardTemplate(selectedBlock.id, selectedBlock.card, { title: e.target.value })
                              }
                            />
                            <div className="form-text">
                              Resuelto: <span className="text-dark">{applyBindings(selectedBlock.card?.title ?? "", {
                                ...(previewCtx ?? {}),
                                item:
                                  (typeof selectedBlock.repeat === "string" &&
                                  Array.isArray(getByPath(previewCtx, selectedBlock.repeat)))
                                    ? getByPath(previewCtx, selectedBlock.repeat)?.[0]
                                    : undefined,
                              }) || "(vacío)"}</span>
                            </div>
                          </div>
                          <div className="col-6">
                            <label className="form-label small mb-1">Subtítulo</label>
                            <input
                              className="form-control form-control-sm"
                              value={selectedBlock.card?.subtitle ?? ""}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateRepeatCardTemplate(selectedBlock.id, selectedBlock.card, { subtitle: e.target.value })
                              }
                            />
                            <div className="form-text">
                              Resuelto: <span className="text-dark">{applyBindings(selectedBlock.card?.subtitle ?? "", {
                                ...(previewCtx ?? {}),
                                item:
                                  (typeof selectedBlock.repeat === "string" &&
                                  Array.isArray(getByPath(previewCtx, selectedBlock.repeat)))
                                    ? getByPath(previewCtx, selectedBlock.repeat)?.[0]
                                    : undefined,
                              }) || "(vacío)"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="border rounded p-2 mt-2 bg-light-subtle">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="fw-semibold small mb-0">Contenido de la plantilla</div>
                            {!readOnly && (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() =>
                                  updateRepeatCardTemplate(selectedBlock.id, selectedBlock.card, {
                                    blocks: [
                                      ...(selectedBlock.card?.blocks ?? []),
                                      { id: uid(), type: "text", value: "Contenido {{item.campo}}", variant: "normal" },
                                    ],
                                  })
                                }
                              >
                                + Texto
                              </button>
                            )}
                          </div>

                          {Array.isArray(selectedBlock.card?.blocks) && selectedBlock.card.blocks.length ? (
                            <div className="d-flex flex-column gap-2">
                              {selectedBlock.card.blocks.map((inner: any, innerIdx: number) => {
                                const innerBlocks = Array.isArray(selectedBlock.card?.blocks) ? selectedBlock.card.blocks : [];
                                const updateInner = (patch: any) => {
                                  const next = [...innerBlocks];
                                  next[innerIdx] = { ...next[innerIdx], ...patch };
                                  updateRepeatCardTemplate(selectedBlock.id, selectedBlock.card, { blocks: next });
                                };

                                const removeInner = () => {
                                  const next = innerBlocks.filter((_: any, i: number) => i !== innerIdx);
                                  updateRepeatCardTemplate(selectedBlock.id, selectedBlock.card, { blocks: next });
                                };

                                return (
                                  <div key={inner.id ?? innerIdx} className="border rounded p-2 bg-white">
                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                      <span className="badge text-bg-secondary">{inner.type}</span>
                                      {!readOnly && (
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-danger"
                                          onClick={removeInner}
                                        >
                                          Eliminar
                                        </button>
                                      )}
                                    </div>
                                    {inner.type === "text" ? (
                                      <>
                                        <textarea
                                          className="form-control form-control-sm"
                                          rows={3}
                                          value={inner.value ?? ""}
                                          readOnly={readOnly}
                                          onChange={(e) => updateInner({ value: e.target.value })}
                                        />
                                        <div className="form-text">
                                          <span className="text-dark">{plainTextPreview(applyBindings(inner.value ?? "", {
                                            ...(previewCtx ?? {}),
                                            item:
                                              (typeof selectedBlock.repeat === "string" &&
                                              Array.isArray(getByPath(previewCtx, selectedBlock.repeat)))
                                                ? getByPath(previewCtx, selectedBlock.repeat)?.[0]
                                                : undefined,
                                          })) || "(vacío)"}</span>
                                        </div>
                                      </>
                                    ) : (
                                      <div className="small text-muted">Bloque interno configurado</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="small text-muted">Sin contenido en la plantilla dinámica.</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            

            




          </div>
          

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
                  <label className="form-label">Margen de página (px)</label>
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
                  <label className="form-label">Fondo de página</label>
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
      {/* LINK */}
        {tab === "link" && (
          <div className="card">
            <div className="card mb-4 border-0 shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                  <div>
                    <div className="fw-semibold">Relaciones</div>
                    <div className="text-muted small">
                      Configura las colecciones que luego podrás usar como <code>related.key</code> en tablas, tarjetas y bloques repetidos.
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setConfigModal("related")}>
                    Configurar
                  </button>
                </div>

                {relationDetails.length === 0 ? (
                  <div className="text-muted small">No hay relaciones definidas todavía.</div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {relationDetails.map((relation) => (
                      <div key={`${relation.key}-${relation.table}-${relation.fkField}`} className="border rounded-3 p-3 bg-body-tertiary">
                        <div className="d-flex justify-content-between align-items-center gap-2">
                          <div className="fw-semibold">
                            <code>{relation.key || "sin-key"}</code>
                          </div>
                          <span className="badge text-bg-light border">{relation.table || "sin tabla"}</span>
                        </div>
                        <div className="small text-muted mt-2">
                          FK: <code>{relation.fkField || "sin campo"}</code>
                        </div>
                        <div className="small mt-2">
                          Repite con <code>{`related.${relation.key || "key"}`}</code> y renderiza columnas con <code>{"{{item.campo}}"}</code>.
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card mb-4 border-0 shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                  <div>
                    <div className="fw-semibold">Lookups</div>
                    <div className="text-muted small">
                      Convierte UUIDs en etiquetas para usar valores como <code>{"{{record.campo__label}}"}</code> o <code>{"{{item.campo__label}}"}</code>.
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setConfigModal("lookups")}>
                    Configurar
                  </button>
                </div>

                {(template.lookups ?? []).length === 0 ? (
                  <div className="text-muted small">No hay lookups definidos.</div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {(template.lookups ?? []).map((lookup, idx) => {
                      const val = withDefaultsLookup(lookup);
                      const scopeLabel = val.in === "record" ? "Registro principal" : `Relacionado: ${val.relatedKey || "sin key"}`;

                      return (
                        <div key={`${val.in}-${val.relatedKey}-${val.field}-${idx}`} className="border rounded-3 p-3 bg-body-tertiary">
                          <div className="fw-semibold">Lookup #{idx + 1}</div>
                          <div className="small text-muted mt-1">{scopeLabel}</div>
                          <div className="small mt-2">
                            <code>{val.field || "campo_uuid"}</code> → <code>{val.outField || `${val.field || "campo"}__label`}</code>
                          </div>
                          <div className="small text-muted mt-1">
                            Referencia: <code>{val.refTable || "tabla"}</code> / <code>{val.refLabelField || "campo_label"}</code>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="card mb-4 border-0 shadow-sm">
              <div className="card-body">
                <div className="fw-semibold mb-2">Ayuda para variables</div>
                <div className="small text-muted mb-3">
                  Las líneas de texto se renderizan con llaves dobles. Usa <code>{"{{record.campo}}"}</code> para el registro principal y <code>{"{{item.campo}}"}</code> dentro de bloques con repeat.
                </div>
                <BindingTokenHelper
                  groups={commonBindingGroups}
                  disabled={readOnly}
                  title="Constructor rápido de variables"
                  onInsert={async (token) => {
                    try {
                      await navigator.clipboard.writeText(token);
                    } catch {
                      // noop
                    }
                  }}
                />
                <div className="form-text">
                  El botón copia la variable para pegarla donde quieras. Además, en los editores de texto más importantes verás un insertador contextual.
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

      {configModal === "related" && (
        <ConfigModal
          title="Configurar relaciones"
          subtitle="Cada relación define una colección disponible como related.key para tablas, tarjetas y bloques repetidos."
          onClose={() => setConfigModal(null)}
        >
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="small text-muted">
              Ejemplo de uso: <code>repeat = related.lineas</code> y luego <code>{"{{item.descripcion}}"}</code>.
            </div>
            {!readOnly && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() =>
                  setRelations((current) => [
                    ...current,
                    { key: `items${current.length + 1}`, table: "", fkField: "" },
                  ])
                }
              >
                Añadir relación
              </button>
            )}
          </div>

          {relations.length === 0 ? (
            <div className="alert alert-light mb-0">No hay relaciones definidas todavía.</div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {relations.map((relation, idx) => (
                <div key={`${relation.key}-${idx}`} className="border rounded-3 p-3">
                  <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
                    <div className="fw-semibold">Relación #{idx + 1}</div>
                    {!readOnly && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => setRelations((current) => current.filter((_, currentIdx) => currentIdx !== idx))}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>

                  <div className="row g-3">
                    <div className="col-12 col-md-4">
                      <label className="form-label">Clave interna</label>
                      <input
                        className="form-control"
                        value={relation.key}
                        disabled={readOnly}
                        onChange={(e) => {
                          const next = relations.slice();
                          next[idx] = { ...next[idx], key: e.target.value };
                          setRelations(next);
                        }}
                        placeholder="Ej: lineas"
                      />
                      <div className="form-text">Será accesible como <code>{`related.${relation.key || "clave"}`}</code>.</div>
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="form-label">Tabla relacionada</label>
                      <select
                        className="form-select"
                        value={relation.table}
                        disabled={readOnly}
                        onChange={(e) => {
                          const next = relations.slice();
                          next[idx] = { ...next[idx], table: e.target.value, fkField: "" };
                          setRelations(next);
                        }}
                      >
                        <option value="">Selecciona una tabla</option>
                        {!tableOptions.includes(relation.table) && relation.table ? <option value={relation.table}>{relation.table}</option> : null}
                        {tableOptions.map((table) => (
                          <option key={table} value={table}>
                            {table}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="form-label">Campo FK hacia el registro principal</label>
                      <select
                        className="form-select"
                        value={relation.fkField}
                        disabled={readOnly || !relation.table}
                        onChange={(e) => {
                          const next = relations.slice();
                          next[idx] = { ...next[idx], fkField: e.target.value };
                          setRelations(next);
                        }}
                      >
                        <option value="">Selecciona un campo</option>
                        {!((fieldsByTable[relation.table] ?? []).includes(relation.fkField)) && relation.fkField ? (
                          <option value={relation.fkField}>{relation.fkField}</option>
                        ) : null}
                        {(fieldsByTable[relation.table] ?? []).map((field) => (
                          <option key={field} value={field}>
                            {field}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="alert alert-light small mt-3 mb-0">
                    En un bloque con repeat usarás <code>{`related.${relation.key || "clave"}`}</code> y dentro de la fila <code>{"{{item.campo}}"}</code>.
                  </div>
                </div>
              ))}
            </div>
          )}
        </ConfigModal>
      )}

      {configModal === "lookups" && (
        <ConfigModal
          title="Configurar lookups"
          subtitle="Los lookups resuelven UUIDs contra otra tabla y generan un campo de salida con etiqueta."
          onClose={() => setConfigModal(null)}
        >
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="small text-muted">
              Ejemplo: <code>service</code> → <code>service__label</code> para mostrar nombres en vez de UUIDs.
            </div>
            {!readOnly && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  const next = [...(template.lookups ?? [])];
                  next.push(
                    withDefaultsLookup({
                      in: relations[0]?.key ? "related" : "record",
                      relatedKey: relations[0]?.key ?? "",
                      field: "",
                      refTable: "",
                      refIdField: "id",
                      refLabelField: "",
                    })
                  );
                  updateTemplate({ lookups: next });
                }}
              >
                Añadir lookup
              </button>
            )}
          </div>

          {(template.lookups ?? []).length === 0 ? (
            <div className="alert alert-light mb-0">No hay lookups definidos.</div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {(template.lookups ?? []).map((lookup, idx) => {
                const currentLookup = withDefaultsLookup(lookup);
                const relatedTable =
                  currentLookup.in === "related"
                    ? relations.find((relation) => relation.key === currentLookup.relatedKey)?.table || ""
                    : "";
                const inputFields =
                  currentLookup.in === "record"
                    ? sourceFields
                    : relatedTable
                    ? fieldsByTable[relatedTable] ?? []
                    : [];
                const refFields = currentLookup.refTable ? fieldsByTable[currentLookup.refTable] ?? [] : [];

                const updateLookup = (patch: Partial<LookupSpec>) => {
                  const next = [...(template.lookups ?? [])];
                  next[idx] = withDefaultsLookup({ ...currentLookup, ...patch });
                  updateTemplate({ lookups: next });
                };

                return (
                  <div key={`${currentLookup.in}-${currentLookup.relatedKey}-${idx}`} className="border rounded-3 p-3">
                    <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
                      <div className="fw-semibold">Lookup #{idx + 1}</div>
                      {!readOnly && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => {
                            const next = [...(template.lookups ?? [])];
                            next.splice(idx, 1);
                            updateTemplate({ lookups: next });
                          }}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>

                    <div className="row g-3">
                      <div className="col-12 col-md-4">
                        <label className="form-label">Origen</label>
                        <select
                          className="form-select"
                          value={currentLookup.in}
                          disabled={readOnly}
                          onChange={(e) =>
                            updateLookup({
                              in: e.target.value as "record" | "related",
                              relatedKey: e.target.value === "record" ? undefined : relations[0]?.key ?? "",
                              field: "",
                            })
                          }
                        >
                          <option value="record">Registro principal</option>
                          <option value="related">Relación</option>
                        </select>
                      </div>

                      <div className="col-12 col-md-4">
                        <label className="form-label">Relación</label>
                        <select
                          className="form-select"
                          value={currentLookup.in === "related" ? currentLookup.relatedKey ?? "" : ""}
                          disabled={readOnly || currentLookup.in !== "related"}
                          onChange={(e) => updateLookup({ relatedKey: e.target.value, field: "" })}
                        >
                          <option value="">Selecciona una relación</option>
                          {relations.map((relation) => (
                            <option key={relation.key} value={relation.key}>
                              {relation.key} ({relation.table})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-12 col-md-4">
                        <label className="form-label">Campo UUID</label>
                        <select
                          className="form-select"
                          value={currentLookup.field}
                          disabled={readOnly}
                          onChange={(e) => updateLookup({ field: e.target.value, outField: `${e.target.value}__label` })}
                        >
                          <option value="">Selecciona un campo</option>
                          {!inputFields.includes(currentLookup.field) && currentLookup.field ? (
                            <option value={currentLookup.field}>{currentLookup.field}</option>
                          ) : null}
                          {inputFields.map((field) => (
                            <option key={field} value={field}>
                              {field}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-12 col-md-4">
                        <label className="form-label">Campo de salida</label>
                        <input
                          className="form-control"
                          value={currentLookup.outField ?? ""}
                          disabled={readOnly}
                          onChange={(e) => updateLookup({ outField: e.target.value })}
                          placeholder={currentLookup.field ? `${currentLookup.field}__label` : "campo__label"}
                        />
                      </div>

                      <div className="col-12 col-md-4">
                        <label className="form-label">Tabla de referencia</label>
                        <select
                          className="form-select"
                          value={currentLookup.refTable}
                          disabled={readOnly}
                          onChange={(e) => updateLookup({ refTable: e.target.value, refLabelField: "", refIdField: "id" })}
                        >
                          <option value="">Selecciona una tabla</option>
                          {!tableOptions.includes(currentLookup.refTable) && currentLookup.refTable ? (
                            <option value={currentLookup.refTable}>{currentLookup.refTable}</option>
                          ) : null}
                          {tableOptions.map((table) => (
                            <option key={table} value={table}>
                              {table}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-12 col-md-4">
                        <label className="form-label">Campo visible</label>
                        <select
                          className="form-select"
                          value={currentLookup.refLabelField}
                          disabled={readOnly || !currentLookup.refTable}
                          onChange={(e) => updateLookup({ refLabelField: e.target.value })}
                        >
                          <option value="">Selecciona el campo a mostrar</option>
                          {refFields.map((field) => (
                            <option key={field} value={field}>
                              {field}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-12 col-md-4">
                        <label className="form-label">Campo ID</label>
                        <select
                          className="form-select"
                          value={currentLookup.refIdField ?? "id"}
                          disabled={readOnly || !currentLookup.refTable}
                          onChange={(e) => updateLookup({ refIdField: e.target.value || "id" })}
                        >
                          {(refFields.length ? refFields : ["id"]).map((field) => (
                            <option key={field} value={field}>
                              {field}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="alert alert-light small mt-3 mb-0">
                      Usa luego <code>{currentLookup.in === "record" ? `{{record.${currentLookup.outField || `${currentLookup.field || "campo"}__label`}}}` : `{{item.${currentLookup.outField || `${currentLookup.field || "campo"}__label`}}}`}</code>.
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ConfigModal>
      )}
    </form>
  );
}

