import {
  matchesModuleDefaultFilterGroup,
  resolveModuleDefaultFiltersToQuery,
  type ModuleDefaultFilterRuntimeContext,
  type ModuleDefaultFiltersInput,
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

export function filterRowsWithDefaultFilters(rows: any[], resolvedGroup: any) {
  return rows.filter((row) => matchesModuleDefaultFilterGroup(row, resolvedGroup));
}
