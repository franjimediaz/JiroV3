import type { ModuleSchema, ReportDefinition, ReportSource } from "@repo/types";

export async function reportRequest(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, { method, cache: "no-store", headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = await response.json();
  if (!response.ok) throw Error(json.error?.message || "No se pudo completar la operación");
  return json;
}

// Presentation aliases only: saved definitions retain their original shape.
export function reportListRow(report: ReportDefinition, schema: ModuleSchema, sources: ReportSource[]) {
  const sourceName = sources.find(source => source.slug === report.sourceModule)?.name || report.sourceModule;
  const values: Record<string, unknown> = { ...report, nombre: report.name, descripcion: report.description,
    tipo: report.type, source_module: report.sourceModule, modulo: report.sourceModule,
    typeLabel: report.type === "list" ? "Lista" : "Matrix", sourceName };
  return { ...Object.fromEntries(schema.fields.map(field => [field.name, values[field.name] ?? null])),
    [schema.db.primaryKey || "id"]: report.id };
}
