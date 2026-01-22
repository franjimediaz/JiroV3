// app/(main)/py/[id]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ModuleSchema } from "@repo/types";
import FormClient from "@/lib/FormClient";

export const dynamic = "force-dynamic";

export const CFG = {
  moduleSlug: "py",
  titleSingular: "Proyectos",
  displayField: "title",
} as const;

// -----------------------------
// Helpers: cargar schema/row
// -----------------------------
async function fetchSchemaBySlug(slug: string): Promise<ModuleSchema> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("modulos")
    .select("props")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error(`Error cargando schema de ${slug}:`, error);
    throw new Error(`No se pudo cargar el schema de ${slug}`);
  }
  if (!data) throw new Error(`Módulo '${slug}' no encontrado en modulos`);

  const raw = (data as any).props;
  return typeof raw === "string"
    ? (JSON.parse(raw) as ModuleSchema)
    : (raw as ModuleSchema);
}

async function fetchRowById(table: string, primaryKey: string, id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq(primaryKey, id)
    .maybeSingle();

  if (error) {
    console.error(`Error cargando ${table}(${id})`, {
      message: (error as any)?.message,
      code: (error as any)?.code,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
      status: (error as any)?.status,
      name: (error as any)?.name,
    });

    // Si quieres verlo “crudo” igualmente:
    try {
      console.error("Error raw:", JSON.stringify(error));
    } catch {
      console.error("Error raw (non-serializable):", error);
    }

    throw new Error((error as any)?.message || `No se pudo cargar el registro de ${table}`);
  }

  if (!data) return null;

  return {
    ...data,
    meta: (data as any).meta || { overrides: {} },
  };
}


// -----------------------------
// Helpers: extraer sources treeview desde schema
// -----------------------------
function extractTreeviewSourcesFromSchema(schema: ModuleSchema): string[] {
  const uiAny = (schema.ui || {}) as any;
  const tabs = Array.isArray(uiAny?.tabs) ? uiAny.tabs : [];
  const sources: string[] = [];

  for (const t of tabs) {
    const type = t?.type || t?.kind;
    if (type !== "treeview") continue;

    const cfg = t?.config ?? t;

    // legacy
    const legacy = cfg?.sourceTable;
    if (typeof legacy === "string" && legacy.trim()) sources.push(legacy.trim());

    // new
    const modern = cfg?.source?.table;
    if (typeof modern === "string" && modern.trim()) sources.push(modern.trim());
  }

  // legacy fuera de tabs (por si existe)
  const legacyTreeView = uiAny?.treeView;
  if (legacyTreeView) {
    const legacy = legacyTreeView?.sourceTable;
    if (typeof legacy === "string" && legacy.trim()) sources.push(legacy.trim());

    const modern = legacyTreeView?.source?.table;
    if (typeof modern === "string" && modern.trim()) sources.push(modern.trim());
  }

  return Array.from(new Set(sources));
}

// Si te guardan tabla en vez de slug, intenta resolverlo con slugByTable
function resolveSourceToSlug(source: string, slugByTable: Record<string, string>) {
  return slugByTable[source] || source;
}

async function resolveMaybePromise<T>(
  v: Promise<T> | T | undefined
): Promise<T | undefined> {
  if (!v) return undefined;
  return typeof (v as any).then === "function" ? await (v as any) : (v as any);
}

export default async function EntityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<Record<string, string>> | Record<string, string>;
}) {
  const p = await resolveMaybePromise(params);
  const sp = (await resolveMaybePromise(searchParams)) ?? {};

  const id = p?.id;
  if (!id) notFound();

  const isEdit = sp?.edit === "true";

  // 1) schema principal (del módulo actual)
  const schema = await fetchSchemaBySlug(CFG.moduleSlug);

  // 2) cargar modulos (desde DB) para construir:
  //    - modulesBySlug: db.table/primaryKey por slug
  //    - slugByTable: map de tabla -> slug (si config usa tabla en vez de slug)
  const supabase = await createClient();

  const { data: modulos, error } = await supabase
    .from("modulos")
    .select("slug, props, activo, tipo, orden, route");

  if (error) {
    console.error("Error cargando modulos:", error);
    throw new Error("No se pudieron cargar los módulos");
  }

  const modulesBySlug: Record<
    string,
    { db?: { table?: string; primaryKey?: string } }
  > = Object.fromEntries(
    (modulos || []).map((m: any) => {
      const props =
        typeof m.props === "string" ? JSON.parse(m.props) : m.props || {};
      return [
        m.slug,
        {
          db: {
            table: props?.db?.table ?? m.slug,
            primaryKey: props?.db?.primaryKey ?? "id",
          },
          route: props?.route ?? props?.ui?.route ?? m.route ?? null,
        },
      ];
    })
  );

  // 👇 IMPORTANTE: tu bucle original intentaba leer m.db.table pero m viene de "modulos"
  // y NO tiene "db" plano; está dentro de props. Aquí lo hacemos bien.
  const slugByTable: Record<string, string> = {};
  for (const m of modulos || []) {
    const props =
      typeof (m as any).props === "string"
        ? JSON.parse((m as any).props)
        : (m as any).props || {};

    const tableFromProps = props?.db?.table;
    if (tableFromProps && m.slug) {
      slugByTable[String(tableFromProps)] = String(m.slug);
    }

    // opcional: si quieres permitir que "slug === table" también cuente
    slugByTable[String(m.slug)] = String(m.slug);
  }

  // 3) tabla y PK reales del registro principal
  const table = CFG.moduleSlug;
  const primaryKey = schema.db?.primaryKey ?? "id";

  const row = await fetchRowById(table, primaryKey, id);
  if (!row) notFound();

  const display = (row as any)?.[CFG.displayField] ?? id;

  // 4) descubre sources treeview desde schema (sin hardcode)
  const rawSources = extractTreeviewSourcesFromSchema(schema);

  // 5) resuelve sources → slug (por si vienen como nombre de tabla)
  const sourceSlugs = rawSources.map((s) => resolveSourceToSlug(s, slugByTable));

  // 6) carga schemas necesarios para renderización (TreeView necesita fields del source)
  const schemasBySlug: Record<string, ModuleSchema> = {
    [CFG.moduleSlug]: schema,
  };

  for (const src of sourceSlugs) {
    if (!src) continue;
    if (schemasBySlug[src]) continue;

    try {
      schemasBySlug[src] = await fetchSchemaBySlug(src);
    } catch (e) {
      // Si falla, no rompas la página: simplemente no habrá renderización avanzada
      console.warn("No pude cargar schema para treeview source:", src, e);
    }
  }

  return (
    <main className="container py-4 bg-secondary bg-opacity-10 rounded">
      

      <FormClient
        schema={schema}
        initialData={row}
        mode={isEdit ? "edit" : "view"}
        table={table}
        primaryKey={primaryKey}
        id={id}
        modulesBySlug={modulesBySlug}
        schemasBySlug={schemasBySlug}
      />
    </main>
  );
}
