import type { ReportQuery, ReportQueryResult, ReportScalar } from "@repo/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { badRequest } from "../auth/apiError";
import { defaultFilterExpression, filterIdentifier } from "../advancedFilters";
import { resolveDefaultFiltersForQuery } from "../moduleDefaultFilters";

type CompiledFilters = { expression?: string; embeds: Array<{ alias: string; select: string; expression: string }> };
type ExecutionContext = {
  supabase: SupabaseClient;
  runtime: Parameters<typeof resolveDefaultFiltersForQuery>[1];
  compiled: CompiledFilters;
};

function selectExpression(field: ReportQuery["fields"][number], index: number) {
  if (!field.relationPath.length) return { select: filterIdentifier(field.field), aliases: [] as string[] };
  const aliases = field.relationPath.map((_, depth) => `jiro_report_${index}_${depth}`);
  let select = filterIdentifier(field.field);
  for (let depth = field.relationPath.length - 1; depth >= 0; depth--) {
    const relation = field.relationPath[depth]!;
    select = `${aliases[depth]}:${filterIdentifier(relation.table)}!${filterIdentifier(relation.field)}(${select})`;
  }
  // Preserve the established alias for one-hop reports.
  if (aliases.length === 1) {
    select = select.replace("jiro_report_" + index + "_0:", "jiro_report_" + index + ":");
    aliases[0] = `jiro_report_${index}`;
  }
  return { select, aliases };
}

function scalarAt(row: Record<string, unknown>, aliases: string[], field: string): ReportScalar {
  let value: unknown = row;
  for (const alias of aliases) {
    if (Array.isArray(value)) throw badRequest("El informe solo admite relaciones directas a un registro");
    value = value && typeof value === "object" ? (value as Record<string, unknown>)[alias] : null;
  }
  if (Array.isArray(value)) throw badRequest("El informe solo admite relaciones directas a un registro");
  value = value && typeof value === "object" ? (value as Record<string, unknown>)[field] : null;
  if (value != null && !["string", "number", "boolean"].includes(typeof value)) throw badRequest("El campo no contiene valores escalares");
  return value as ReportScalar ?? null;
}

/** Executes an already validated logical query through Supabase/PostgREST. */
export async function executeReportQuery(query: ReportQuery, context: ExecutionContext): Promise<ReportQueryResult> {
  const primaryKey = filterIdentifier(query.source.primaryKey);
  const select = new Set([primaryKey]);
  const paths = new Map<string, string[]>();
  const relatedDefaults: Array<{ referencedTable: string; expression: string }> = [];
  query.fields.forEach((field, index) => {
    const expression = selectExpression(field, index);
    select.add(expression.select); paths.set(field.id, expression.aliases);
    field.relationPath.forEach((relation, depth) => {
      const defaults = defaultFilterExpression(resolveDefaultFiltersForQuery(relation.schema.db.defaultFilters, context.runtime).group, relation.schema);
      if (defaults) relatedDefaults.push({ referencedTable: expression.aliases.slice(0, depth + 1).join("."), expression: defaults });
    });
  });
  context.compiled.embeds.forEach(embed => select.add(embed.select));
  const rootDefault = defaultFilterExpression(resolveDefaultFiltersForQuery(query.source.schema.db.defaultFilters, context.runtime).group, query.source.schema);
  const expressions = [context.compiled.expression, rootDefault].filter(Boolean);
  const rows: Record<string, ReportScalar>[] = [];
  let total = 0;
  const signal = AbortSignal.timeout(15000);
  for (let request = 0; request < 20; request++) {
    let postgrest = context.supabase.from(filterIdentifier(query.source.table)).select([...select].join(","), { count: "exact" })
      .order(primaryKey).range(rows.length, rows.length + 999).abortSignal(signal);
    for (const embed of context.compiled.embeds) postgrest = postgrest.or(embed.expression, { referencedTable: embed.alias });
    for (const defaults of relatedDefaults) postgrest = postgrest.or(defaults.expression, { referencedTable: defaults.referencedTable });
    if (expressions.length) postgrest = postgrest.or(`and(${expressions.join(",")})`);
    const { data, error, count } = await postgrest;
    if (error) {
      if (["PGRST200", "PGRST201"].includes(error.code)) throw badRequest("La relación configurada no tiene una FK reconocida e inequívoca. Revisa el schema del módulo.");
      throw badRequest("No se pudo ejecutar el informe. Revisa sus campos y relaciones o reduce los filtros.");
    }
    if (count === null || count > 5000) throw badRequest("El informe supera 5.000 registros de origen. Añade filtros antes de ejecutarlo.");
    if (request > 0 && count !== total) throw badRequest("Los datos han cambiado durante la consulta. Ejecuta de nuevo el informe.");
    total = count;
    for (const item of data || []) {
      const row = item as unknown as Record<string, unknown>;
      rows.push(Object.fromEntries(query.fields.map(field => [field.id, scalarAt(row, paths.get(field.id) || [], field.field)])));
    }
    if (rows.length >= total) break;
    if (!data?.length || request === 19) throw badRequest("No se pudo leer el conjunto completo. Reduce los filtros.");
  }
  return { rows, total, scanned: rows.length, truncated: false };
}
