"use client";

type BlockLike = {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  value?: string;
  repeat?: string;
  rows?: Array<{ label?: string; value?: string }>;
  columns?: Array<{ label?: string; value?: string }>;
  cards?: Array<{ title?: string; subtitle?: string }>;
  card?: { title?: string; subtitle?: string };
};

function stripHtml(value: string | undefined) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasDynamicValue(value: unknown): boolean {
  return typeof value === "string" && value.includes("{{");
}

function summarizeBlock(block: BlockLike) {
  if (block.type === "header") {
    return block.title || "Cabecera sin título";
  }
  if (block.type === "text") {
    return stripHtml(block.value).slice(0, 140) || "Bloque de texto";
  }
  if (block.type === "table") {
    return `${block.columns?.length ?? 0} columnas${block.repeat ? ` · ${block.repeat}` : ""}`;
  }
  if (block.type === "cards") {
    if ("cards" in block && Array.isArray(block.cards)) {
      return `${block.cards.length} tarjetas estáticas`;
    }
    if (block.card) {
      return `Tarjeta repetida${block.repeat ? ` · ${block.repeat}` : ""}`;
    }
  }
  if (block.type === "totalsBox") {
    return `${block.rows?.length ?? 0} filas de resultado`;
  }
  if (block.type === "business") {
    return block.title || block.subtitle || "Bloque de negocio";
  }
  if (block.type === "chart") {
    return block.title || "Gráfico";
  }
  if (block.type === "budgetPartidas") {
    return block.title || "Partidas y subtotales";
  }
  return block.title || block.type;
}

export default function PdfTemplateCanvas({
  blocks,
  selectedBlockId,
  onSelectBlock,
}: {
  blocks: BlockLike[];
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
}) {
  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-header bg-white">
        <div className="fw-semibold">Estructura de la plantilla</div>
        <div className="text-muted small">
          Selecciona un bloque desde esta vista para editarlo en el panel derecho.
        </div>
      </div>
      <div className="card-body d-flex flex-column gap-3" style={{ minHeight: 640 }}>
        {blocks.length === 0 ? (
          <div className="border rounded-4 p-4 bg-body-tertiary text-muted">
            No hay bloques todavía. Usa el panel izquierdo para empezar con un texto, una tabla o un bloque de resultados.
          </div>
        ) : (
          blocks.map((block, index) => {
            const isSelected = selectedBlockId === block.id;
            const isDynamic =
              hasDynamicValue(block.title) ||
              hasDynamicValue(block.subtitle) ||
              hasDynamicValue(block.value) ||
              Boolean(block.rows?.some((row) => hasDynamicValue(row.value))) ||
              Boolean(block.columns?.some((column) => hasDynamicValue(column.value)));

            return (
              <button
                key={block.id}
                type="button"
                className={`text-start border rounded-4 p-3 bg-white ${isSelected ? "border-primary shadow-sm" : "border-light-subtle"}`}
                onClick={() => onSelectBlock(block.id)}
              >
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <div className="small text-muted">Bloque {index + 1}</div>
                    <div className="fw-semibold text-dark">{block.type}</div>
                  </div>
                  <div className="d-flex gap-2 flex-wrap justify-content-end">
                    {isDynamic && <span className="badge text-bg-primary">Dinámico</span>}
                    {block.repeat && <span className="badge text-bg-light border">{block.repeat}</span>}
                  </div>
                </div>
                <div className="mt-2 text-dark">{summarizeBlock(block)}</div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
