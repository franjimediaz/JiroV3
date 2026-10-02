import { createClient } from "@/lib/supabase/server";
import { resolveModuleConfig } from "@/lib/modules/resolveModuleConfig";
import { badRequest, conflict } from "@/lib/auth/apiError";
import { parseCopyRelatedInput } from "@/lib/validation/workflows";
import type { WorkflowContext } from "./runWorkflow";
import type { CopyRelatedInput, CopyRelatedChild } from "@repo/types";

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
  if (cfg.children?.length) {
    const tree = await prepareTree(cfg, source, target);
    const levels: CopyLevelStats[] = [];
    await copyTree(tree, sources.map((row) => ({ row, parentId: context.recordId })), from, levels);
    const root = levels[0]!;
    return {
      result: { matched: root.matched, created: root.created, skipped: root.skipped },
      meta: {
        source: { moduleSlug: source.slug, table: source.table },
        target: { moduleSlug: target.slug, table: target.table, parentField: cfg.target.parentField, parentId: context.recordId },
        dedupe: Boolean(cfg.dedupe?.enabled),
        levels,
        totals: levels.reduce((sum, level) => ({ matched: sum.matched + level.matched, created: sum.created + level.created, skipped: sum.skipped + level.skipped }), { matched: 0, created: 0, skipped: 0 }),
      },
    };
  }
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

type Id = string | number;
type Row = Record<string, unknown>;
type Module = Awaited<ReturnType<typeof resolveModuleConfig>>;
type CopyNode = CopyRelatedInput | CopyRelatedChild;
type PreparedNode = { cfg: CopyNode; source: Module; target: Module; children: PreparedNode[] };
type CopyLevelStats = { path: string; level: number; sourceTable: string; targetTable: string; matched: number; created: number; skipped: number };
type From = (table: string) => ReturnType<Awaited<ReturnType<typeof createClient>>["from"]>;

// Resolve the entire configuration before the first write, including empty branches.
async function prepareTree(cfg: CopyNode, source?: Module, target?: Module): Promise<PreparedNode> {
  source ??= await resolveModuleConfig(cfg.source.table);
  target ??= await resolveModuleConfig(cfg.target.table);
  if (!source.table || !target.table) throw badRequest(`Los modulos ${cfg.source.table} y ${cfg.target.table} deben tener tabla`);
  const children: PreparedNode[] = [];
  for (const child of cfg.children || []) children.push(await prepareTree(child));
  return { cfg, source, target, children };
}

function identity(value: unknown, description: string): Id {
  if ((typeof value !== "string" && typeof value !== "number") || value === "" || (typeof value === "number" && !Number.isFinite(value))) {
    throw badRequest(`${description}: identidad ausente o invalida`);
  }
  return value;
}

const pairKey = (parent: unknown, source: unknown) => JSON.stringify([String(parent), String(source)]);

async function readForParents(from: From, table: string, field: string, ids: Id[], primaryKey: string) {
  const unique = [...new Map(ids.map((id) => [String(id), id])).values()];
  const rows: Row[] = [];
  // Bound IN query URLs while fetching all parents, rather than querying each parent.
  for (let offset = 0; offset < unique.length; offset += 100) {
    const chunk = unique.slice(offset, offset + 100);
    rows.push(...await readAll(() => from(table).select("*", { count: "exact" }).in(field, chunk), primaryKey));
  }
  return rows;
}

