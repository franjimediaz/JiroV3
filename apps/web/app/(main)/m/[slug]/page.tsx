import { notFound } from "next/navigation";
import ListPageClient from "@/lib/ListPageClient";
import { fetchAllModulesIndex, fetchModuleRowBySlug } from "@/lib/modules.server";
import { createClient } from "@/lib/supabase/server";

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

  // fetch rows (simple por ahora; luego metemos search/paginate/sort declarativo)
  const supabase = await createClient();
  const { data, error } = await supabase.from(slug).select("*").limit(200);
  if (error) throw new Error(error.message);

  return (
    <main className="container py-4">
      <ListPageClient
        schema={schema}
        rows={data || []}
        moduleSlug={slug}
        baseRoute={route || `/${slug}/`}
        titleSingular={titleSingular}
        modulesBySlug={modulesBySlug}
      />
    </main>
  );
}
