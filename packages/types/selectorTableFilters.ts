type PlainObject = Record<string, any>;

export type SelectorTableFilterOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "in"
  | "contains"
  | "ilike"
  | "isNull"
  | "isNotNull";

export type SelectorTableFilterValueSource = "literal" | "recordField";
export type SelectorTableFilterLiteralType = "text" | "number" | "boolean";
export type SelectorTableFilterLogic = "AND" | "OR";

export type SelectorTableFilterCondition = {
  kind: "condition";
  field: string;
  op: SelectorTableFilterOperator;
  valueSource?: SelectorTableFilterValueSource;
  valueType?: SelectorTableFilterLiteralType;
  value?: any;
  valueField?: string;
};

export type SelectorTableFilterGroup = {
  kind: "group";
  logic: SelectorTableFilterLogic;
  items: SelectorTableFilterNode[];
};

export type SelectorTableFilterNode = SelectorTableFilterCondition | SelectorTableFilterGroup;

export type SelectorTableResolvedFilterCondition = {
  field: string;
  op: SelectorTableFilterOperator;
  value?: any;
};

export type SelectorTableResolvedFilterGroup = {
  logic: SelectorTableFilterLogic;
  items: Array<SelectorTableResolvedFilterCondition | SelectorTableResolvedFilterGroup>;
};

export type QueryFilterLike = {
  field: string;
  op: SelectorTableFilterOperator | string;
  value?: any;
};

export type SelectorTableFiltersInput =
  | QueryFilterLike[]
  | SelectorTableFilterGroup
  | null
  | undefined;

export type SelectorTableFilterResolutionContext = {
  record?: PlainObject | null;
  values?: PlainObject | null;
};

const DEFAULT_CONDITION: SelectorTableFilterCondition = {
  kind: "condition",
  field: "",
  op: "=",
  valueSource: "literal",
  valueType: "text",
  value: "",
  valueField: "",
};

const DEFAULT_GROUP: SelectorTableFilterGroup = {
  kind: "group",
  logic: "AND",
  items: [],
};

export function createEmptySelectorTableFilterCondition(): SelectorTableFilterCondition {
  return { ...DEFAULT_CONDITION };
}

export function createEmptySelectorTableFilterGroup(
  logic: SelectorTableFilterLogic = "AND"
): SelectorTableFilterGroup {
  return { kind: "group", logic, items: [] };
}

export function normalizeSelectorTableFilters(
  input: SelectorTableFiltersInput
): SelectorTableFilterGroup {
  if (Array.isArray(input)) {
    return {
      kind: "group",
      logic: "AND",
      items: input.map(normalizeLegacyCondition),
    };
  }

  if (!isPlainObject(input)) return { ...DEFAULT_GROUP, items: [] };

  if ("field" in input && !("items" in input)) {
    return {
      kind: "group",
      logic: "AND",
      items: [normalizeSelectorTableFilterNode(input)],
    };
  }

  return normalizeSelectorTableFilterGroup(input);
}

export function normalizeSelectorTableFilterNode(input: any): SelectorTableFilterNode {
  if (isSelectorTableFilterGroup(input)) {
    return normalizeSelectorTableFilterGroup(input);
  }
  return normalizeSelectorTableFilterCondition(input);
}

export function normalizeSelectorTableFilterGroup(input: any): SelectorTableFilterGroup {
  const logic = input?.logic === "OR" ? "OR" : "AND";
  const rawItems = Array.isArray(input?.items) ? input.items : [];
  return {
    kind: "group",
    logic,
    items: rawItems.map(normalizeSelectorTableFilterNode),
  };
}

export function normalizeSelectorTableFilterCondition(input: any): SelectorTableFilterCondition {
  const op = normalizeOperator(input?.op);
  const normalized: SelectorTableFilterCondition = {
    kind: "condition",
    field: String(input?.field || "").trim(),
    op,
    valueSource: input?.valueSource === "recordField" ? "recordField" : "literal",
    valueType: normalizeLiteralType(input?.valueType, input?.value),
    value: input?.value,
    valueField: String(input?.valueField || "").trim(),
  };

  if (op === "isNull" || op === "isNotNull") {
    delete normalized.value;
    delete normalized.valueField;
  }

  if (normalized.valueSource === "recordField" && !normalized.valueField) {
    normalized.valueField = "";
  }

  return normalized;
}

export function serializeSelectorTableFilters(
  input: SelectorTableFiltersInput
): SelectorTableFilterGroup {
  return normalizeSelectorTableFilters(input);
}

export function resolveSelectorTableFilters(
  input: SelectorTableFiltersInput,
  context?: SelectorTableFilterResolutionContext
): SelectorTableResolvedFilterGroup {
  const normalized = normalizeSelectorTableFilters(input);
  return resolveSelectorTableFilterGroup(normalized, context);
}

export function resolveSelectorTableFiltersToQuery(
  input: SelectorTableFiltersInput,
  context?: SelectorTableFilterResolutionContext
) {
  const group = resolveSelectorTableFilters(input, context);
  const flatFilters = flattenResolvedSelectorTableFilterGroup(group);
  return {
    group,
    filters: flatFilters,
    canQueryDirectly: !!flatFilters,
  };
}

