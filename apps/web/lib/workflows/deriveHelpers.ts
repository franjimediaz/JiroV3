// lib/workflows/deriveHelpers.ts
export function normalizeDeriveInput(input: any) {
  if (!input || typeof input !== "object") throw new Error("input inválido");

  if (!input.source?.parentTable) throw new Error("input.source.parentTable requerido (slug)");
  if (!input.target?.parentTable) throw new Error("input.target.parentTable requerido (slug)");

  // si hay hijos, valida fk
  if (input.source?.children?.table && !input.source.children.fkToParent) {
    throw new Error("source.children.fkToParent requerido cuando source.children.table existe");
  }
  if (input.target?.children?.table && !input.target.children.fkToParent) {
    throw new Error("target.children.fkToParent requerido cuando target.children.table existe");
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
