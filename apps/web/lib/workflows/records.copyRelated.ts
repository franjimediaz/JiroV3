import { createClient } from "@/lib/supabase/server";
import { resolveModuleConfig } from "@/lib/modules/resolveModuleConfig";
import { badRequest, conflict } from "@/lib/auth/apiError";
import { parseCopyRelatedInput } from "@/lib/validation/workflows";
import type { WorkflowContext } from "./runWorkflow";

// Advance by the number actually returned: PostgREST may cap pages below 500.
type PageQuery = {
  order: (column: string) => {
    range: (from: number, to: number) => PromiseLike<{
      data: unknown;
      error: { message: string } | null;
      count: number | null;
    }>;
  };
};

async function readAll(query: () => PageQuery, primaryKey: string) {
  const rows: Record<string, unknown>[] = [];
  for (;;) {
    const { data, error, count } = await query().order(primaryKey).range(rows.length, rows.length + 499);
    if (error) throw new Error(`records.copyRelated: ${error.message}`);
    if (!Array.isArray(data) || data.some((row) => !row || typeof row !== "object" || Array.isArray(row)) || typeof count !== "number") {
      throw new Error("records.copyRelated: respuesta de lectura incompleta");
    }
    rows.push(...data as Record<string, unknown>[]);
    if (rows.length >= count) return rows;
    if (!data.length) throw new Error("records.copyRelated: lectura interrumpida; no se han insertado registros");
  }
}

export async function recordsCopyRelated({ context, input }: { context: WorkflowContext; input?: unknown }) {
  const cfg = parseCopyRelatedInput(input);
  const currentRef = context.moduleSlug || context.tableSlug || context.table;
  if (!currentRef) throw badRequest("context.moduleSlug, context.tableSlug o context.table requerido");
  // Accept physical table aliases only when the central resolver finds a real module.
  const resolve = async (ref: string) => {
    const resolved = await resolveModuleConfig(ref);
    if (!resolved.table) throw badRequest(`El modulo ${ref} no tiene tabla`);
    return resolved;
  };
  const current = await resolve(currentRef);
  const source = await resolve(cfg.source.table);
  const target = await resolve(cfg.target.table);
  const supabase = await createClient(); // Session client: preserves RLS.
  const from = (table: string) => {
    const parts = table.split(".");
    return parts.length === 2
      ? supabase.schema(parts[0]!).from(parts[1]!)
      : supabase.from(table);
  };
  const { data: record, error } = await from(current.table!).select("*").eq(current.primaryKey, context.recordId).maybeSingle();
  if (error) throw new Error(`No se pudo leer el registro actual: ${error.message}`);
  if (!record) throw badRequest("Registro actual no encontrado o no accesible");
  const matchValue = record[cfg.source.match.valueFromRecord];
  if (matchValue === undefined) throw badRequest(`El registro actual no contiene ${cfg.source.match.valueFromRecord}`);
  if (matchValue !== null && !["string", "number", "boolean"].includes(typeof matchValue)) {
    throw badRequest(`source.match.valueFromRecord (${cfg.source.match.valueFromRecord}) debe contener un valor escalar`);
  }
  // An unselected relation is not a request to copy every source with a NULL FK.
  const sources = matchValue === null || matchValue === "" ? [] : await readAll(
    () => from(source.table!).select("*", { count: "exact" }).eq(cfg.source.match.field, matchValue), source.primaryKey,
  );
  const seen = new Set<string>();
  const dedupe = cfg.dedupe?.enabled ? cfg.dedupe : undefined;
  if (dedupe && sources.length) {
    const existing = await readAll(
      () => from(target.table!).select(dedupe.targetSourceIdField!, { count: "exact" }).eq(cfg.target.parentField, context.recordId), target.primaryKey,
    );
    for (const row of existing) {
      const id = row[dedupe.targetSourceIdField!];
      if (id != null) seen.add(String(id));
    }
  }
  const rows: Record<string, unknown>[] = [];
  for (const row of sources) {
    const sourceId = dedupe ? row[dedupe.sourceIdField!] : undefined;
    if (dedupe && (sourceId == null || sourceId === "" || !["string", "number"].includes(typeof sourceId))) {
      throw badRequest(`Origen sin identidad valida en dedupe.sourceIdField (${dedupe.sourceIdField})`);
    }
    if (dedupe && seen.has(String(sourceId))) continue;
    const payload: Record<string, unknown> = { ...cfg.defaults };
    for (const [dest, src] of Object.entries(cfg.map || {})) {
      if (!Object.prototype.hasOwnProperty.call(row, src)) throw badRequest(`Campo origen del mapping no encontrado: ${src}`);
      payload[dest] = row[src];
    }
    payload[cfg.target.parentField] = context.recordId;
    if (dedupe) {
      payload[dedupe.targetSourceIdField!] = sourceId;
      seen.add(String(sourceId));
    }
    rows.push(payload);
  }
  if (rows.length) {
    // One bulk statement; never fall back to individual inserts after a failure.
    const { error: insertError } = await from(target.table!).insert(rows);
    if (insertError?.code === "23505") throw conflict("Conflicto de unicidad al copiar registros. Reintenta para comprobar los ya existentes.");
    if (insertError) throw new Error(`No se pudo insertar el lote: ${insertError.message}`);
  }
  return {
    result: { matched: sources.length, created: rows.length, skipped: sources.length - rows.length },
    meta: {
      source: { moduleSlug: source.slug, table: source.table },
      target: { moduleSlug: target.slug, table: target.table, parentField: cfg.target.parentField, parentId: context.recordId },
      dedupe: Boolean(dedupe),
    },
  };
}
