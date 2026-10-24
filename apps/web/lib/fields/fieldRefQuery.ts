import type { FieldRefInput, ModuleDefaultQueryFilterLike, ModuleDefaultResolvedFilterGroup, QueryFilter, QuerySort } from "@repo/types";
import { fieldRefKey, normalizeFieldRef } from "@repo/types";
import { filterConditionExpression, filterIdentifier } from "../advancedFilters";
import { badRequest } from "../auth/apiError";
import type { ResolvedFieldRef } from "./resolveFieldRef";

type RefUsage = { ref: ResolvedFieldRef; inner: boolean };
type FieldRefQueryBuilder<TQuery> = {
  eq(path: string, value: unknown): TQuery;
  neq(path: string, value: unknown): TQuery;
  gt(path: string, value: unknown): TQuery;
  gte(path: string, value: unknown): TQuery;
  lt(path: string, value: unknown): TQuery;
  lte(path: string, value: unknown): TQuery;
  in(path: string, values: unknown[]): TQuery;
  ilike(path: string, pattern: string): TQuery;
  is(path: string, value: null): TQuery;
  not(path: string, operator: "is", value: null): TQuery;
  order(path: string, options: { ascending: boolean }): TQuery;
};
type RelationNode = {
  field: string;
  table: string;
  inner: boolean;
  fields: Set<string>;
  children: Map<string, RelationNode>;
};

function relationTree(usages: readonly RefUsage[]) {
  const roots = new Map<string, RelationNode>();
  for (const usage of usages) {
    let siblings = roots;
    usage.ref.relations.forEach((relation, index) => {
      let node = siblings.get(relation.field);
      if (!node) {
        node = { field: relation.field, table: relation.table, inner: false, fields: new Set(), children: new Map() };
        siblings.set(relation.field, node);
      }
      if (usage.inner) node.inner = true;
      if (index === usage.ref.relations.length - 1) node.fields.add(usage.ref.field);
      siblings = node.children;
    });
  }
  return roots;
}

function renderRelationNode(node: RelationNode): string {
  const children = [...node.children.values()].map(renderRelationNode);
  const body = [...[...node.fields].map(filterIdentifier), ...children].join(",");
  const join = node.inner ? "!inner" : "";
  return `${filterIdentifier(node.field)}:${filterIdentifier(node.table)}!${filterIdentifier(node.field)}${join}(${body || "*"})`;
}

export function buildFieldRefSelect(projections: readonly ResolvedFieldRef[], filterRefs: readonly ResolvedFieldRef[] = []) {
  const filterKeys = new Set(filterRefs.map(ref => ref.key));
  const usages = [...new Map([...projections, ...filterRefs].map(ref => [ref.key, ref])).values()]
    .filter(ref => ref.relations.length)
    .map(ref => ({ ref, inner: filterKeys.has(ref.key) }));
  return [...relationTree(usages).values()].map(renderRelationNode);
}

export function hydratedFieldPath(ref: ResolvedFieldRef) {
  return [...ref.ref.relations, ref.field].map(filterIdentifier).join(".");
}

function applyOperator<TQuery extends FieldRefQueryBuilder<TQuery>>(
  query: TQuery,
  path: string,
  op: QueryFilter["op"],
  value: unknown,
) {
  if (op === "=") return query.eq(path, value);
  if (op === "!=") return query.neq(path, value);
  if (op === ">") return query.gt(path, value);
  if (op === ">=") return query.gte(path, value);
  if (op === "<") return query.lt(path, value);
  if (op === "<=") return query.lte(path, value);
  if (op === "in") return query.in(path, Array.isArray(value) ? value : [value]);
  if (op === "contains") return value == null ? query : query.ilike(path, `%${String(value)}%`);
  if (op === "ilike") return value == null ? query : query.ilike(path, String(value));
  if (op === "isNull") return query.is(path, null);
  if (op === "isNotNull") return query.not(path, "is", null);
  return query;
}

export function applyFieldRefFilters<TQuery extends FieldRefQueryBuilder<TQuery>>(
  query: TQuery,
  filters: readonly QueryFilter[],
  resolved: readonly ResolvedFieldRef[],
) {
  const byKey = new Map(resolved.map(ref => [ref.key, ref]));
  let next = query;
  for (const filter of filters) {
    const ref = byKey.get(fieldRefKey(filter.field));
    const path = ref ? hydratedFieldPath(ref) : filterIdentifier(normalizeFieldRef(filter.field).field);
    next = applyOperator(next, path, filter.op, filter.value);
  }
  return next;
}

