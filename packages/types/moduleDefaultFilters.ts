type PlainObject = Record<string, any>;

export type ModuleDefaultFilterOperator =
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

export type ModuleDefaultFilterLogic = "AND" | "OR";
export type ModuleDefaultFilterValueSource = "literal" | "function";
export type ModuleDefaultFilterLiteralType = "text" | "number" | "boolean";
export type ModuleDefaultFilterFunction =
  | "CurrentUser"
  | "CurrentUserEmail"
  | "CurrentUserRole"
  | "Today"
  | "Now";

export type ModuleDefaultFilterCondition = {
  kind: "condition";
  field: string;
  op: ModuleDefaultFilterOperator;
  valueSource?: ModuleDefaultFilterValueSource;
  valueType?: ModuleDefaultFilterLiteralType;
  value?: any;
  fn?: ModuleDefaultFilterFunction;
};

export type ModuleDefaultFilterGroup = {
  kind: "group";
  logic: ModuleDefaultFilterLogic;
  items: ModuleDefaultFilterNode[];
};

export type ModuleDefaultFilterNode = ModuleDefaultFilterCondition | ModuleDefaultFilterGroup;

export type ModuleDefaultResolvedFilterCondition = {
  field: string;
  op: ModuleDefaultFilterOperator;
  value?: any;
};

export type ModuleDefaultResolvedFilterGroup = {
  logic: ModuleDefaultFilterLogic;
  items: Array<ModuleDefaultResolvedFilterCondition | ModuleDefaultResolvedFilterGroup>;
};

export type ModuleDefaultQueryFilterLike = {
  field: string;
  op: ModuleDefaultFilterOperator | string;
  value?: any;
};

export type ModuleDefaultFiltersInput =
  | ModuleDefaultQueryFilterLike[]
  | ModuleDefaultFilterGroup
  | null
  | undefined;

