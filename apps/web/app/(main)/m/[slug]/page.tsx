import { notFound } from "next/navigation";
import ListPageClient from "@/lib/ListPageClient";
import { fetchAllModulesIndex, fetchModuleRowBySlug } from "@/lib/modules.server";
import { createClient } from "@/lib/supabase/server";
import {
  applyQueryFilters,
  buildModuleDefaultFilterRuntimeContext,
  filterRowsWithDefaultFilters,
  resolveDefaultFiltersForQuery,
} from "@/lib/moduleDefaultFilters";
import type { QueryFilter } from "@repo/types";

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

  const { schema, table, route, titleSingular } = await fetchModuleRowBySlug(slug);
  const { modulesBySlug } = await fetchAllModulesIndex();

  const supabase = await createClient();
  const runtimeContext = await buildModuleDefaultFilterRuntimeContext(supabase);
  const defaultFilters = resolveDefaultFiltersForQuery(schema?.db?.defaultFilters, runtimeContext);

  let query = supabase.from(table).select("*");
  if (defaultFilters.canQueryDirectly) {
    query = applyQueryFilters(query, defaultFilters.filters as QueryFilter[]);
  }
  query = query.limit(200);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = defaultFilters.canQueryDirectly
    ? data || []
    : filterRowsWithDefaultFilters(data || [], defaultFilters.group);

  return (
    <main className="container py-4">
      <ListPageClient
        schema={schema}
        rows={rows}
        moduleSlug={slug}
        baseRoute={route || `/${slug}/`}
        titleSingular={titleSingular}
        modulesBySlug={modulesBySlug}
      />
    </main>
  );
}
