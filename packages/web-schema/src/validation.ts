import { z } from "zod";
import { normalizeWebPath } from "./paths.js";
import { WEB_SCHEMA_VERSION, type JsonValue, type JsonObject } from "./types.js";

// Check before recursive Zod parsing: JSON.stringify silently drops some invalid values
// and invokes toJSON/getters. Neither behavior is allowed in the publication format.
function isJsonValue(value: unknown, ancestors = new Set<object>(), depth = 0): value is JsonValue {
  if (depth > 100) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  const array = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (!array && prototype !== Object.prototype && prototype !== null) return false;
  if (array && prototype !== Array.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (array && keys.length !== value.length + 1) return false;
  ancestors.add(value);
  try {
    return keys.every((key) => {
      if (array && key === "length") return true;
      if (typeof key !== "string" || key === "__proto__") return false;
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !!descriptor && descriptor.enumerable === true && "value" in descriptor &&
        isJsonValue(descriptor.value, ancestors, depth + 1);
    });
  } finally {
    ancestors.delete(value);
  }
}

export const jsonValueSchema = z.custom<JsonValue>((value) => {
  try { return isJsonValue(value); } catch { return false; }
}, "Expected lossless JSON data (finite numbers, plain objects, dense arrays; maximum depth 100)");

const jsonObjectSchema = jsonValueSchema.refine(
  (value): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value),
  "Expected a JSON object",
);
const nonEmptyString = z.string().min(1).refine((value) => value.trim().length > 0, "Must not be blank");
const tokensSchema = z.record(nonEmptyString, nonEmptyString);

export const webPathSchema = z.string().transform((value, context) => {
  try { return normalizeWebPath(value); } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid or reserved web path" });
    return z.NEVER;
  }
});

export const webThemeSchema = jsonValueSchema.pipe(z.object({
  colors: tokensSchema,
  typography: tokensSchema,
  spacing: tokensSchema,
}).strict());

export const webPageSchema = jsonValueSchema.pipe(z.object({
  id: nonEmptyString,
  path: webPathSchema,
  title: nonEmptyString,
  description: z.string().optional(),
  puckData: jsonObjectSchema,
  schemaVersion: z.literal(WEB_SCHEMA_VERSION),
}).strict());

export const webTemplateSchema = jsonValueSchema.pipe(z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  description: z.string().optional(),
  page: webPageSchema,
}).strict());

export const webPublicationManifestSchema = jsonValueSchema.pipe(z.object({
  schemaVersion: z.literal(WEB_SCHEMA_VERSION),
  publicationId: nonEmptyString,
  publishedAt: z.string().datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value)), "Invalid ISO timestamp"),
  theme: webThemeSchema,
  pages: z.array(webPageSchema),
}).strict()).superRefine((manifest, context) => {
  const paths = new Set<string>();
  manifest.pages.forEach((page, index) => {
    if (paths.has(page.path)) context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate web path: ${page.path}`,
      path: ["pages", index, "path"],
    });
    paths.add(page.path);
  });
});

/** Validators return normalized data or throw ZodError. Inputs are never mutated. */
export function validateWebPage(value: unknown) { return webPageSchema.parse(value); }
export function validateWebTheme(value: unknown) { return webThemeSchema.parse(value); }
export function validateWebTemplate(value: unknown) { return webTemplateSchema.parse(value); }
export function validatePublicationManifest(value: unknown) { return webPublicationManifestSchema.parse(value); }
