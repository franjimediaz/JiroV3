"use client";

import type { Field, ModuleSchema } from "@repo/types";

type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

type ImportRowResult = {
  index: number;
  payload?: Record<string, any>;
  errors: string[];
};

type ImportPreview = {
  payloads: Record<string, any>[];
  errors: string[];
};

const NON_IMPORTABLE_FIELD_TYPES = new Set(["ReverseLink", "formula", "file", "image"]);

export function buildCsvContent(
  columns: { name: string; label: string }[],
  rows: Record<string, string>[],
  delimiter = ";"
) {
  const header = columns.map((column) => escapeCsvCell(column.label, delimiter)).join(delimiter);
  const body = rows
    .map((row) => columns.map((column) => escapeCsvCell(row[column.name] ?? "", delimiter)).join(delimiter))
    .join("\r\n");

  return "\uFEFF" + header + (body ? `\r\n${body}` : "");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function readTextFile(file: File) {
  return file.text();
}

export function getImportableFields(
  schema: ModuleSchema,
  options?: { includePrimaryKey?: boolean }
) {
  const primaryKey = schema.db.primaryKey || "id";
  const includePrimaryKey = options?.includePrimaryKey === true;

  return (schema.fields || []).filter((field) => {
    if (field.virtual === true) return false;
    if (field.readOnly) return false;
    if (field.name === primaryKey && !includePrimaryKey) return false;
    if (field.name === "created_at" || field.name === "updated_at") return false;
    if (NON_IMPORTABLE_FIELD_TYPES.has(field.type)) return false;
    if (field.compute && (field.compute as any).persist === "none") return false;
    return true;
  });
}

export function parseCsv(text: string, delimiter = ";"): ParsedCsv {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  const input = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      currentCell += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }
    if (char === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentCell = "";
      currentRow = [];
      continue;
    }
    currentCell += char;
  }

  if (inQuotes) throw new Error("El CSV tiene comillas sin cerrar.");

  currentRow.push(currentCell);
  const hasData = currentRow.some((cell) => cell !== "") || rows.length === 0;
  if (hasData) rows.push(currentRow);

  const normalizedRows = rows.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (!normalizedRows.length) throw new Error("El archivo CSV esta vacio.");

  const [headers, ...dataRows] = normalizedRows;
  return {
    headers: headers.map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim()),
    rows: dataRows,
  };
}

export function buildImportPreview(args: {
  schema: ModuleSchema;
  headers: string[];
  rows: string[][];
}): ImportPreview {
  const importableFields = getImportableFields(args.schema, { includePrimaryKey: true });
  const fieldsByHeader = new Map<string, Field>();

  for (const field of importableFields) {
    fieldsByHeader.set(normalizeHeader(field.name), field);
    fieldsByHeader.set(normalizeHeader(field.label), field);
  }

  const mappedFields: Field[] = [];
  const headerErrors: string[] = [];
  const seenFields = new Set<string>();

  args.headers.forEach((header) => {
    const field = fieldsByHeader.get(normalizeHeader(header));
    if (!field) {
      headerErrors.push(`La columna "${header}" no existe o no es importable en este modulo.`);
      return;
    }
    if (seenFields.has(field.name)) {
      headerErrors.push(`La columna "${header}" esta duplicada o apunta al mismo campo "${field.label}".`);
      return;
    }
    seenFields.add(field.name);
    mappedFields.push(field);
  });

  const requiredMissing = importableFields
    .filter((field) => field.required && field.defaultValue === undefined)
    .filter((field) => !seenFields.has(field.name))
    .map((field) => `Falta la columna requerida "${field.label}".`);

  if (headerErrors.length || requiredMissing.length) {
    return { payloads: [], errors: [...headerErrors, ...requiredMissing] };
  }

  const rowResults = args.rows.map((row, index) =>
    coerceImportRow({
      row,
      rowIndex: index + 2,
      fields: mappedFields,
      schema: args.schema,
    })
  );

  const payloads = rowResults.flatMap((result) => (result.payload ? [result.payload] : []));
  const errors = rowResults.flatMap((result) => result.errors);

  return { payloads, errors };
}

