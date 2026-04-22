import {
  matchesModuleDefaultFilterGroup,
  resolveModuleDefaultFiltersToQuery,
  type ModuleDefaultFilterRuntimeContext,
  type ModuleDefaultFiltersInput,
  type QueryFilter,
} from "@repo/types";

export async function buildModuleDefaultFilterRuntimeContext(supabase: any): Promise<ModuleDefaultFilterRuntimeContext> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { currentUser: null, now, today };

    const { data: profile } = await supabase.from("users").select("role").eq("uid", user.id).maybeSingle();
    const role =
      profile?.role ??
      (user.app_metadata as any)?.role ??
      (user.user_metadata as any)?.role ??
      null;

    return {
      currentUser: {
        id: user.id,
        email: user.email ?? null,
        role,
      },
      now,
      today,
    };
  } catch {
    return { currentUser: null, now, today };
  }
}

export function resolveDefaultFiltersForQuery(
  input: ModuleDefaultFiltersInput,
  context: ModuleDefaultFilterRuntimeContext
) {
  return resolveModuleDefaultFiltersToQuery(input, context);
}

export function applyQueryFilters<TQuery extends any>(query: TQuery, filters?: QueryFilter[]) {
  if (!filters?.length) return query;

  let nextQuery = query as any;
  for (const filter of filters) {
    const field = String(filter?.field || "").trim();
    const op = filter?.op;
    const value = filter?.value;
    if (!field) continue;

    if (op === "=") nextQuery = nextQuery.eq(field, value);
    else if (op === "!=") nextQuery = nextQuery.neq(field, value);
    else if (op === ">") nextQuery = nextQuery.gt(field, value);
    else if (op === ">=") nextQuery = nextQuery.gte(field, value);
    else if (op === "<") nextQuery = nextQuery.lt(field, value);
    else if (op === "<=") nextQuery = nextQuery.lte(field, value);
    else if (op === "in") nextQuery = nextQuery.in(field, Array.isArray(value) ? value : [value]);
    else if (op === "contains") {
      if (value === null || value === undefined) continue;
      nextQuery = nextQuery.ilike(field, `%${String(value)}%`);
    } else if (op === "ilike") {
      if (value === null || value === undefined) continue;
      nextQuery = nextQuery.ilike(field, String(value));
    } else if (op === "isNull") {
      nextQuery = nextQuery.is(field, null);
    } else if (op === "isNotNull") {
      nextQuery = nextQuery.not(field, "is", null);
    }
  }

  return nextQuery;
}

export function filterRowsWithDefaultFilters(rows: any[], resolvedGroup: any) {
  return rows.filter((row) => matchesModuleDefaultFilterGroup(row, resolvedGroup));
}
