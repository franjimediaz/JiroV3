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
  const baseRoute = `/m/${slug}/`;
  if (!table) {
    throw new Error(`Este modulo no es un modulo de datos: ${slug}`);
  }

  // 2) fila
  const row = await fetchRowById(table, primaryKey, id);
  if (!row) notFound();

  // 3) índices auxiliares (para treeview + resolve de rutas)
  const { modulesBySlug, slugByTable } = await fetchAllModulesIndex();

  // 4) cargar schemas extra que necesite treeview
  const rawSources = extractTreeviewSourcesFromSchema(schema);
  const sourceSlugs = rawSources.map((s) => slugByTable[s] || s);
  const sourceTables = rawSources
    .map((source) => {
      const resolvedSlug = slugByTable[source] || source;
      const moduleConfig = modulesBySlug?.[resolvedSlug];
      return String(moduleConfig?.db?.table || source).trim();
    })
    .filter(Boolean);
  const relatedSourceSlugs = Array.from(
    new Set(
      Object.entries(modulesBySlug || {})
        .filter(([, mod]) => sourceTables.includes(String(mod?.db?.table || "").trim()))
        .map(([relatedSlug]) => relatedSlug)
    )
  );
  const schemaSlugsToLoad = Array.from(new Set([...sourceSlugs, ...relatedSourceSlugs]));

  const schemasBySlug: Record<string, ModuleSchema> = {};
  const schemasByTable: Record<string, ModuleSchema> = {};
  const pickBaseSchema = (
    currentSchema: ModuleSchema | undefined,
    nextSchema: ModuleSchema
  ) => {
    if (!currentSchema) return nextSchema;
    const currentFields = Array.isArray(currentSchema.fields)
      ? currentSchema.fields.length
      : 0;
    const nextFields = Array.isArray(nextSchema.fields)
      ? nextSchema.fields.length
      : 0;
    return nextFields > currentFields ? nextSchema : currentSchema;
  };
  const registerSchema = (key: string, moduleSchema: ModuleSchema) => {
    if (!key) return;
    schemasBySlug[key] = moduleSchema;
    const tableKey = String(moduleSchema?.db?.table || "").trim();
    if (tableKey) {
      schemasByTable[tableKey] = pickBaseSchema(schemasByTable[tableKey], moduleSchema);
    }
  };

  registerSchema(slug, schema);
  for (const src of schemaSlugsToLoad) {
    if (!src || schemasBySlug[src]) continue;
    try {
      const sourceModule = await fetchModuleRowBySlug(src);
      registerSchema(src, sourceModule.schema);
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
        schemasByTable={schemasByTable}
      />
    </main>
  );
}
