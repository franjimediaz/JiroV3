export type PdfDocumentType =
  | "generic"
  | "invoice"
  | "receipt"
  | "quote"
  | "report"
  | "profitability-report";

export type PdfDatasetFilter = {
  field: string;
  op?: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";
  value?: any;
  valueFromPath?: string;
};

export type PdfDatasetSort = {
  field: string;
  direction?: "asc" | "desc";
};

export type PdfDatasetAggregate = {
  op: "sum" | "avg" | "count" | "min" | "max";
  field?: string;
  as: string;
};

export type PdfDatasetDefinition = {
  id: string;
  label?: string;
  source: "table" | "related" | "record";
  table?: string;
  relatedKey?: string;
  path?: string;
  filters?: PdfDatasetFilter[];
  sort?: PdfDatasetSort[];
  limit?: number;
  groupBy?: string;
  aggregates?: PdfDatasetAggregate[];
};

export type PdfBusinessBlockKind =
  | "documentHeader"
  | "company"
  | "customer"
  | "documentMeta"
  | "lineItems"
  | "totals"
  | "taxes"
  | "signature"
  | "notes"
  | "conditions"
  | "status"
  | "executiveSummary"
  | "kpi"
  | "dynamicTable"
  | "comparison"
  | "categoryGroup"
  | "footer";

export type PdfBusinessRow = {
  label: string;
  value: string;
  emphasis?: "normal" | "strong" | "muted";
};

export type PdfBusinessColumn = {
  label: string;
  value: string;
  align?: "left" | "center" | "right";
};

export type PdfMetricItem = {
  label: string;
  value: string;
  accent?: string;
  help?: string;
};

export type PdfBusinessBlock = {
  id: string;
  type: "business";
  kind: PdfBusinessBlockKind;
  title?: string;
  subtitle?: string;
  datasetId?: string;
  repeat?: string;
  rows?: PdfBusinessRow[];
  columns?: PdfBusinessColumn[];
  metrics?: PdfMetricItem[];
  groupByField?: string;
  compareLabelField?: string;
  compareValueField?: string;
  emptyText?: string;
  style?: Record<string, any>;
};

export type PdfChartType = "bar" | "line" | "pie" | "donut";

export type PdfChartBlock = {
  id: string;
  type: "chart";
  chartType: PdfChartType;
  title?: string;
  subtitle?: string;
  datasetId?: string;
  labelField: string;
  valueField: string;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  showLegend?: boolean;
  showValues?: boolean;
  colors?: string[];
  height?: number;
  style?: Record<string, any>;
};

export const PDF_DOCUMENT_TYPES: Array<{ value: PdfDocumentType; label: string }> = [
  { value: "generic", label: "Generico" },
  { value: "invoice", label: "Factura" },
  { value: "receipt", label: "Recibo" },
  { value: "quote", label: "Presupuesto" },
  { value: "report", label: "Informe" },
  { value: "profitability-report", label: "Informe de rentabilidad" },
];

export const PDF_BUSINESS_BLOCK_KIND_OPTIONS: Array<{ value: PdfBusinessBlockKind; label: string }> = [
  { value: "documentHeader", label: "Encabezado de documento" },
  { value: "company", label: "Empresa emisora" },
  { value: "customer", label: "Cliente / destinatario" },
  { value: "documentMeta", label: "Metadatos de documento" },
  { value: "lineItems", label: "Lineas / conceptos" },
  { value: "totals", label: "Totales y subtotales" },
  { value: "taxes", label: "Impuestos" },
  { value: "signature", label: "Firma" },
  { value: "notes", label: "Observaciones" },
  { value: "conditions", label: "Condiciones" },
  { value: "status", label: "Estado" },
  { value: "executiveSummary", label: "Resumen ejecutivo" },
  { value: "kpi", label: "KPI" },
  { value: "dynamicTable", label: "Tabla dinamica" },
  { value: "comparison", label: "Comparativa" },
  { value: "categoryGroup", label: "Agrupacion por categorias" },
  { value: "footer", label: "Pie de documento" },
];

export function defaultBusinessRowsForKind(kind: PdfBusinessBlockKind): PdfBusinessRow[] {
  switch (kind) {
    case "documentHeader":
      return [
        { label: "Titulo", value: "{{record.titulo}}", emphasis: "strong" },
        { label: "Subtitulo", value: "{{record.subtitulo}}", emphasis: "muted" },
      ];
    case "company":
      return [
        { label: "Empresa", value: "{{branding.nombre}}", emphasis: "strong" },
        { label: "CIF", value: "{{branding.cif}}" },
        { label: "Direccion", value: "{{branding.direccion}}" },
      ];
    case "customer":
      return [
        { label: "Cliente", value: "{{record.cliente_nombre}}", emphasis: "strong" },
        { label: "NIF", value: "{{record.cliente_dni}}" },
        { label: "Direccion", value: "{{record.cliente_direccion}}" },
      ];
    case "documentMeta":
      return [
        { label: "Serie", value: "{{record.serie}}" },
        { label: "Numero", value: "{{record.numero}}" },
        { label: "Fecha", value: "{{record.fecha}}" },
        { label: "Vencimiento", value: "{{record.fecha_vencimiento}}" },
      ];
    case "totals":
      return [
        { label: "Base imponible", value: "{{record.base_imponible}}" },
        { label: "Impuestos", value: "{{record.iva}}" },
        { label: "Total", value: "{{record.total}}", emphasis: "strong" },
      ];
    case "taxes":
      return [
        { label: "IVA", value: "{{record.iva}}" },
        { label: "Retenciones", value: "{{record.retenciones}}" },
      ];
    case "status":
      return [{ label: "Estado", value: "{{record.estado}}", emphasis: "strong" }];
    case "executiveSummary":
      return [{ label: "Resumen", value: "{{record.resumen}}" }];
    case "signature":
      return [{ label: "Firma", value: "{{record.firma}}" }];
    case "notes":
      return [{ label: "Observaciones", value: "{{record.observaciones}}" }];
    case "conditions":
      return [{ label: "Condiciones", value: "{{record.condiciones}}" }];
    case "footer":
      return [{ label: "Pie", value: "{{branding.website}}" }];
    default:
      return [];
  }
}

export function defaultBusinessColumnsForKind(kind: PdfBusinessBlockKind): PdfBusinessColumn[] {
  if (kind === "lineItems") {
    return [
      { label: "Concepto", value: "{{item.descripcion}}" },
      { label: "Cantidad", value: "{{item.cantidad}}", align: "right" },
      { label: "Precio", value: "{{item.precio}}", align: "right" },
      { label: "Total", value: "{{item.total}}", align: "right" },
    ];
  }

  if (kind === "dynamicTable") {
    return [
      { label: "Campo", value: "{{item.label}}" },
      { label: "Valor", value: "{{item.value}}", align: "right" },
    ];
  }

  return [];
}

export function defaultBusinessMetrics(): PdfMetricItem[] {
  return [
    { label: "Ingresos", value: "{{record.ingresos}}", accent: "#2563eb" },
    { label: "Costes", value: "{{record.costes}}", accent: "#dc2626" },
    { label: "Margen", value: "{{record.margen}}", accent: "#16a34a" },
  ];
}
