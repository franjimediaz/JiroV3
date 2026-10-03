import { getEffectiveModuleCapabilities, reportAggregations, reportColumns, reportFields, type ReportDefinition, type ReportScalar, type ReportSource } from "@repo/types";
import { requireUser } from "../auth/getCurrentUser";
import { hasPermission } from "../auth/requirePermission";
import { requireModulePermission } from "../auth/requireModulePermission";
import { badRequest, forbidden } from "../auth/apiError";
import { resolveModuleConfig, resolveModuleIndex } from "../modules/resolveModuleConfig";
import { compileAdvancedFilters, defaultFilterExpression, filterIdentifier } from "../advancedFilters";
import { buildModuleDefaultFilterRuntimeContext, resolveDefaultFiltersForQuery } from "../moduleDefaultFilters";
import { parseReport } from "./definition";
import { transformReport } from "./transform";

export async function reportSources(): Promise<ReportSource[]> {
  const ctx = await requireUser();
  const {modulesBySlug} = await resolveModuleIndex();
  return Object.entries(modulesBySlug).filter(([slug, module]) => module.db?.table && hasPermission(ctx, `${slug}.ver`))
    .map(([slug, module]) => ({slug, name: module.nombre || slug, schema: module.schema}));
}

export async function prepareReport(input: unknown) {
  let report: ReportDefinition;
  try { report = parseReport(input); } catch (error) { throw badRequest(error instanceof Error ? error.message : "Informe no válido"); }
  const root = await resolveModuleConfig(report.sourceModule);
  const ctx = await requireModulePermission(root.permissionsKey, "ver");
  if (!root.table || !getEffectiveModuleCapabilities(root.schema).allowSearch) throw forbidden("Las consultas están deshabilitadas en este módulo");
  const runtime = await buildModuleDefaultFilterRuntimeContext(ctx.supabase);
  const compiled = await compileAdvancedFilters(report.filters, root.schema, runtime);
  const configs = new Map<string, ReturnType<typeof resolveModuleConfig>>();
  const columns = await Promise.all(reportColumns(report).map(async column => {
    let target = root;
    if (column.ref.relation) {
      const relation = reportFields(root.schema).find(field => field.name === column.ref.relation);
      if (!relation || relation.type !== "selectorTabla" || relation.ref.multiple) throw badRequest("Relación no permitida");
      const slug = relation.ref.moduleSlug;
      if (!configs.has(slug)) configs.set(slug, (async () => {
        const resolved = await resolveModuleConfig(slug);
        await requireModulePermission(resolved.permissionsKey, "ver");
        return resolved;
      })());
      target = await configs.get(slug)!;
      if (!target.table) throw badRequest("La relación no apunta a una tabla");
      filterIdentifier(relation.name);
    }
    const field = reportFields(target.schema).find(field => field.name === column.ref.field);
    if (!field) throw badRequest("Campo de informe no declarado o no disponible");
    if (!reportAggregations(field).includes(column.aggregation)) throw badRequest(`Agregación incompatible con ${field.label || field.name}`);
    filterIdentifier(field.name); filterIdentifier(target.table!);
    return {column, field, target};
  }));
  return {report, root, ctx, runtime, compiled, columns};
}

export async function executeReport(input: unknown, preview: boolean) {
  const {report, root, ctx, runtime, compiled, columns} = await prepareReport(input);
  const primaryKey = filterIdentifier(root.primaryKey);
  const select = new Set([primaryKey]);
  const related: {alias: string; expression?: string}[] = [];
  const aliases = new Map<string, string>();
  columns.forEach(({column, field, target}, index) => {
    if (!column.ref.relation) { select.add(field.name); return; }
    let alias = `jiro_report_${index}`;
    while (root.schema.fields.some(field => field.name === alias)) alias += "_";
    aliases.set(column.id, alias);
    select.add(`${alias}:${filterIdentifier(target.table!)}!${filterIdentifier(column.ref.relation)}(${field.name})`);
    related.push({alias, expression: defaultFilterExpression(resolveDefaultFiltersForQuery(target.schema.db.defaultFilters, runtime).group, target.schema)});
  });
  compiled.embeds.forEach(embed => select.add(embed.select));
  const expressions = [compiled.expression, defaultFilterExpression(resolveDefaultFiltersForQuery(root.schema.db.defaultFilters, runtime).group, root.schema)].filter(Boolean);
  const signal = AbortSignal.timeout(15000);
  const rows: Record<string, ReportScalar>[] = [];
  let total = 0;
  for (let request = 0; request < 20; request++) {
    let query = ctx.supabase.from(filterIdentifier(root.table!)).select([...select].join(","), {count: "exact"}).order(primaryKey).range(rows.length, rows.length + 999).abortSignal(signal);
    for (const embed of compiled.embeds) query = query.or(embed.expression, {referencedTable: embed.alias});
    for (const embed of related) if (embed.expression) query = query.or(embed.expression, {referencedTable: embed.alias});
    if (expressions.length) query = query.or(`and(${expressions.join(",")})`);
    const {data, error, count} = await query;
    if (error) {
      if (["PGRST200", "PGRST201"].includes(error.code)) throw badRequest("La relación configurada no tiene una FK reconocida e inequívoca. Revisa el schema del módulo.");
      throw badRequest("No se pudo ejecutar el informe. Revisa sus campos y relaciones o reduce los filtros.");
    }
    if (count === null || count > 5000) throw badRequest("El informe supera 5.000 registros de origen. Añade filtros antes de ejecutarlo.");
    if (request > 0 && count !== total) throw badRequest("Los datos han cambiado durante la consulta. Ejecuta de nuevo el informe.");
    total = count;
    for (const inputRow of data || []) {
      const row = inputRow as unknown as Record<string, unknown>;
      rows.push(Object.fromEntries(columns.map(({column, field}) => {
        const embedded = aliases.has(column.id) ? row[aliases.get(column.id)!] : row;
        if (Array.isArray(embedded)) throw badRequest("El informe solo admite relaciones directas a un registro");
        const value = embedded && typeof embedded === "object" ? (embedded as Record<string, unknown>)[field.name] : null;
        if (value != null && !["string", "number", "boolean"].includes(typeof value)) throw badRequest("El campo no contiene valores escalares");
        return [column.id, value ?? null];
      })) as Record<string, ReportScalar>);
    }
    if (rows.length >= total) break;
    if (!data?.length || request === 19) throw badRequest("No se pudo leer el conjunto completo. Reduce los filtros.");
  }
  try { return transformReport(report, rows, preview); }
  catch (error) { throw badRequest(error instanceof Error ? error.message : "No se pudo agregar el informe"); }
}
