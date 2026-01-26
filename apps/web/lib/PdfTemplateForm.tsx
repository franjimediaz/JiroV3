"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { upsertPdfTemplateAction, deletePdfTemplateAction } from "./actions/pdfTemplates";

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
  primaryColor: string;
  headerBg: string;
  headerTextColor: string;
  table: {
    headerBg: string;
    borderColor: string;
    zebra: boolean;
    dense: boolean;
  };
};

type BlockStyle = {
  color?: string;
  background?: string;
  fontSize?: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
  padding?: number;
};

type PdfBlock =
  | { id: string; type: "header"; title: string; subtitle?: string; style?: BlockStyle }
  | { id: string; type: "text"; value: string; variant?: "normal" | "h1" | "h2" | "muted"; style?: BlockStyle }
  | { id: string; type: "divider" }
  | {
      id: string;
      type: "table";
      title?: string;
      repeat: string;
      tableStyle?: { zebra?: boolean; dense?: boolean };
      columns: { label: string; value: string; align?: "left" | "right" }[];
    };

type Template = {
  page: { size: "A4"; margin: number };
  theme: Theme;
  blocks: PdfBlock[];
};

/* ------------------------------------------------------------------ */
/* ---------------------------- HELPERS ------------------------------ */
/* ------------------------------------------------------------------ */

const uid = () => Math.random().toString(36).slice(2);

const defaultTheme: Theme = {
    fontFamily: "inter",
  baseFontSize: 12,
  textColor: "#111827",
  primaryColor: "#2563eb",
  headerBg: "#0f172a",
  headerTextColor: "#ffffff",
  table: {
    headerBg: "#f3f4f6",
    borderColor: "#e5e7eb",
    zebra: true,
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
  };
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
  const tpl = initialData?.template;
  if (tpl) return ensureTemplate(tpl);

  return ensureTemplate({
    page: { size: "A4", margin: 24 },
    theme: defaultTheme,
    blocks: [
      { id: uid(), type: "header", title: "Documento {{record.id}}", subtitle: "{{now}}" },
    ],
  });
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

  /* ------------------------------------------------------------------ */
  /* ----------------------------- ACTIONS ----------------------------- */
  /* ------------------------------------------------------------------ */

  function updateTemplate(patch: Partial<Template>) {
    setTemplate((t) => ({ ...t, ...patch }));
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
      : {
          id: uid(),
          type: "table",
          title: "Tabla",
          repeat: relations[0] ? `related.${relations[0].key}` : "",
          tableStyle: { zebra: true, dense: false },
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
            <div className="card">
              <div className="card-header">Bloques</div>
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
                </div>
                )}
            </div>
            <div className="card mb-3">
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
                                Se usará como <code>related.{rel.key || "key"}</code>
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

          </div>

          <div className="col-md-8">
            {selectedBlock && selectedBlock.type === "text" && (
              <div className="card">
                <div className="card-header">Texto</div>
                <div className="card-body">
                  <textarea
                    className="form-control"
                    rows={4}
                    value={selectedBlock.value}
                    disabled={readOnly}
                    onChange={(e) => updateBlock(selectedBlock.id, "text", { value: e.target.value })}
                  />
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
                    </div>

                    <div className="alert alert-info small mt-3 mb-0">
                        En la tabla usa <code>{"{{item.campo}}"}</code> (porque el repeat crea <code>item</code>)
                    </div>
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
          <div className="card-body row g-3">
            <div className="col-md-4">
              <label className="form-label">Fuente</label>
              <select
                className="form-select"
                value={template.theme.fontFamily}
                disabled={readOnly}
                onChange={(e) => updateTemplate({ theme: { ...template.theme, fontFamily: e.target.value as any } })}
              >
                <option value="inter">Inter</option>
                <option value="roboto">Roboto</option>
                <option value="times">Times</option>
                <option value="georgia">Georgia</option>
              </select>
            </div>

            <div className="col-md-4">
              <label className="form-label">Color texto</label>
              <input
                type="color"
                className="form-control form-control-color"
                value={template.theme.textColor}
                disabled={readOnly}
                onChange={(e) => updateTemplate({ theme: { ...template.theme, textColor: e.target.value } })}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label">Header fondo</label>
              <input
                type="color"
                className="form-control form-control-color"
                value={template.theme.headerBg}
                disabled={readOnly}
                onChange={(e) => updateTemplate({ theme: { ...template.theme, headerBg: e.target.value } })}
              />
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
