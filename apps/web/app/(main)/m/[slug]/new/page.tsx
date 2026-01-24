// app/(main)/m/[slug]/new/page.tsx
import { notFound } from "next/navigation";
import FormClient from "@/lib/FormClient";
import {
  fetchAllModulesIndex,
  fetchModuleRowBySlug,
} from "@/lib/modules.server";

export const dynamic = "force-dynamic";

async function resolveMaybePromise<T>(
  v: Promise<T> | T | undefined
): Promise<T | undefined> {
  if (!v) return undefined;
  return typeof (v as any).then === "function" ? await (v as any) : (v as any);
}

export default async function NewEntityPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const p = await resolveMaybePromise(params);
  const slug = p?.slug;
  if (!slug) notFound();

  const mod = await fetchModuleRowBySlug(slug);
  const { modulesBySlug } = await fetchAllModulesIndex();

  return (
    <main className="container py-4 bg-secondary bg-opacity-10 rounded">
      <FormClient
        schema={mod.schema}
        initialData={{}}
        mode="create"
        moduleSlug={slug}
        baseRoute={mod.route || `/${slug}/`}
        modulesBySlug={modulesBySlug}
        schemasBySlug={{ [slug]: mod.schema }}
      />
    </main>
  );
}