async function copyTree(node: PreparedNode, entries: Array<{ row: Row; parentId: Id }>, from: From, levels: CopyLevelStats[], path = "root", level = 1) {
  const { cfg, source, target, children } = node;
  const hasChildren = children.length > 0;
  const dedupe = cfg.dedupe?.enabled ? cfg.dedupe : undefined;
  const stats: CopyLevelStats = { path, level, sourceTable: cfg.source.table, targetTable: cfg.target.table, matched: entries.length, created: 0, skipped: 0 };
  levels.push(stats);
  const destinations = new Map<string, Id>();
  const sourceIds = new Map<string, Id>();
  const link = (row: Row, destination: unknown) => {
    if (!hasChildren) return;
    const id = identity(row[source.primaryKey], `${path}: clave primaria origen ${source.primaryKey}`);
    const targetId = identity(destination, `${path}: clave primaria destino ${target.primaryKey}`);
    const previous = destinations.get(String(id));
    if (previous !== undefined && String(previous) !== String(targetId)) throw conflict(`${path}: correspondencia origen-destino ambigua`);
    sourceIds.set(String(id), id);
    destinations.set(String(id), targetId);
  };
  // Validate all source identities before writing this level.
  if (hasChildren) for (const { row } of entries) identity(row[source.primaryKey], `${path}: clave primaria origen ${source.primaryKey}`);
  const existing = new Map<string, Row>();
  if (dedupe && entries.length) {
    const rows = await readForParents(from, target.table!, cfg.target.parentField, entries.map((entry) => entry.parentId), target.primaryKey);
    for (const row of rows) {
      const sourceId = row[dedupe.targetSourceIdField!];
      if (sourceId == null) continue;
      const key = pairKey(row[cfg.target.parentField], sourceId);
      if (hasChildren && existing.has(key)) throw conflict(`${path}: varios destinos para la misma identidad de deduplicacion`);
      existing.set(key, row);
    }
  }
  const groups: Array<{ payload: Row; sources: Row[]; key?: string }> = [];
  const pending = new Map<string, (typeof groups)[number]>();
  for (const { row, parentId } of entries) {
    const sourceId = dedupe ? identity(row[dedupe.sourceIdField!], `${path}: dedupe.sourceIdField (${dedupe.sourceIdField})`) : undefined;
    const key = dedupe ? pairKey(parentId, sourceId) : undefined;
    const found = key === undefined ? undefined : existing.get(key);
    if (found) {
      stats.skipped++;
      link(row, found[target.primaryKey]);
      continue;
    }
    const repeated = key === undefined ? undefined : pending.get(key);
    if (repeated) {
      repeated.sources.push(row);
      stats.skipped++;
      continue;
    }
    const payload: Row = { ...cfg.defaults };
    for (const [dest, src] of Object.entries(cfg.map || {})) {
      if (!Object.prototype.hasOwnProperty.call(row, src)) throw badRequest(`${path}: campo origen del mapping no encontrado: ${src}`);
      payload[dest] = row[src];
    }
    payload[cfg.target.parentField] = parentId;
    if (dedupe) payload[dedupe.targetSourceIdField!] = sourceId;
    const group = { payload, sources: [row], key };
    groups.push(group);
    if (key !== undefined) pending.set(key, group);
  }
  const checkInsert = (error: { code?: string; message: string } | null) => {
    if (error?.code === "23505") throw conflict(`${path}: conflicto de unicidad. Los niveles anteriores pueden estar creados; reintenta con deduplicacion.`);
    if (error) throw new Error(`${path}: no se pudo insertar el lote; los niveles anteriores pueden estar creados: ${error.message}`);
  };
  if (groups.length && !hasChildren) {
    const { error } = await from(target.table!).insert(groups.map((group) => group.payload));
    checkInsert(error);
  } else if (groups.length && dedupe) {
    const { data, error } = await from(target.table!).insert(groups.map((group) => group.payload)).select("*");
    checkInsert(error);
    const returned = new Map<string, Row>();
    for (const row of (data || []) as Row[]) {
      const key = pairKey(row[cfg.target.parentField], row[dedupe.targetSourceIdField!]);
      if (returned.has(key)) throw conflict(`${path}: respuesta de insercion ambigua`);
      returned.set(key, row);
    }
    for (const group of groups) {
      const inserted = returned.get(group.key!);
      if (!inserted) throw conflict(`${path}: no se pudo recuperar el padre insertado; comprueba SELECT/RLS antes de reintentar`);
      for (const row of group.sources) link(row, inserted[target.primaryKey]);
    }
  } else if (groups.length) {
    // Without a persisted correlation key, RETURNING order is not a safe mapping.
    // Only branching nodes need this fallback; leaves always remain bulk inserts.
    for (const group of groups) {
      const { data, error } = await from(target.table!).insert(group.payload).select("*").single();
      checkInsert(error);
      link(group.sources[0]!, (data as Row | null)?.[target.primaryKey]);
    }
  }
  stats.created = groups.length;
  for (const [index, child] of children.entries()) {
    const parentField = (child.cfg as CopyRelatedChild).source.parentField;
    const rows = await readForParents(from, child.source.table!, parentField, [...sourceIds.values()], child.source.primaryKey);
    const childEntries = rows.map((row) => {
      const parentId = destinations.get(String(row[parentField]));
      if (parentId === undefined) throw conflict(`${path}.children[${index}]: padre destino no encontrado`);
      return { row, parentId };
    });
    await copyTree(child, childEntries, from, levels, `${path}.children[${index}]`, level + 1);
  }
}
