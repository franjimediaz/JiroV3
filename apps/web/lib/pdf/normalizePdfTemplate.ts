type AnyObj = Record<string, any>;

function isRecord(value: unknown): value is AnyObj {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeBlock(block: unknown, index: number): AnyObj | null {
  if (!isRecord(block)) return null;
  const type = String(block.type || block.kind || "text").trim();
  const id = String(block.id || `${type}_${index + 1}`).trim();

  // Compatibility stays here for now: real templates may still contain budgetPartidas.
  return {
    ...block,
    id,
    type,
    blocks: Array.isArray(block.blocks) ? block.blocks.map(normalizeBlock).filter(Boolean) : block.blocks,
  };
}

export function normalizePdfTemplate(template: unknown): AnyObj {
  const raw = isRecord(template) ? template : {};
  const blocks = Array.isArray(raw.blocks) ? raw.blocks.map(normalizeBlock).filter(Boolean) : [];

  return {
    ...raw,
    theme: isRecord(raw.theme) ? raw.theme : {},
    datasets: Array.isArray(raw.datasets) ? raw.datasets : [],
    blocks,
  };
}
