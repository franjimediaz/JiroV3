import { normalizeEmptyRelations, pickPersistablePayload, SERVER_CONTROLLED_FIELDS, type ModuleSchema } from "@repo/types";
import { badRequest } from "@/lib/auth/apiError";

export function buildPersistablePayload(
  schema: ModuleSchema,
  incoming: Record<string, unknown>,
  options: { operation: "create" | "update"; primaryKey: string },
) {
  const declared = new Set((schema.fields || []).map(field => field.name));
  const keys = Object.keys(incoming);
  const unknown = keys.filter(key => !declared.has(key));
  if (unknown.length) throw badRequest(`Campos no declarados en schema: ${unknown.join(", ")}`);
  const controlled = keys.filter(key => SERVER_CONTROLLED_FIELDS.includes(key));
  if (controlled.length) throw badRequest(`Campos controlados por servidor no permitidos: ${controlled.join(", ")}`);
  const payload = pickPersistablePayload(incoming, schema, options);
  return normalizeEmptyRelations((schema.fields || []).filter(field => Object.hasOwn(payload, field.name)), payload);
}
