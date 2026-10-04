import type { AdvancedFilterGroup } from "./advancedFilters";
import type { Field, ModuleSchema } from "./fields";

export type ReportAggregation = "none" | "count" | "countDistinct" | "sum" | "avg" | "min" | "max";
export type ReportFieldRef = {
  /** Must match ReportDefinition.sourceModule; retained on the ref for portable definitions. */
  module?: string;
  field: string;
  /** Legacy one-hop representation. */
  relation?: string;
  /** Configured selectorTabla field names, never table or FK names. */
  relations?: string[];
  alias?: string;
  label?: string;
};
export type ReportSource = { slug: string; name: string; schema: ModuleSchema };
export type ReportFilter = AdvancedFilterGroup;
export type ReportSort = { columnId: string; direction: "asc" | "desc" };
export type ReportColumn = { id: string; ref: ReportFieldRef; label: string; aggregation: ReportAggregation };
export type ListReportConfig = { columns: ReportColumn[]; groupBy?: string[]; limit?: number };
export type MatrixReportConfig = { rows: ReportColumn[]; columns: ReportColumn[]; values: ReportColumn[] };
type ReportBase = {
  id?: string; name: string; description: string; sourceModule: string;
  filters: ReportFilter; sort: ReportSort[]; created_at?: string; updated_at?: string;
};
export type ReportDefinition = ReportBase & (
  { type: "list"; config: ListReportConfig } | { type: "matrix"; config: MatrixReportConfig }
);
export type ResolvedReportRelation = {
  field: string;
  module: string;
  table: string;
  sourceField: Field;
  schema: ModuleSchema;
};
export type ResolvedReportField = {
  id: string;
  ref: ReportFieldRef;
  module: string;
  table: string;
  field: Field;
  relations: ResolvedReportRelation[];
  aggregations: ReportAggregation[];
};
export type ReportMetadata = {
  source: { module: string; table: string; primaryKey: string; schema: ModuleSchema };
  fields: ResolvedReportField[];
};
export type ReportQueryField = {
  id: string;
  label: string;
  module: string;
  table: string;
  field: string;
  fieldType: Field["type"];
  relationPath: ResolvedReportRelation[];
  aggregation: ReportAggregation;
};
export type ReportQuery = {
  source: ReportMetadata["source"];
  fields: ReportQueryField[];
  filters: ReportFilter;
  sort: ReportSort[];
  groupBy: string[];
  limit: number;
};
export type ReportQueryResult = {
  rows: Record<string, ReportScalar>[];
  total: number;
  scanned: number;
  truncated: boolean;
};
export type ReportFieldOption = { ref: ReportFieldRef; label: string; field: Field };
export type ReportScalar = string | number | boolean | null;
export type ReportResult = {
  type: "list"; columns: { id: string; label: string }[]; rows: Record<string, ReportScalar>[];
  total: number; truncated: boolean; scanned: number;
} | {
  type: "matrix"; rowLabels: string[][]; columnLabels: string[][]; valueLabels: string[];
  cells: ReportScalar[][][]; rowTotals: ReportScalar[][]; columnTotals: ReportScalar[][];
  totals: ReportScalar[]; scanned: number;
};

export const reportRelationPath = (ref: ReportFieldRef) => ref.relations || (ref.relation ? [ref.relation] : []);
export const reportFieldKey = (ref: ReportFieldRef) => JSON.stringify([ref.module || "", reportRelationPath(ref), ref.field]);
export function reportFields(schema: ModuleSchema): Field[] {
  return schema.fields.filter(field => !field.virtual && field.visible !== false &&
    ["text", "textarea", "number", "money", "percent", "date", "datetime", "boolean", "select", "selectorTabla", "color"].includes(field.type) &&
    !(field.type === "selectorTabla" && field.ref.multiple));
}
export function reportFieldOptions(source: ReportSource, sources: ReportSource[]): ReportFieldOption[] {
  return reportFields(source.schema).flatMap(field => {
    const options: ReportFieldOption[] = [{ ref: {field: field.name}, label: field.label || field.name, field }];
    const target = field.type === "selectorTabla" ? sources.find(item => item.slug === field.ref.moduleSlug) : undefined;
    if (target) options.push(...reportFields(target.schema).map(child => ({
      ref: {relation: field.name, field: child.name}, label: `${field.label || target.name} > ${child.label || child.name}`, field: child,
    })));
    return options;
  });
}
export function reportAggregations(field: Field): ReportAggregation[] {
  if (["number", "money", "percent"].includes(field.type)) return ["none", "count", "countDistinct", "sum", "avg", "min", "max"];
  if (["text", "textarea", "date", "datetime", "select"].includes(field.type)) return ["none", "count", "countDistinct", "min", "max"];
  return ["none", "count", "countDistinct"];
}
export function reportColumns(report: ReportDefinition): ReportColumn[] {
  return report.type === "list" ? report.config.columns : [...report.config.rows, ...report.config.columns, ...report.config.values];
}
