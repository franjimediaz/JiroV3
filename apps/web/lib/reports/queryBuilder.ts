import { reportColumns, type ReportDefinition, type ReportMetadata, type ReportQuery } from "@repo/types";

/** Pure logical query builder. It never emits SQL or accepts physical identifiers from the definition. */
export function buildReportQuery(report: ReportDefinition, metadata: ReportMetadata): ReportQuery {
  if (report.sourceModule !== metadata.source.module) throw Error("La metadata no corresponde al módulo del informe");
  const resolved = new Map(metadata.fields.map(field => [field.id, field]));
  const fields = reportColumns(report).map(column => {
    const field = resolved.get(column.id);
    if (!field) throw Error(`No se resolvió la metadata de ${column.label}`);
    if (!field.aggregations.includes(column.aggregation)) throw Error(`Agregación incompatible con ${column.label}`);
    return { id: column.id, label: column.label, module: field.module, table: field.table, field: field.field.name,
      fieldType: field.field.type, relationPath: field.relations, aggregation: column.aggregation };
  });
  const ids = new Set(fields.map(field => field.id));
  if (report.sort.some(sort => !ids.has(sort.columnId))) throw Error("Ordenación no válida");
  const aggregate = fields.some(field => field.aggregation !== "none");
  const configuredGroup = report.type === "list" ? report.config.groupBy : undefined;
  const dimensions = aggregate ? fields.filter(field => field.aggregation === "none").map(field => field.id) : [];
  const groupBy = configuredGroup || dimensions;
  if (groupBy.some(id => !ids.has(id) || fields.find(field => field.id === id)?.aggregation !== "none")) throw Error("Agrupación incompatible");
  if (configuredGroup && (configuredGroup.length !== dimensions.length || dimensions.some(id => !configuredGroup.includes(id))))
    throw Error("Todos los campos sin agregación deben formar parte de groupBy");
  const limit = report.type === "list" ? report.config.limit ?? 1000 : 1000;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw Error("Límite no válido");
  return { source: metadata.source, fields, filters: report.filters, sort: report.sort, groupBy, limit };
}
