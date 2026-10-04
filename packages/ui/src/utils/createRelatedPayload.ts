import type { CreateRelatedAction, ModuleSchema } from "@repo/types";

export function buildCreateRelatedPayload(
  action: CreateRelatedAction,
  schema: ModuleSchema,
  values: Record<string, unknown>,
  parentRecordId?: string,
) {
  const payload: Record<string, unknown> = { ...action.defaults };
  const primaryKey = schema.db?.primaryKey || "id";
  const read = (path: string) => path.split(".").reduce<unknown>((value, key) =>
    value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, values);
  const parentFields = Object.entries(action.fieldMap || {})
    .filter(([, source]) => source === primaryKey || source === "id")
    .map(([destination]) => destination);

  for (const [destination, source] of Object.entries(action.fieldMap || {})) {
    const value = read(source);
    if (value !== undefined) payload[destination] = value;
  }

  // A fieldMap explicitly identifies the relationship when several links point to the same module.
  if (!parentFields.length) {
    const relations = schema.fields.filter(field => field.type === "ReverseLink" &&
      field.ref.moduleSlug === (action.target.moduleSlug || action.target.table));
    if (relations.length > 1) throw new Error("Hay varias relaciones con el destino. Configura la FK en fieldMap.");
    const relation = relations[0];
    if (relation?.type === "ReverseLink") {
      const key = relation.ref.parentKey || primaryKey;
      if (key === primaryKey || key === "id") parentFields.push(relation.ref.foreignKey);
      else {
        const value = read(key);
        if (value == null || value === "") throw new Error("Falta el valor del padre para crear el relacionado.");
        payload[relation.ref.foreignKey] = value;
      }
    }
  }

  if (parentFields.length) {
    // The saved record identity takes precedence over editable/default form values.
    const id = parentRecordId ?? values[primaryKey] ?? values.id;
    if (id == null || id === "") throw new Error("Guarda el registro padre antes de crear relacionados.");
    for (const foreignKey of parentFields) payload[foreignKey] = id;
  }
  return payload;
}
