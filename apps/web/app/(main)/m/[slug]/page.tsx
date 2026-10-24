import { notFound, redirect } from "next/navigation";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";
import { ApiError } from "@/lib/auth/apiError";
import ListPageClient from "@/lib/ListPageClient";
import { fetchAllModulesIndex, fetchModuleRowBySlug } from "@/lib/modules.server";
import { createClient } from "@/lib/supabase/server";
import {
  buildModuleDefaultFilterRuntimeContext,
  resolveDefaultFiltersForQuery,
} from "@/lib/moduleDefaultFilters";
import { collectFieldRefFilterGroupInputs, buildModuleDefaultFilterQueryPlan } from "@/lib/fields/fieldRefQuery";
import { resolveFieldRefs } from "@/lib/fields/resolveFieldRef";

export const dynamic = "force-dynamic";

async function resolveMaybePromise<T>(v: Promise<T> | T | undefined) {
  if (!v) return undefined;
  return typeof (v as any).then === "function" ? await (v as any) : (v as any);
}

export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }> | { slug: string };
  searchParams?: Promise<Record<string, string>> | Record<string, string>;
}) {
  const p = await resolveMaybePromise(params);
  const sp = (await resolveMaybePromise(searchParams)) ?? {};
  const slug = p?.slug;
  if (!slug) notFound();
  try {
    await requireModulePermission(slug, "ver");
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) redirect("/403");
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    throw error;
  }

  const { schema, table, titleSingular } = await fetchModuleRowBySlug(slug);
  if (!table) {
    throw new Error(`Este modulo no es un modulo de datos: ${slug}`);
  }
  const { modulesBySlug } = await fetchAllModulesIndex();

  if (sp.view === "search") return <ListPageClient schema={schema} rows={[]} moduleSlug={slug}
    baseRoute={`/m/${slug}/`} titleSingular={titleSingular} modulesBySlug={modulesBySlug} advancedSearch />;

  const supabase = await createClient();
  const runtimeContext = await buildModuleDefaultFilterRuntimeContext(supabase);
  const defaultFilters = resolveDefaultFiltersForQuery(schema?.db?.defaultFilters, runtimeContext);
  const defaultFilterInputs = defaultFilters.canQueryDirectly
    ? (defaultFilters.filters || []).map(filter => filter.field)
    : collectFieldRefFilterGroupInputs(defaultFilters.group);
  const resolvedDefaultFields = defaultFilterInputs.length
    ? await resolveFieldRefs(slug, defaultFilterInputs)
    : [];
  const defaultFilterPlan = buildModuleDefaultFilterQueryPlan(defaultFilters, resolvedDefaultFields);

  let query = supabase.from(table).select(["*", ...defaultFilterPlan.selects].join(","));
  query = defaultFilterPlan.apply(query);
  query = query.limit(200);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data || [];

  return (
      <ListPageClient
        schema={schema}
        rows={rows}
        moduleSlug={slug}
        baseRoute={`/m/${slug}/`}
        titleSingular={titleSingular}
        modulesBySlug={modulesBySlug}
      />
  );
}