export type ModuleDefaultFilterRuntimeContext = {
  currentUser?: {
    id?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
  now?: Date | string | null;
  today?: string | null;
};

const EMPTY_GROUP: ModuleDefaultFilterGroup = {
  kind: "group",
  logic: "AND",
  items: [],
};

export function createEmptyModuleDefaultFilterCondition(): ModuleDefaultFilterCondition {
  return {
    kind: "condition",
    field: "",
    op: "=",
    valueSource: "literal",
    valueType: "text",
    value: "",
  };
}

export function createEmptyModuleDefaultFilterGroup(
  logic: ModuleDefaultFilterLogic = "AND"
): ModuleDefaultFilterGroup {
  return { kind: "group", logic, items: [] };
}

export function normalizeModuleDefaultFilters(
  input: ModuleDefaultFiltersInput
): ModuleDefaultFilterGroup {
  if (Array.isArray(input)) {
    return {
      kind: "group",
      logic: "AND",
      items: input.map(normalizeLegacyModuleDefaultFilterCondition),
    };
  }

  if (!isPlainObject(input)) return { ...EMPTY_GROUP, items: [] };

  if ("field" in input && !("items" in input)) {
    return {
      kind: "group",
      logic: "AND",
      items: [normalizeModuleDefaultFilterCondition(input)],
    };
  }

  return normalizeModuleDefaultFilterGroup(input);
}

export function normalizeModuleDefaultFilterGroup(input: any): ModuleDefaultFilterGroup {
  const logic = input?.logic === "OR" ? "OR" : "AND";
  const items = Array.isArray(input?.items) ? input.items.map(normalizeModuleDefaultFilterNode) : [];
  return {
    kind: "group",
    logic,
    items,
  };
}

export function normalizeModuleDefaultFilterNode(input: any): ModuleDefaultFilterNode {
  if (isModuleDefaultFilterGroup(input)) return normalizeModuleDefaultFilterGroup(input);
  return normalizeModuleDefaultFilterCondition(input);
}

export function normalizeModuleDefaultFilterCondition(input: any): ModuleDefaultFilterCondition {
  const op = normalizeOperator(input?.op);
  const valueSource = input?.valueSource === "function" ? "function" : "literal";

  const condition: ModuleDefaultFilterCondition = {
    kind: "condition",
    field: String(input?.field || "").trim(),
    op,
    valueSource,
    valueType: normalizeLiteralType(input?.valueType, input?.value),
    value: input?.value,
    fn: normalizeFunctionName(input?.fn),
  };

  if (op === "isNull" || op === "isNotNull") {
    delete condition.value;
    delete condition.fn;
  }

  if (valueSource === "function" && !condition.fn) {
    condition.fn = "CurrentUser";
  }

  return condition;
}

export function serializeModuleDefaultFilters(
  input: ModuleDefaultFiltersInput
): ModuleDefaultFilterGroup {
  return normalizeModuleDefaultFilters(input);
}

export function resolveModuleDefaultFilters(
  input: ModuleDefaultFiltersInput,
  context?: ModuleDefaultFilterRuntimeContext
): ModuleDefaultResolvedFilterGroup {
  const normalized = normalizeModuleDefaultFilters(input);
  return {
    logic: normalized.logic,
    items: normalized.items.map((item) =>
      item.kind === "group" ? resolveModuleDefaultFilters(item, context) : resolveModuleDefaultFilterCondition(item, context)
    ),
  };
}

export function resolveModuleDefaultFiltersToQuery(
  input: ModuleDefaultFiltersInput,
  context?: ModuleDefaultFilterRuntimeContext
) {
  const group = resolveModuleDefaultFilters(input, context);
  const filters = flattenResolvedModuleDefaultFilterGroup(group);
  return {
    group,
    filters,
    canQueryDirectly: !!filters,
  };
}

export function flattenResolvedModuleDefaultFilterGroup(
  group: ModuleDefaultResolvedFilterGroup
): ModuleDefaultQueryFilterLike[] | null {
  if (group.logic !== "AND") return null;

  const output: ModuleDefaultQueryFilterLike[] = [];
  for (const item of group.items) {
    if (isResolvedGroup(item)) {
      const nested = flattenResolvedModuleDefaultFilterGroup(item);
      if (!nested) return null;
      output.push(...nested);
      continue;
    }
    output.push({ field: item.field, op: item.op, value: item.value });
  }

  return output;
}

export function matchesModuleDefaultFilterGroup(
  row: PlainObject,
  groupOrInput?: ModuleDefaultResolvedFilterGroup | ModuleDefaultFiltersInput,
  context?: ModuleDefaultFilterRuntimeContext
): boolean {
  const group = isResolvedGroup(groupOrInput) ? groupOrInput : resolveModuleDefaultFilters(groupOrInput, context);
  if (!group.items.length) return true;

  return group.logic === "OR"
    ? group.items.some((item) => matchesModuleDefaultFilterNode(row, item))
    : group.items.every((item) => matchesModuleDefaultFilterNode(row, item));
}

function resolveModuleDefaultFilterCondition(
  condition: ModuleDefaultFilterCondition,
  context?: ModuleDefaultFilterRuntimeContext
): ModuleDefaultResolvedFilterCondition {
  if (condition.op === "isNull" || condition.op === "isNotNull") {
    return { field: condition.field, op: condition.op };
  }

  if (condition.valueSource === "function") {
    return {
      field: condition.field,
      op: condition.op,
      value: resolveDynamicFunctionValue(condition.fn, context),
    };
  }

  return {
    field: condition.field,
    op: condition.op,
    value: coerceLiteral(condition.value, condition.valueType),
  };
}

export function resolveDynamicFunctionValue(
  fn: ModuleDefaultFilterFunction | undefined,
  context?: ModuleDefaultFilterRuntimeContext
) {
  switch (fn) {
    case "CurrentUser":
      return context?.currentUser?.id ?? null;
    case "CurrentUserEmail":
      return context?.currentUser?.email ?? null;
    case "CurrentUserRole":
      return context?.currentUser?.role ?? null;
    case "Today":
      return context?.today ?? buildTodayString(context?.now);
    case "Now":
      return buildNowIso(context?.now);
    default:
      return null;
  }
}

function matchesModuleDefaultFilterNode(
  row: PlainObject,
  node: ModuleDefaultResolvedFilterCondition | ModuleDefaultResolvedFilterGroup
): boolean {
  if (isResolvedGroup(node)) return matchesModuleDefaultFilterGroup(row, node);

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
      return String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase().replace(/%/g, ""));
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

function normalizeLegacyModuleDefaultFilterCondition(input: any): ModuleDefaultFilterCondition {
  return normalizeModuleDefaultFilterCondition({
    field: input?.field,
    op: input?.op,
    valueSource: "literal",
    value: input?.value,
  });
}

function normalizeOperator(value: any): ModuleDefaultFilterOperator {
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
): ModuleDefaultFilterLiteralType {
  if (valueType === "number" || valueType === "boolean") return valueType;
  if (typeof fallbackValue === "number") return "number";
  if (typeof fallbackValue === "boolean") return "boolean";
  return "text";
}

function normalizeFunctionName(value: any): ModuleDefaultFilterFunction | undefined {
  switch (String(value || "")) {
    case "CurrentUser":
    case "CurrentUserEmail":
    case "CurrentUserRole":
    case "Today":
    case "Now":
      return value;
    default:
      return undefined;
  }
}

function coerceLiteral(value: any, valueType?: ModuleDefaultFilterLiteralType) {
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
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "si", "sí", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return false;
}

function buildTodayString(now?: Date | string | null) {
  const date = now ? new Date(now) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function buildNowIso(now?: Date | string | null) {
  const date = now ? new Date(now) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
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

function isModuleDefaultFilterGroup(value: any): value is ModuleDefaultFilterGroup {
  return isPlainObject(value) && Array.isArray(value.items);
}

function isResolvedGroup(value: any): value is ModuleDefaultResolvedFilterGroup {
  return isPlainObject(value) && Array.isArray(value.items) && (value.logic === "AND" || value.logic === "OR");
}
