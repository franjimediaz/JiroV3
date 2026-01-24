// app/(main)/m/[slug]/[id]/page.tsx
import { notFound } from "next/navigation";
import type { ModuleSchema } from "@repo/types";
import FormClient from "@/lib/FormClient";
import {
  fetchAllModulesIndex,
  fetchModuleRowBySlug,
  fetchRowById,
} from "@/lib/modules.server";

export const dynamic = "force-dynamic";

async function resolveMaybePromise<T>(
  v: Promise<T> | T | undefined
): Promise<T | undefined> {
  if (!v) return undefined;
  return typeof (v as any).then === "function" ? await (v as any) : (v as any);
}

// --- opcional: mueve esto a lib si lo reutilizas ---
function extractTreeviewSourcesFromSchema(schema: ModuleSchema): string[] {
  const uiAny = (schema.ui || {}) as any;
  const tabs = Array.isArray(uiAny?.tabs) ? uiAny.tabs : [];
  const sources: string[] = [];

  for (const t of tabs) {
    const type = t?.type || t?.kind;
    if (type !== "treeview") continue;

    const cfg = t?.config ?? t;

    const legacy = cfg?.sourceTable;
    if (typeof legacy === "string" && legacy.trim()) sources.push(legacy.trim());

    const modern = cfg?.source?.table;
    if (typeof modern === "string" && modern.trim()) sources.push(modern.trim());
  }

  const legacyTreeView = uiAny?.treeView;
  if (legacyTreeView) {
    const legacy = legacyTreeView?.sourceTable;
    if (typeof legacy === "string" && legacy.trim()) sources.push(legacy.trim());

    const modern = legacyTreeView?.source?.table;
    if (typeof modern === "string" && modern.trim()) sources.push(modern.trim());
  }

  return Array.from(new Set(sources));
}

export default async function EntityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }> | { slug: string; id: string };
  searchParams?: Promise<Record<string, string>> | Record<string, string>;
}) {
  const p = await resolveMaybePromise(params);
  const sp = (await resolveMaybePromise(searchParams)) ?? {};

  const slug = p?.slug;
  const id = p?.id;
  if (!slug || !id) notFound();

  const isEdit = sp?.edit === "true";

  // 1) módulo principal (schema + table + pk + route)
  const mod = await fetchModuleRowBySlug(slug);
  const schema = mod.schema;
  const table = mod.table;
  const primaryKey = mod.primaryKey;
  const baseRoute = mod.route || `/${slug}/`;

  // 2) fila
  const row = await fetchRowById(slug, primaryKey, id);
  if (!row) notFound();

  // 3) índices auxiliares (para treeview + resolve de rutas)
  const { modulesBySlug, slugByTable } = await fetchAllModulesIndex();

  // 4) cargar schemas extra que necesite treeview
  const rawSources = extractTreeviewSourcesFromSchema(schema);
  const sourceSlugs = rawSources.map((s) => slugByTable[s] || s);

  const schemasBySlug: Record<string, ModuleSchema> = { [slug]: schema };
  for (const src of sourceSlugs) {
    if (!src || schemasBySlug[src]) continue;
    try {
      schemasBySlug[src] = (await fetchModuleRowBySlug(src)).schema;
    } catch {
      // no rompas la página
    }
  }

  return (
    <main className="container py-4 bg-secondary bg-opacity-10 rounded">
      <FormClient
        schema={schema}
        initialData={row}
        mode={isEdit ? "edit" : "view"}
        moduleSlug={slug}
        baseRoute={baseRoute}
        modulesBySlug={modulesBySlug}
        schemasBySlug={schemasBySlug}
      />
    </main>
  );
}
