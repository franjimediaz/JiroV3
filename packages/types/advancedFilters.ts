import type { Field, ModuleSchema } from "./fields";
import type { ModuleDefaultFilterGroup } from "./moduleDefaultFilters";

export type AdvancedFilterOperator = "=" | "!=" | "contains" | "notContains" | "startsWith" | "endsWith" |
  ">" | ">=" | "<" | "<=" | "between" | "in" | "notIn" | "isNull" | "isNotNull";
export type AdvancedFilterCondition = {
  kind: "condition";
  field: string;
  op: AdvancedFilterOperator;
  value?: string | number | boolean | Array<string | number>;
  /** Name of the configured selector field in the root schema, never a table name. */
  relation?: string;
};
export type AdvancedFilterGroup = Pick<ModuleDefaultFilterGroup, "kind" | "logic"> & {
  items: Array<AdvancedFilterCondition | AdvancedFilterGroup>;
};
export type AdvancedSearchField = { field: Field; relation?: string; label: string };
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
  return advancedFilterFields(schema).flatMap(field => [
    { field, label: field.label || field.name },
    ...(field.type === "selectorTabla" && related[field.ref.moduleSlug]
      ? advancedFilterFields(related[field.ref.moduleSlug]!).map(child => ({
          field: child, relation: field.name, label: `${field.label || field.name} > ${child.label || child.name}`,
        })) : []),
  ]);
}
