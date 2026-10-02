import { asRecord, requiredString } from "./common";
import { badRequest } from "@/lib/auth/apiError";
import type { CopyRelatedInput } from "@repo/types";

export function parseCopyRelatedInput(value: unknown): CopyRelatedInput {
  const input = asRecord(value, "records.copyRelated: input debe ser un objeto");
  const source = asRecord(input.source, "source debe ser un objeto");
  const match = asRecord(source.match, "source.match debe ser un objeto");
  const target = asRecord(input.target, "target debe ser un objeto");
  const field = (value: unknown, path: string) => {
    const name = requiredString(value, path, 63);
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) || ["__proto__", "constructor", "prototype"].includes(name)) {
      throw badRequest(`${path}: nombre de campo invalido`);
    }
    return name;
  };
  const map = input.map === undefined ? {} : asRecord(input.map, "map debe ser un objeto");
  const defaults = input.defaults === undefined ? {} : asRecord(input.defaults, "defaults debe ser un objeto");
  const cleanMap = Object.fromEntries(Object.entries(map).map(([dest, src]) => [field(dest, "map.destino"), field(src, `map.${dest}`)]));
  const cleanDefaults = Object.fromEntries(Object.entries(defaults).map(([dest, literal]) => [field(dest, "defaults.destino"), literal]));
  const parentField = field(target.parentField, "target.parentField");
  let dedupe: CopyRelatedInput["dedupe"];
  if (input.dedupe !== undefined) {
    const raw = asRecord(input.dedupe, "dedupe debe ser un objeto");
    if (typeof raw.enabled !== "boolean") throw badRequest("dedupe.enabled debe ser booleano");
    dedupe = { enabled: raw.enabled };
    for (const key of ["sourceIdField", "targetSourceIdField"] as const) {
      if (raw.enabled || raw[key] !== undefined) dedupe[key] = field(raw[key], `dedupe.${key}`);
    }
    if (dedupe.enabled && dedupe.targetSourceIdField === parentField) {
      throw badRequest("dedupe.targetSourceIdField debe ser distinto de target.parentField");
    }
  }
  return {
    source: { table: requiredString(source.table, "source.table"), match: {
      field: field(match.field, "source.match.field"),
      valueFromRecord: field(match.valueFromRecord, "source.match.valueFromRecord"),
    } },
    target: { table: requiredString(target.table, "target.table"), parentField },
    map: cleanMap,
    defaults: cleanDefaults,
    ...(dedupe ? { dedupe } : {}),
  };
}

export function parseRunWorkflowBody(value: unknown) {
  const body = asRecord(value);
  const context = asRecord(body.context, "context invalido");
  return {
    workflowKey: requiredString(body.workflowKey, "workflowKey", 100),
    context: {
      ...context,
      recordId: requiredString(context.recordId, "context.recordId", 120),
    },
    input: body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : {},
  };
}
