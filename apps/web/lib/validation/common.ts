import { badRequest } from "@/lib/auth/apiError";

export function asRecord(value: unknown, message = "JSON invalido"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest(message);
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, field: string, maxLength = 200) {
  if (typeof value !== "string") throw badRequest(`${field} es requerido`);
  const trimmed = value.trim();
  if (!trimmed) throw badRequest(`${field} es requerido`);
  if (trimmed.length > maxLength) throw badRequest(`${field} es demasiado largo`);
  return trimmed;
}

export function optionalString(value: unknown, field: string, maxLength = 200) {
  if (value == null || value === "") return undefined;
  return requiredString(value, field, maxLength);
}

export function requiredUuid(value: unknown, field: string) {
  const text = requiredString(value, field, 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw badRequest(`${field} debe ser uuid`);
  }
  return text;
}

export function boundedNumber(value: unknown, field: string, min: number, max: number, fallback: number) {
  const num = value == null || value === "" ? fallback : Number(value);
  if (!Number.isFinite(num)) throw badRequest(`${field} invalido`);
  return Math.max(min, Math.min(max, Math.trunc(num)));
}