export function buildCsvFilename(moduleSlug: string, schema: ModuleSchema) {
  const base = schema.db.name || schema.db.table || moduleSlug || "export";
  const safeBase = normalizeHeader(base).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "export";
  const date = new Date().toISOString().slice(0, 10);
  return `${safeBase}-${date}.csv`;
}

export function formatFieldValueForExport(value: any, field?: Field) {
  if (value === null || value === undefined || value === "") return "";
  if (!field) return stringifyScalar(value);

  switch (field.type) {
    case "boolean":
      return value ? "Si" : "No";

    case "date":
    case "datetime": {
      try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return stringifyScalar(value);
        return field.type === "date" ? date.toISOString().slice(0, 10) : date.toISOString();
      } catch {
        return stringifyScalar(value);
      }
    }

    case "multiselect":
      return Array.isArray(value) ? value.join(" | ") : stringifyScalar(value);

    default:
      return stringifyScalar(value);
  }
}

function coerceImportRow(args: {
  row: string[];
  rowIndex: number;
  fields: Field[];
  schema: ModuleSchema;
}): ImportRowResult {
  const payload: Record<string, any> = {};
  const errors: string[] = [];

  args.fields.forEach((field, columnIndex) => {
    const rawValue = (args.row[columnIndex] ?? "").trim();
    const parsed = parseCellValue(rawValue, field);

    if (parsed.error) {
      errors.push(`Fila ${args.rowIndex}, columna "${field.label}": ${parsed.error}`);
      return;
    }

    payload[field.name] = parsed.value;
  });

  const requiredErrors = getImportableFields(args.schema)
    .filter((field) => field.required && field.defaultValue === undefined)
    .filter((field) => isEmptyValue(payload[field.name], field))
    .map((field) => `Fila ${args.rowIndex}: el campo requerido "${field.label}" esta vacio.`);

  if (requiredErrors.length) errors.push(...requiredErrors);

  if (errors.length) return { index: args.rowIndex, errors };
  return { index: args.rowIndex, payload, errors: [] };
}

function parseCellValue(rawValue: string, field: Field): { value: any; error?: string } {
  if (rawValue === "") {
    if (field.type === "multiselect") return { value: [] };
    return { value: null };
  }

  switch (field.type) {
    case "number":
    case "money":
    case "percent": {
      const normalized = rawValue.replace(",", ".");
      const parsed = Number(normalized);
      if (Number.isNaN(parsed)) return { value: null, error: "debe ser un numero valido." };
      return { value: parsed };
    }

    case "boolean": {
      const normalized = normalizeHeader(rawValue);
      if (["true", "1", "si", "sí", "yes"].includes(normalized)) return { value: true };
      if (["false", "0", "no"].includes(normalized)) return { value: false };
      return { value: null, error: 'debe ser "true/false", "si/no" o "1/0".' };
    }

    case "date":
    case "datetime": {
      const parsed = new Date(rawValue);
      if (Number.isNaN(parsed.getTime())) return { value: null, error: "debe ser una fecha valida." };
      return { value: rawValue };
    }

    case "multiselect": {
      if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
        try {
          const parsed = JSON.parse(rawValue);
          if (!Array.isArray(parsed)) {
            return { value: null, error: "debe ser un array JSON o una lista separada por |." };
          }
          return { value: parsed.map((entry) => String(entry).trim()).filter(Boolean) };
        } catch {
          return { value: null, error: "tiene un JSON invalido." };
        }
      }
      return {
        value: rawValue
          .split("|")
          .map((entry) => entry.trim())
          .filter(Boolean),
      };
    }

    case "selectorTabla":
    case "select":
    case "text":
    case "textarea":
    case "color":
    case "iconpicker":
      return { value: rawValue };

    default:
      return { value: rawValue };
  }
}

function isEmptyValue(value: any, field: Field) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (field.type === "multiselect") return !Array.isArray(value) || value.length === 0;
  return false;
}

function escapeCsvCell(value: string, delimiter: string) {
  const normalized = String(value ?? "");
  if (!(normalized.includes(delimiter) || normalized.includes('"') || normalized.includes("\n"))) return normalized;
  return `"${normalized.replace(/"/g, '""')}"`;
}

function normalizeHeader(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function stringifyScalar(value: any) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

