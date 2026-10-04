import { getEffectiveModuleCapabilities, type ReportDefinition, type ReportSource } from "@repo/types";
import { requireUser } from "../auth/getCurrentUser";
import { hasPermission } from "../auth/requirePermission";
import { requireModulePermission } from "../auth/requireModulePermission";
import { badRequest, forbidden } from "../auth/apiError";
import { resolveModuleConfig, resolveModuleIndex } from "../modules/resolveModuleConfig";
import { compileAdvancedFilters } from "../advancedFilters";
import { buildModuleDefaultFilterRuntimeContext } from "../moduleDefaultFilters";
import { parseReport } from "./definition";
import { transformReport } from "./transform";
import { resolveReportMetadata } from "./metadata";
import { buildReportQuery } from "./queryBuilder";
import { executeReportQuery } from "./executor";

export async function reportSources(): Promise<ReportSource[]> {
  const ctx = await requireUser();
  const {modulesBySlug} = await resolveModuleIndex();
  return Object.entries(modulesBySlug).filter(([slug, module]) => module.db?.table && hasPermission(ctx, `${slug}.ver`))
    .map(([slug, module]) => ({slug, name: module.nombre || slug, schema: module.schema}));
}

export async function prepareReport(input: unknown) {
  let report: ReportDefinition;
  try { report = parseReport(input); }
  catch (error) { throw badRequest(error instanceof Error ? error.message : "Informe no válido"); }
  const root = await resolveModuleConfig(report.sourceModule);
  const ctx = await requireModulePermission(root.permissionsKey, "ver");
  if (!root.table || !getEffectiveModuleCapabilities(root.schema).allowSearch) throw forbidden("Las consultas están deshabilitadas en este módulo");
  const runtime = await buildModuleDefaultFilterRuntimeContext(ctx.supabase);
  // Same schema/permission/operator/value compiler used by Consultas.
  const compiled = await compileAdvancedFilters(report.filters, root.schema, runtime);
  const metadata = await resolveReportMetadata(report);
  try {
    const query = buildReportQuery(report, metadata);
    return {report, root, ctx, runtime, compiled, metadata, query};
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "Consulta de informe no válida");
  }
}

export async function executeReport(input: unknown, preview: boolean) {
  const {report, ctx, runtime, compiled, query} = await prepareReport(input);
  const result = await executeReportQuery(query, {supabase: ctx.supabase, runtime, compiled});
  try { return transformReport(report, result.rows, preview); }
  catch (error) { throw badRequest(error instanceof Error ? error.message : "No se pudo agregar el informe"); }
}
