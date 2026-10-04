import { reportAggregations, reportColumns, reportFields, reportRelationPath,
  type ReportDefinition, type ReportMetadata, type ResolvedReportField, type ResolvedReportRelation } from "@repo/types";
import { badRequest } from "../auth/apiError";
import { requireModulePermission } from "../auth/requireModulePermission";
import { resolveModuleConfig, type ResolvedModuleConfig } from "../modules/resolveModuleConfig";
import { filterIdentifier } from "../advancedFilters";

type Dependencies = {
  resolveModuleConfig: typeof resolveModuleConfig;
  requireModulePermission: typeof requireModulePermission;
};
const defaults: Dependencies = { resolveModuleConfig, requireModulePermission };

/** Resolves client field references only through trusted ModuleSchema metadata. */
export async function resolveReportMetadata(report: ReportDefinition, dependencies: Dependencies = defaults): Promise<ReportMetadata> {
  const cache = new Map<string, ResolvedModuleConfig>();
  const resolve = async (slug: string) => {
    let resolvedModule = cache.get(slug);
    if (!resolvedModule) {
      const loaded = await dependencies.resolveModuleConfig(slug);
      resolvedModule = loaded.slug ? loaded : {...loaded, slug};
      await dependencies.requireModulePermission(resolvedModule.permissionsKey, "ver");
      if (!resolvedModule.table) throw badRequest("El módulo no apunta a una tabla");
      filterIdentifier(resolvedModule.table); filterIdentifier(resolvedModule.primaryKey);
      cache.set(slug, resolvedModule);
    }
    return resolvedModule;
  };
  const root = await resolve(report.sourceModule);
  const fields: ResolvedReportField[] = [];
  for (const column of reportColumns(report)) {
    if (column.ref.module && column.ref.module !== report.sourceModule) throw badRequest("El módulo del campo no coincide con el origen");
    const path = reportRelationPath(column.ref);
    if (path.length > 2) throw badRequest("Las relaciones de informes admiten un máximo de 2 niveles");
    let current = root;
    const relations: ResolvedReportRelation[] = [];
    for (const relationName of path) {
      const relation = reportFields(current.schema).find(field => field.name === relationName);
      if (!relation || relation.type !== "selectorTabla" || relation.ref.multiple) throw badRequest("Relación no permitida en el informe");
      filterIdentifier(relation.name);
      const target = await resolve(relation.ref.moduleSlug);
      relations.push({ field: relation.name, module: target.slug, table: target.table!, sourceField: relation, schema: target.schema });
      current = target;
    }
    const field = reportFields(current.schema).find(candidate => candidate.name === column.ref.field);
    if (!field) throw badRequest("Campo de informe no declarado o no disponible");
    filterIdentifier(field.name);
    fields.push({ id: column.id, ref: column.ref, module: current.slug, table: current.table!, field,
      relations, aggregations: reportAggregations(field) });
  }
  return { source: { module: root.slug, table: root.table!, primaryKey: root.primaryKey, schema: root.schema }, fields };
}
