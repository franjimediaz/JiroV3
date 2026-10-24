import type { Field, ModuleSchema } from "./fields";

export const SERVER_CONTROLLED_FIELDS: readonly string[] = [
  "tenant_id", "organization_id", "created_by", "updated_by", "owner_id",
  "role_id", "is_admin", "created_at", "updated_at",
];

export function isPersistableField(field: Pick<Field, "name" | "virtual" | "compute"> & { type?: string }): boolean {
  const transientCompute = field.compute && "persist" in field.compute && field.compute.persist === "none";
  return field.type !== "ReverseLink" && field.virtual !== true && !transientCompute
    && !SERVER_CONTROLLED_FIELDS.includes(field.name);
}

/** Pure client/server selection. Request validation belongs to the API boundary. */
export function pickPersistablePayload(
  values: Record<string, unknown>,
  schema: Pick<ModuleSchema, "fields" | "db">,
  options: { operation: "create" | "update"; primaryKey?: string },
): Record<string, unknown> {
  const primaryKey = options.primaryKey || schema.db?.primaryKey || "id";
  const allowed = new Set((schema.fields || []).filter(isPersistableField).map(field => field.name));
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => {
    if (!allowed.has(key) || value === undefined) return false;
    if (key === primaryKey) {
      if (options.operation === "update") return false;
      if (value === null || (typeof value === "string" && value.trim() === "")) return false;
    }
    return true;
  }));
}
