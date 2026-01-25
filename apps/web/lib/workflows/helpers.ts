// lib/workflows/helpers.ts
export function normalizeDeriveInput(input: any) {
  if (!input || typeof input !== "object") throw new Error("input inválido");

  if (!input.source?.parentTable) throw new Error("input.source.parentTable requerido");
  if (!input.target?.parentTable) throw new Error("input.target.parentTable requerido");

  // children opcional, pero si viene, debe tener shape consistente
  if (input.source?.children && typeof input.source.children !== "object") {
    throw new Error("input.source.children inválido");
  }
  if (input.target?.children && typeof input.target.children !== "object") {
    throw new Error("input.target.children inválido");
  }

  return input;
}

export function applyMapAndDefaults({
  sourceRow,
  map,
  defaults,
}: {
  sourceRow: any;
  map?: Record<string, string>;
  defaults?: Record<string, any>;
}) {
  const out: any = { ...(defaults || {}) };
  for (const [dest, src] of Object.entries(map || {})) {
    out[dest] = sourceRow?.[src];
  }
  return out;
}