export function flattenResolvedSelectorTableFilterGroup(
  group: SelectorTableResolvedFilterGroup
): QueryFilterLike[] | null {
  if (group.logic !== "AND") return null;

  const output: QueryFilterLike[] = [];
  for (const item of group.items) {
    if (isResolvedFilterGroup(item)) {
      const nested = flattenResolvedSelectorTableFilterGroup(item);
      if (!nested) return null;
      output.push(...nested);
      continue;
    }

    output.push({
      field: item.field,
      op: item.op,
      value: item.value,
    });
  }

  return output;
}

export function matchesSelectorTableFilterGroup(
  row: PlainObject,
  groupOrInput?: SelectorTableResolvedFilterGroup | SelectorTableFiltersInput,
  context?: SelectorTableFilterResolutionContext
): boolean {
  const group = isResolvedFilterGroup(groupOrInput)
    ? groupOrInput
    : resolveSelectorTableFilters(groupOrInput, context);

  if (!group.items.length) return true;

  return group.logic === "OR"
    ? group.items.some((item) => matchesSelectorTableFilterNode(row, item))
    : group.items.every((item) => matchesSelectorTableFilterNode(row, item));
}

export function getSelectorTableFilterRecordValue(
  context: SelectorTableFilterResolutionContext | undefined,
  path: string
) {
  if (!path) return undefined;
  const values = getByPath(context?.values, path);
  if (values !== undefined) return values;
  return getByPath(context?.record, path);
}

function resolveSelectorTableFilterGroup(
  group: SelectorTableFilterGroup,
  context?: SelectorTableFilterResolutionContext
): SelectorTableResolvedFilterGroup {
  return {
    logic: group.logic,
    items: group.items.map((item) => {
      if (item.kind === "group") return resolveSelectorTableFilterGroup(item, context);
      return resolveSelectorTableFilterCondition(item, context);
    }),
  };
}

function resolveSelectorTableFilterCondition(
  condition: SelectorTableFilterCondition,
  context?: SelectorTableFilterResolutionContext
): SelectorTableResolvedFilterCondition {
  const resolved: SelectorTableResolvedFilterCondition = {
    field: condition.field,
    op: condition.op,
  };

  if (condition.op === "isNull" || condition.op === "isNotNull") {
    return resolved;
  }

  if (condition.valueSource === "recordField") {
    resolved.value = getSelectorTableFilterRecordValue(context, condition.valueField || "");
    return resolved;
  }

  resolved.value = coerceLiteralByType(condition.value, condition.valueType);
  return resolved;
}

function matchesSelectorTableFilterNode(
  row: PlainObject,
  node: SelectorTableResolvedFilterCondition | SelectorTableResolvedFilterGroup
): boolean {
  if (isResolvedFilterGroup(node)) return matchesSelectorTableFilterGroup(row, node);

  const left = getByPath(row, node.field);
  const right = node.value;

  switch (node.op) {
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case "contains":
      if (Array.isArray(left)) return left.includes(right);
      return String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase());
    case "ilike":
      return matchesIlike(left, right);
    case "in":
      return Array.isArray(right) ? right.includes(left) : false;
    case "isNull":
      return left == null;
    case "isNotNull":
      return left != null;
    default:
      return true;
  }
}

function normalizeLegacyCondition(input: any): SelectorTableFilterCondition {
  return normalizeSelectorTableFilterCondition({
    kind: "condition",
    field: input?.field,
    op: input?.op,
    valueSource: "literal",
    value: input?.value,
  });
}

function normalizeOperator(value: any): SelectorTableFilterOperator {
  switch (String(value || "=")) {
    case "!=":
    case ">":
    case ">=":
    case "<":
    case "<=":
    case "in":
    case "contains":
    case "ilike":
    case "isNull":
    case "isNotNull":
      return value;
    default:
      return "=";
  }
}

function normalizeLiteralType(
  valueType: any,
  fallbackValue: any
): SelectorTableFilterLiteralType {
  if (valueType === "number" || valueType === "boolean") return valueType;
  if (typeof fallbackValue === "number") return "number";
  if (typeof fallbackValue === "boolean") return "boolean";
  return "text";
}

function coerceLiteralByType(value: any, valueType?: SelectorTableFilterLiteralType) {
  if (valueType === "number") {
    if (Array.isArray(value)) return value.map((entry) => coerceNumber(entry));
    return coerceNumber(value);
  }

  if (valueType === "boolean") {
    if (Array.isArray(value)) return value.map((entry) => coerceBoolean(entry));
    return coerceBoolean(value);
  }

  return value;
}

function coerceNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function coerceBoolean(value: any) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["true", "1", "si", "sí", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return false;
}

function matchesIlike(left: any, right: any) {
  const source = String(left ?? "").toLowerCase();
  const pattern = String(right ?? "")
    .toLowerCase()
    .replace(/%/g, "");
  return source.includes(pattern);
}

function getByPath(obj: any, path: string) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce<any>((acc, key) => {
      if (acc && typeof acc === "object" && key in acc) return acc[key];
      return undefined;
    }, obj);
}

function isPlainObject(value: unknown): value is PlainObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isSelectorTableFilterGroup(value: any): value is SelectorTableFilterGroup {
  return isPlainObject(value) && (value.kind === "group" || Array.isArray(value.items));
}

function isResolvedFilterGroup(value: any): value is SelectorTableResolvedFilterGroup {
  return isPlainObject(value) && Array.isArray(value.items) && (value.logic === "AND" || value.logic === "OR");
}