export function applyFieldRefSort<TQuery extends FieldRefQueryBuilder<TQuery>>(
  query: TQuery,
  sort: readonly QuerySort[],
  resolved: readonly ResolvedFieldRef[],
) {
  const byKey = new Map(resolved.map(ref => [ref.key, ref]));
  let next = query;
  for (const item of sort) {
    const ref = byKey.get(fieldRefKey(item.field));
    const legacyDirection = (item as QuerySort & { dir?: "asc" | "desc" }).dir;
    const direction = legacyDirection === "desc" || item.direction === "desc" ? "desc" : "asc";
    if (!ref || !ref.relations.length) {
      next = next.order(filterIdentifier(normalizeFieldRef(item.field).field), { ascending: direction === "asc" });
      continue;
    }
    if (ref.relations.length > 1) {
      throw badRequest("PostgREST no permite ordenar el recurso principal por una relación de más de un nivel");
    }
    const relation = filterIdentifier(ref.ref.relations[0]!);
    next = next.order(`${relation}(${filterIdentifier(ref.field)})`, {
      ascending: direction === "asc",
    });
  }
  return next;
}

export function collectQueryFieldRefInputs(args: {
  projections?: readonly FieldRefInput[];
  filters?: readonly QueryFilter[];
  sort?: readonly QuerySort[];
}) {
  return [...new Map([
    ...(args.projections || []),
    ...(args.filters || []).map(item => item.field),
    ...(args.sort || []).map(item => item.field),
  ].map(ref => [fieldRefKey(ref), ref])).values()];
}

export function collectFieldRefFilterGroupInputs(group: ModuleDefaultResolvedFilterGroup): FieldRefInput[] {
  return group.items.flatMap(item => "items" in item
    ? collectFieldRefFilterGroupInputs(item)
    : [item.field]);
}

export function buildModuleDefaultFilterQueryPlan(
  defaults: {
    canQueryDirectly: boolean;
    filters: readonly ModuleDefaultQueryFilterLike[] | null;
    group: ModuleDefaultResolvedFilterGroup;
  },
  resolved: readonly ResolvedFieldRef[],
) {
  if (defaults.canQueryDirectly) {
    const filters = defaults.filters || [];
    const filterRefs = filters
      .map(filter => resolved.find(ref => ref.key === fieldRefKey(filter.field)))
      .filter(Boolean) as ResolvedFieldRef[];
    return {
      selects: buildFieldRefSelect([], filterRefs),
      embeds: [] as Array<{ alias: string; select: string; expression: string }>,
      expression: undefined as string | undefined,
      apply<TQuery extends FieldRefQueryBuilder<TQuery>>(query: TQuery) {
        return applyFieldRefFilters(query, filters as readonly QueryFilter[], resolved);
      },
    };
  }

  const compiled = compileFieldRefFilterGroup(defaults.group, resolved);
  return {
    selects: compiled.embeds.map(embed => embed.select),
    embeds: compiled.embeds,
    expression: compiled.expression,
    apply<TQuery extends FieldRefQueryBuilder<TQuery> & {
      or(expression: string, options?: { referencedTable: string }): TQuery;
    }>(query: TQuery) {
      let next = query;
      for (const embed of compiled.embeds) {
        next = next.or(embed.expression, { referencedTable: embed.alias });
      }
      if (compiled.expression) next = next.or(compiled.expression);
      return next;
    },
  };
}

export function compileFieldRefFilterGroup(
  group: ModuleDefaultResolvedFilterGroup,
  resolved: readonly ResolvedFieldRef[],
) {
  const byKey = new Map(resolved.map(ref => [ref.key, ref]));
  const embeds: Array<{ alias: string; select: string; expression: string }> = [];

  const renderEmbed = (ref: ResolvedFieldRef, alias: string, index = 0): string => {
    const relation = ref.relations[index]!;
    const prefix = index === 0 ? `${alias}:` : `${filterIdentifier(relation.field)}:`;
    const nested = index + 1 < ref.relations.length ? renderEmbed(ref, alias, index + 1) : "";
    const join = index > 0 ? "!inner" : "";
    return `${prefix}${filterIdentifier(relation.table)}!${filterIdentifier(relation.field)}${join}(${nested})`;
  };

  const walk = (node: ModuleDefaultResolvedFilterGroup): string | undefined => {
    const parts = node.items.map(item => {
      if ("items" in item) return walk(item);
      const ref = byKey.get(fieldRefKey(item.field));
      if (!ref) throw new Error(`FieldRef no resuelto: ${fieldRefKey(item.field)}`);
      if (!ref.relations.length) return filterConditionExpression(ref.field, item.op, item.value);
      const alias = `jiro_default_${embeds.length}`;
      const relatedPath = [...ref.ref.relations.slice(1), ref.field].map(filterIdentifier).join(".");
      embeds.push({
        alias,
        select: renderEmbed(ref, alias),
        expression: filterConditionExpression(relatedPath, item.op, item.value),
      });
      return `${alias}.not.is.null`;
    }).filter(Boolean) as string[];
    return parts.length ? `${node.logic === "OR" ? "or" : "and"}(${parts.join(",")})` : undefined;
  };

  return { expression: walk(group), embeds };
}
