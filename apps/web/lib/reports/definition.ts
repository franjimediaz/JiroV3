import type { ReportColumn, ReportDefinition, ReportFilter, ReportSort } from "@repo/types";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Configuración de informe no válida");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = true): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw Error("Texto de informe no válido");
  return value.trim();
}
function columns(value: unknown, min: number, max: number): ReportColumn[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw Error(`Esta zona requiere entre ${min} y ${max} campos`);
  return value.map(input => {
    const column = object(input), ref = object(column.ref);
    const aggregation = text(column.aggregation, 20) as ReportColumn["aggregation"];
    if (!["none", "count", "countDistinct", "sum", "avg", "min", "max"].includes(aggregation)) throw Error("Agregación no válida");
    return {id: text(column.id, 60), label: text(column.label, 120), aggregation,
      ref: {field: text(ref.field, 100), ...(ref.relation !== undefined ? {relation: text(ref.relation, 100)} : {})}};
  });
}
export function parseReport(input: unknown): ReportDefinition {
  const encoded = JSON.stringify(input);
  if (!encoded) throw Error("Definición de informe no válida");
  if (encoded.length > 64000) throw Error("La definición supera 64 KB");
  const value = object(input), config = object(value.config);
  const base = {name: text(value.name, 120), description: text(value.description ?? "", 2000, false), sourceModule: text(value.sourceModule, 100),
    filters: object(value.filters) as ReportFilter, sort: [] as ReportSort[]};
  let report: ReportDefinition;
  if (value.type === "list") report = {...base, type: "list", config: {columns: columns(config.columns, 1, 20)}};
  else if (value.type === "matrix") report = {...base, type: "matrix", config: {
    rows: columns(config.rows, 1, 2), columns: columns(config.columns, 1, 2), values: columns(config.values, 1, 5),
  }};
  else throw Error("Tipo de informe no válido");
  const all = report.type === "list" ? report.config.columns : [...report.config.rows, ...report.config.columns, ...report.config.values];
  if (new Set(all.map(column => column.id)).size !== all.length || all.some(column => !/^[a-zA-Z0-9_-]+$/.test(column.id))) throw Error("Identificadores de columnas no válidos o duplicados");
  if (report.type === "matrix" && ([...report.config.rows, ...report.config.columns].some(column => column.aggregation !== "none") || report.config.values.some(column => column.aggregation === "none")))
    throw Error("La matriz necesita dimensiones sin agregación y valores agregados");
  if (!Array.isArray(value.sort) || value.sort.length > 3) throw Error("Máximo tres campos de ordenación");
  report.sort = value.sort.map(inputSort => {
    const sort = object(inputSort);
    if (sort.direction !== "asc" && sort.direction !== "desc") throw Error("Orden no válido");
    if (report.type !== "list" || !report.config.columns.some(column => column.id === sort.columnId)) throw Error("Columna de ordenación no válida");
    return {columnId: String(sort.columnId), direction: sort.direction};
  });
  return report;
}
