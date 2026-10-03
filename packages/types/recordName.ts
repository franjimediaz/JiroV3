type RecordNameSchema = {
  fields?: ReadonlyArray<{ name: string; recordName?: boolean }>;
  ui?: { displayField?: string };
  db?: { primaryKey?: string };
};

export function validateRecordNameFields(fields: ReadonlyArray<{ recordName?: unknown }>): void {
  if (fields.some(field => field.recordName !== undefined && typeof field.recordName !== "boolean")) throw new Error("recordName debe ser boolean");
  if (fields.filter(field => field.recordName === true).length > 1) throw new Error("Solo un campo por módulo puede estar marcado como Record name (recordName: true)");
}

export function getRecordNameField(schema?: RecordNameSchema | null) {
  return schema?.fields?.find(field => field.recordName === true);
}

export function getRecordNameFieldName(schema?: RecordNameSchema | null, legacyField?: string): string {
  return getRecordNameField(schema)?.name || legacyField || schema?.ui?.displayField || schema?.db?.primaryKey || "id";
}

/** Explicit names never fall through to an unrelated legacy column when empty. */
export function getRecordName(record: unknown, schema?: RecordNameSchema | null, options: { legacyField?: string; valueField?: string; fallback?: string } = {}): string {
  const row = record && typeof record === "object" ? record as Record<string, unknown> : {};
  const keys = [getRecordNameFieldName(schema, options.legacyField), options.valueField || schema?.db?.primaryKey || "id", "id"];
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    const text = typeof value === "object" ? (Array.isArray(value) ? value.map(String).join(", ") : "") : String(value);
    if (text?.trim()) return text;
  }
  return options.fallback || "";
}

export function updateRecordNameField<T extends { recordName?: boolean }>(fields: T[], index: number, next: T): T[] {
  return fields.map((field, i) => i === index ? next : next.recordName === true && field.recordName === true ? { ...field, recordName: false } : field);
}
