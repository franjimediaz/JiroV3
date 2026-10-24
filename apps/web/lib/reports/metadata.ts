import {
  MAX_FIELD_REF_DEPTH,
  reportAggregations,
  reportColumns,
  reportFields,
  reportRelationPath,
  type ReportDefinition,
  type ReportMetadata,
  type ResolvedReportField,
  type ResolvedReportRelation,
} from "@repo/types";
import { badRequest } from "../auth/apiError";
import { requireModulePermission } from "../auth/requireModulePermission";
import { filterIdentifier } from "../advancedFilters";
import { resolveFieldRefs } from "../fields/resolveFieldRef";
import { resolveModuleConfig } from "../modules/resolveModuleConfig";

type Dependencies = {
  resolveModuleConfig: typeof resolveModuleConfig;
  requireModulePermission: typeof requireModulePermission;
};

const defaults: Dependencies = { resolveModuleConfig, requireModulePermission };

/** Resolves report references through the shared, permission-aware FieldRef resolver. */
export async function resolveReportMetadata(
  report: ReportDefinition,
  dependencies: Dependencies = defaults,
): Promise<ReportMetadata> {
  const columns = reportColumns(report);
  for (const column of columns) {
    if (column.ref.module && column.ref.module !== report.sourceModule) {
      throw badRequest("El módulo del campo no coincide con el origen");
    }
    if (reportRelationPath(column.ref).length > MAX_FIELD_REF_DEPTH) {
      throw badRequest(`Las relaciones de informes admiten un máximo de ${MAX_FIELD_REF_DEPTH} niveles`);
    }
  }

  const resolved = await resolveFieldRefs(
    report.sourceModule,
    columns.map(column => column.ref),
    dependencies,
  );
  const root = resolved[0]!.sourceModule;
  filterIdentifier(root.table!);
  filterIdentifier(root.primaryKey);

  const fields: ResolvedReportField[] = columns.map((column, index) => {
    const item = resolved[index]!;
    const field = reportFields(item.targetModule.schema).find(candidate => candidate.name === item.field);
    if (!field) throw badRequest("Campo de informe no declarado o no disponible");
    filterIdentifier(field.name);
    const relations: ResolvedReportRelation[] = item.relations.map(relation => ({
      field: relation.field,
      module: relation.moduleSlug,
      table: relation.table,
      sourceField: relation.fieldSchema,
      schema: relation.schema,
    }));
    return {
      id: column.id,
      ref: column.ref,
      module: item.targetModule.slug,
      table: item.targetTable,
      field,
      relations,
      aggregations: reportAggregations(field),
    };
  });

  return {
    source: {
      module: root.slug,
      table: root.table!,
      primaryKey: root.primaryKey,
      schema: root.schema,
    },
    fields,
  };
}
