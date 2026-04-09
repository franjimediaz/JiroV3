// lib/workflows/deriveHelpers.ts
export type DeriveFilterCondition = {
  field: string;
  op: "=" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "not_in" | "contains" | "is_null" | "not_null";
  value?: any;
};

export type DeriveChildSpec = {
  sourceTable: string;
  sourceFkToParent: string;
  targetTable: string;
  targetFkToParent: string;
  map?: Record<string, string>;
  defaults?: Record<string, any>;
  filters?: DeriveFiltersGroup;
  sourceUpdates?: Record<string, any>;
};

export type DeriveFiltersGroup = {
  match?: "all" | "any";
  conditions?: DeriveFilterCondition[];
};

export type DeriveInput = {
  source: {
    parentTable: string;
    parentIdTemplate?: string;
    children?: {
      table: string;
      fkToParent: string;
    };
  };
  target: {
    parentTable: string;
    children?: {
      table: string;
      fkToParent: string;
    };
  };
  maps?: {
    parent?: Record<string, string>;
    child?: Record<string, string>;
  };
  defaults?: {
    parent?: Record<string, any>;
    child?: Record<string, any>;
  };
  sourceUpdates?: {
    parent?: Record<string, any>;
    child?: Record<string, any>;
  };
  children?: DeriveChildSpec[];
  idempotency?: {
    targetField?: string;
    valueTemplate?: string;
  };
};

export function normalizeDeriveInput(input: any): DeriveInput {
  if (!input || typeof input !== "object") throw new Error("input inválido");

  if (!input.source?.parentTable) throw new Error("input.source.parentTable requerido (slug)");
  if (!input.target?.parentTable) throw new Error("input.target.parentTable requerido (slug)");

  // si hay hijos, valida fk
  if (input.source?.children?.table && !input.source.children.fkToParent) {
    throw new Error("source.children.fkToParent requerido cuando source.children.table existe");
  }
  if (input.target?.children?.table && !input.target.children.fkToParent) {
    throw new Error("target.children.fkToParent requerido cuando target.children.table existe");
  }

  const children = normalizeChildren(input);
  for (const child of children) {
    if (child.sourceTable && !child.sourceFkToParent) {
      throw new Error(`sourceFkToParent requerido para ${child.sourceTable}`);
    }
    if (child.targetTable && !child.targetFkToParent) {
      throw new Error(`targetFkToParent requerido para ${child.targetTable}`);
    }
  }

  return {
    ...input,
    maps: {
      parent: input?.maps?.parent || {},
      child: input?.maps?.child || {},
    },
    defaults: {
      parent: input?.defaults?.parent || {},
      child: input?.defaults?.child || {},
    },
    sourceUpdates: {
      parent: input?.sourceUpdates?.parent || {},
      child: input?.sourceUpdates?.child || {},
    },
    children,
  };
}

export function normalizeChildren(input: any): DeriveChildSpec[] {
  if (Array.isArray(input?.children) && input.children.length > 0) {
    return input.children.map(normalizeChildSpec);
  }

  const sourceChild = input?.source?.children;
  const targetChild = input?.target?.children;
  if (!sourceChild?.table || !targetChild?.table) return [];

  return [
    normalizeChildSpec({
      sourceTable: sourceChild.table,
      sourceFkToParent: sourceChild.fkToParent,
      targetTable: targetChild.table,
      targetFkToParent: targetChild.fkToParent,
      map: input?.maps?.child,
      defaults: input?.defaults?.child,
      sourceUpdates: input?.sourceUpdates?.child,
    }),
  ];
}

export function normalizeChildSpec(child: any): DeriveChildSpec {
  return {
    sourceTable: String(child?.sourceTable || ""),
    sourceFkToParent: String(child?.sourceFkToParent || ""),
    targetTable: String(child?.targetTable || ""),
    targetFkToParent: String(child?.targetFkToParent || ""),
    map: isObject(child?.map) ? child.map : {},
    defaults: isObject(child?.defaults) ? child.defaults : {},
    filters: normalizeFiltersGroup(child?.filters),
    sourceUpdates: isObject(child?.sourceUpdates) ? child.sourceUpdates : {},
  };
}

export function normalizeFilterCondition(condition: any): DeriveFilterCondition {
  return {
    field: String(condition?.field || ""),
    op: String(condition?.op || "=") as DeriveFilterCondition["op"],
    value: condition?.value,
  };
}

export function normalizeFiltersGroup(value: any): DeriveFiltersGroup {
  if (Array.isArray(value)) {
    return {
      match: "all",
      conditions: value.map(normalizeFilterCondition),
    };
  }

  const obj = isObject(value) ? value : {};
  return {
    match: obj.match === "any" ? "any" : "all",
    conditions: Array.isArray(obj.conditions) ? obj.conditions.map(normalizeFilterCondition) : [],
  };
}


export function applyMapAndDefaults({
  sourceRow,
  map,
  defaults,
}: {
  sourceRow: any;
  map?: Record<string, string>;
  defaults?: Record<string, any>;
}) {
  const out: any = { ...(defaults || {}) };
  for (const [dest, src] of Object.entries(map || {})) {
    out[dest] = sourceRow?.[src];
  }
  return out;
}

export function rowMatchesFilters(row: any, filters?: DeriveFiltersGroup | DeriveFilterCondition[]) {
  const group = normalizeFiltersGroup(filters);
  const list = Array.isArray(group.conditions) ? group.conditions : [];

  if (!list.length) return true;

  return group.match === "any"
    ? list.some((filter) => matchesCondition(row, filter))
    : list.every((filter) => matchesCondition(row, filter));
}

function matchesCondition(row: any, filter: DeriveFilterCondition) {
  const field = String(filter?.field || "").trim();
  if (!field) return true;

  const left = row?.[field];
  const op = filter.op || "=";
  const right = filter.value;

  switch (op) {
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
    case "in":
      return Array.isArray(right) ? right.includes(left) : false;
    case "not_in":
      return Array.isArray(right) ? !right.includes(left) : true;
    case "is_null":
      return left == null;
    case "not_null":
      return left != null;
    default:
      return true;
  }
}

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
