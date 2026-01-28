type AnyObj = Record<string, any>;

function safeJsonParse<T>(v: any, fallback: T): T {
  try {
    if (v == null) return fallback;
    if (typeof v === "string") return JSON.parse(v) as T;
    if (typeof v === "object") return v as T;
    return fallback;
  } catch {
    return fallback;
  }
}

export function parseTemplateRow(tplRow: AnyObj) {
  const related = safeJsonParse<any[]>(tplRow.related, []);
  const template = safeJsonParse<any>(
    tplRow.template,
    { page: { size: "A4", margin: 24 }, theme: {}, blocks: [], lookups: [] }
  );

  // ✅ compat: si falta lookups, crea array vacío
  if (!Array.isArray(template.lookups)) template.lookups = [];

  return { related, template };
}

/**
 * Devuelve una lista de "label resolvers" que resolvePdfContext usará para:
 * - convertir UUIDs a labels (campo__label) dentro de record o related[key]
 *
 * Fuentes:
 *  A) template.lookups (nuevo / global / recomendado)
 *  B) budgetPartidas.groupByLookup (legacy / compat)
 */
export function deriveLabelResolversFromTemplate(template: AnyObj) {
  const blocks = Array.isArray(template?.blocks) ? template.blocks : [];
  const resolvers: any[] = [];

  // -------------------------------
  // (A) ✅ Lookups globales
  // template.lookups: [{ in, relatedKey?, field, refTable, refIdField?, refLabelField, outField? }]
  // -------------------------------
  const lookups = Array.isArray(template?.lookups) ? template.lookups : [];
  for (const lk of lookups) {
    if (!lk || typeof lk !== "object") continue;

    const where = lk.in === "record" ? "record" : "related";
    const relatedKey = lk.relatedKey ? String(lk.relatedKey) : undefined;

    const field = String(lk.field || "").trim();
    const refTable = String(lk.refTable || "").trim();
    const refLabelField = String(lk.refLabelField || "").trim();
    const refIdField = lk.refIdField ? String(lk.refIdField).trim() : "id";
    const outField = lk.outField ? String(lk.outField).trim() : (field ? `${field}__label` : "");

    // validaciones mínimas
    if (!field || !refTable || !refLabelField) continue;
    if (where === "related" && !relatedKey) continue;

    resolvers.push({
      in: where,
      relatedKey,
      field,
      refTable,
      refLabelField,
      refIdField: refIdField || "id",
      outField: outField || `${field}__label`,
    });
  }

  // -------------------------------
  // (B) ✅ Compat legacy: budgetPartidas.groupByLookup
  // (se mantiene para no romper plantillas viejas)
  // -------------------------------
  for (const b of blocks) {
    if (b?.type !== "budgetPartidas") continue;

    const tareasKey = String(b?.tareasKey || "").trim();
    const groupByField = String(b?.groupByField || "").trim();
    const lookup = b?.groupByLookup;

    if (!tareasKey || !groupByField) continue;
    if (!lookup || typeof lookup !== "object") continue;

    const refTable = String(lookup.refTable || "").trim();
    const refLabelField = String(lookup.refLabelField || "").trim();
    const refIdField = lookup.refIdField ? String(lookup.refIdField).trim() : "id";
    const outField = lookup.outField ? String(lookup.outField).trim() : `${groupByField}__label`;

    if (!refTable || !refLabelField) continue;

    resolvers.push({
      in: "related",
      relatedKey: tareasKey,
      field: groupByField,
      refTable,
      refLabelField,
      refIdField: refIdField || "id",
      outField: outField || `${groupByField}__label`,
    });
  }

  // -------------------------------
  // Dedupe: evita repetidos
  // -------------------------------
  const keyOf = (r: any) =>
    `${r.in}|${r.relatedKey || ""}|${r.field}|${r.refTable}|${r.refIdField}|${r.refLabelField}|${r.outField}`;

  const seen = new Set<string>();
  return resolvers.filter((r) => {
    const k = keyOf(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
