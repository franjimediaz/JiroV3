export const MAX_FIELD_REF_DEPTH = 3;

export type FieldRef = {
  field: string;
  /** Configured selectorTabla field names, from the source module outward. */
  relations?: string[];
};

export type LegacyFieldRef = FieldRef & { relation?: string };
export type FieldRefLike = string | FieldRef;
export type FieldRefInput = string | LegacyFieldRef | null | undefined;

export function normalizeFieldRef(input: FieldRefInput): Required<FieldRef> {
  if (typeof input === "string") {
    return { field: input.trim(), relations: [] };
  }

  const relations = Array.isArray(input?.relations)
    ? input.relations
    : typeof input?.relation === "string" && input.relation.trim()
      ? [input.relation]
      : [];

  return {
    field: String(input?.field || "").trim(),
    relations: relations.map(value => String(value || "").trim()).filter(Boolean),
  };
}

export function serializeFieldRef(input: FieldRefInput): FieldRef {
  const normalized = normalizeFieldRef(input);
  return normalized.relations.length
    ? { field: normalized.field, relations: normalized.relations }
    : { field: normalized.field };
}

export function fieldRefRelations(input: FieldRefInput) {
  return normalizeFieldRef(input).relations;
}

export function fieldRefKey(input: FieldRefInput) {
  const normalized = normalizeFieldRef(input);
  return JSON.stringify([normalized.relations, normalized.field]);
}

export function isDirectFieldRef(input: FieldRefInput) {
  return fieldRefRelations(input).length === 0;
}

export function formatFieldRefPath(
  input: FieldRefInput,
  labelFor?: (technicalName: string, depth: number, kind: "relation" | "field") => string | undefined,
) {
  const normalized = normalizeFieldRef(input);
  const parts = normalized.relations.map((relation, depth) => labelFor?.(relation, depth, "relation") || relation);
  if (normalized.field) {
    parts.push(labelFor?.(normalized.field, normalized.relations.length, "field") || normalized.field);
  }
  return parts.join(" > ");
}

/** Reads a FieldRef from an already hydrated row. It never performs I/O. */
export function getFieldRefValue(row: unknown, input: FieldRefInput): unknown {
  const normalized = normalizeFieldRef(input);
  let current = row;
  for (const relation of normalized.relations) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[relation];
  }
  if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
  return (current as Record<string, unknown>)[normalized.field];
}

export function isValidFieldRefShape(input: FieldRefInput, maxDepth = MAX_FIELD_REF_DEPTH) {
  const normalized = normalizeFieldRef(input);
  return !!normalized.field && normalized.relations.length <= maxDepth && normalized.relations.every(Boolean);
}
