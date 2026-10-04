/** Normalize only explicitly declared scalar relations/UUIDs, never names or arbitrary *_id fields. */
export function normalizeEmptyRelations<T extends Record<string, unknown>>(
  fields: readonly { name: string; type: string; ref?: unknown }[],
  values: T,
): T {
  const result = { ...values };
  for (const field of fields) {
    const multiple = field.ref && typeof field.ref === "object" && "multiple" in field.ref && field.ref.multiple;
    if ((field.type === "selectorTabla" && !multiple) || field.type === "uuid") {
      if (result[field.name] === "") Object.assign(result, { [field.name]: null });
    }
  }
  return result;
}
