import type { Field, ModuleSchema, VisibilityConfig, VisibilityOperator, VisibilityRule } from "@repo/types";

type FormValues = Record<string, any>;
type RelatedRecordsByField = Record<string, any>;

export function isEmptyValue(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function normalizeScalar(value: any): any {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return value;
}

function valuesEqual(left: any, right: any): boolean {
  const normalizedLeft = normalizeScalar(left);
  const normalizedRight = normalizeScalar(right);
  return normalizedLeft === normalizedRight;
}

function compareOrdered(left: any, right: any, op: VisibilityOperator): boolean {
  const normalizedLeft = normalizeScalar(left);
  const normalizedRight = normalizeScalar(right);

  if (typeof normalizedLeft === "number" && typeof normalizedRight === "number") {
    if (op === ">") return normalizedLeft > normalizedRight;
    if (op === ">=") return normalizedLeft >= normalizedRight;
    if (op === "<") return normalizedLeft < normalizedRight;
    if (op === "<=") return normalizedLeft <= normalizedRight;
  }

  const leftDate = new Date(normalizedLeft);
  const rightDate = new Date(normalizedRight);
  if (!Number.isNaN(leftDate.getTime()) && !Number.isNaN(rightDate.getTime())) {
    if (op === ">") return leftDate > rightDate;
    if (op === ">=") return leftDate >= rightDate;
    if (op === "<") return leftDate < rightDate;
    if (op === "<=") return leftDate <= rightDate;
  }

  const leftString = String(normalizedLeft ?? "");
  const rightString = String(normalizedRight ?? "");
  if (op === ">") return leftString > rightString;
  if (op === ">=") return leftString >= rightString;
  if (op === "<") return leftString < rightString;
  if (op === "<=") return leftString <= rightString;
  return false;
}

export function compareValues(left: any, op: VisibilityOperator, right?: any): boolean {
  if (op === "empty") return isEmptyValue(left);
  if (op === "notEmpty") return !isEmptyValue(left);
  if (op === "=") return valuesEqual(left, right);
  if (op === "!=") return !valuesEqual(left, right);

  if (op === "contains" || op === "notContains") {
    let result = false;
    if (Array.isArray(left)) {
      result = left.some((item) => valuesEqual(item, right));
    } else if (typeof left === "string") {
      result = left.toLowerCase().includes(String(right ?? "").toLowerCase());
    }
    return op === "contains" ? result : !result;
  }

  return compareOrdered(left, right, op);
}

export function getRuleLeftValue(
  rule: VisibilityRule,
  values: FormValues,
  relatedRecordsByField: RelatedRecordsByField
): any {
  if (rule.source === "currentRecord") return values?.[rule.field];

  const relationField = String(rule.relationField || "").trim();
  const relatedField = String(rule.relatedField || "").trim();
  if (!relationField || !relatedField) return undefined;

  const relatedRecord = relatedRecordsByField?.[relationField];
  if (!relatedRecord || typeof relatedRecord !== "object") return undefined;
  return relatedRecord[relatedField];
}

export function evaluateVisibilityConfig({
  visibility,
  values,
  schema,
  relatedRecordsByField,
}: {
  visibility?: VisibilityConfig;
  values: FormValues;
  schema: ModuleSchema;
  relatedRecordsByField?: RelatedRecordsByField;
}): boolean {
  if (!visibility?.enabled) return true;

  const rules = Array.isArray(visibility.rules) ? visibility.rules : [];
  if (rules.length === 0) return true;

  const relatedRecords = relatedRecordsByField || {};
  const results = rules.map((rule) => {
    if (rule.source === "relatedRecord") {
      const relationField = String(rule.relationField || "").trim();
      const relationConfig = schema.fields.find((candidate) => candidate.name === relationField);
      const relatedModuleSlug = rule.relatedModuleSlug || (relationConfig as any)?.ref?.moduleSlug;
      if (!relationField || !relatedModuleSlug || !rule.relatedField) return false;
    }

    const left = getRuleLeftValue(rule, values, relatedRecords);
    return compareValues(left, rule.op, rule.value);
  });

  const passes = (visibility.logic || "AND") === "OR" ? results.some(Boolean) : results.every(Boolean);
  return (visibility.mode || "show") === "hide" ? !passes : passes;
}

export function evaluateFieldVisibility({
  field,
  values,
  schema,
  relatedRecordsByField,
}: {
  field: Field;
  values: FormValues;
  schema: ModuleSchema;
  relatedRecordsByField?: RelatedRecordsByField;
}): boolean {
  if (field.visible === false) return false;

  return evaluateVisibilityConfig({
    visibility: field.visibility,
    values,
    schema,
    relatedRecordsByField,
  });
}

export function evaluateActionVisibility({
  action,
  values,
  schema,
  relatedRecordsByField,
}: {
  action: { visibility?: VisibilityConfig };
  values: FormValues;
  schema: ModuleSchema;
  relatedRecordsByField?: RelatedRecordsByField;
}): boolean {
  return evaluateVisibilityConfig({
    visibility: action.visibility,
    values,
    schema,
    relatedRecordsByField,
  });
}

export function evaluateTabVisibility({
  tab,
  values,
  schema,
  relatedRecordsByField,
}: {
  tab: { visibility?: VisibilityConfig; config?: any };
  values: FormValues;
  schema: ModuleSchema;
  relatedRecordsByField?: RelatedRecordsByField;
}): boolean {
  return evaluateVisibilityConfig({
    visibility: tab.visibility ?? tab.config?.visibility,
    values,
    schema,
    relatedRecordsByField,
  });
}
