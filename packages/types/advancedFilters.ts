import type { Field, ModuleSchema } from "./fields";
import type { ModuleDefaultFilterGroup } from "./moduleDefaultFilters";
import { MAX_FIELD_REF_DEPTH, type FieldRef, type FieldRefLike } from "./fieldRefs";

export type AdvancedFilterOperator = "=" | "!=" | "contains" | "notContains" | "startsWith" | "endsWith" |
  ">" | ">=" | "<" | "<=" | "between" | "in" | "notIn" | "isNull" | "isNotNull";
export type AdvancedFilterCondition = {
  kind: "condition";
  field: FieldRefLike;
  op: AdvancedFilterOperator;
  value?: string | number | boolean | Array<string | number>;
  /** Name of the configured selector field in the root schema, never a table name. */
  relation?: string;
};
export type AdvancedFilterGroup = Pick<ModuleDefaultFilterGroup, "kind" | "logic"> & {
  items: Array<AdvancedFilterCondition | AdvancedFilterGroup>;
};
export type AdvancedSearchField = { field: Field; ref: FieldRef; relation?: string; label: string };
export const emptyAdvancedFilter = (): AdvancedFilterGroup => ({ kind: "group", logic: "AND", items: [] });
export const ADVANCED_FILTER_MAX_DEPTH = 4;
export const ADVANCED_FILTER_MAX_CONDITIONS = 40;

export function advancedFilterOperators(field: Field): AdvancedFilterOperator[] {
  const empty: AdvancedFilterOperator[] = ["isNull", "isNotNull"];
  if (field.type === "boolean") return ["="];
  if (["number", "money", "percent"].includes(field.type))
    return ["=", "!=", ">", ">=", "<", "<=", "between", ...empty];
  if (field.type === "date" || field.type === "datetime") return ["=", "<", ">", "between", ...empty];
  if (field.type === "selectorTabla" || field.type === "select") return ["=", "!=", "in", "notIn", ...empty];
  if (["text", "textarea", "color"].includes(field.type))
    return ["=", "!=", "contains", "notContains", "startsWith", "endsWith", ...empty];
  return [];
}

export function advancedFilterFields(schema: ModuleSchema): Field[] {
  return (schema.fields || []).filter(field => field.filter === true && !field.virtual &&
    !(field.type === "selectorTabla" && field.ref.multiple) && advancedFilterOperators(field).length > 0);
}

export function advancedSearchFields(schema: ModuleSchema, related: Record<string, ModuleSchema> = {}): AdvancedSearchField[] {
  const walk = (current: ModuleSchema, relations: string[], labels: string[], visited: Set<string>): AdvancedSearchField[] =>
    advancedFilterFields(current).flatMap(field => {
      const result: AdvancedSearchField[] = [{ field, ref: relations.length ? { relations, field: field.name } : { field: field.name },
        ...(relations.length === 1 ? { relation: relations[0] } : {}), label: [...labels, field.label || field.name].join(" > ") }];
      if (relations.length >= MAX_FIELD_REF_DEPTH || field.type !== "selectorTabla" || visited.has(field.ref.moduleSlug)) return result;
      const next = related[field.ref.moduleSlug];
      if (!next) return result;
      return [...result, ...walk(next, [...relations, field.name], [...labels, field.label || field.name], new Set([...visited, field.ref.moduleSlug]))];
    });
  return walk(schema, [], [], new Set());
}
