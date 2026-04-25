import { createClient } from "@/lib/supabase/server";
import { normalizeModuleSchema, type NormalizedModuleSchema } from "@repo/types";

export type ResolvedModuleConfig = {
  id?: string;
  slug: string;
  table?: string;
  primaryKey: string;
  route: string;
  tipo?: string;
  schema: NormalizedModuleSchema;
  permissionsKey: string;
  isDataModule: boolean;
  requiresTable: boolean;
  titleSingular?: string;
  displayField?: string;
};

function parseProps(props: unknown) {
  if (typeof props !== "string") return props || {};
  try {
    return JSON.parse(props);
  } catch {
    return {};
  }
}

function cleanRoute(route: unknown, slug: string, options?: { isDataModule?: boolean }) {
  const raw = typeof route === "string" && route.trim() ? route.trim() : `/m/${slug}/`;
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;

  if (options?.isDataModule && !withLeadingSlash.startsWith("/m/") && !withLeadingSlash.startsWith("/system/")) {
    return `/m/${slug}/`;
  }

  return withLeadingSlash.replace(/\/?$/, "/");
}

function moduleRequiresTable(row: any, schema: NormalizedModuleSchema) {
  const tipo = String(row?.tipo || (schema as any)?.tipo || "").trim().toLowerCase();
  const table = String(schema?.db?.table || row?.table || "").trim();

  if (tipo === "carpeta" || tipo === "folder" || tipo === "menu" || tipo === "grupo") return false;
  if (tipo === "tabla" || tipo === "subtabla") return true;
  if (tipo === "vista") return Boolean(table || (Array.isArray(schema.fields) && schema.fields.length > 0));

  if (table) return true;
  if (Array.isArray(schema.fields) && schema.fields.length > 0) return true;

  return false;
}

export function resolveModuleConfigFromRow(row: any): ResolvedModuleConfig {
  const slug = String(row?.slug || row?.moduleSlug || "").trim();
  if (!slug) throw new Error("Modulo sin slug");

  const props = parseProps(row?.props);
  const schema = normalizeModuleSchema(props);
  const table = String(schema?.db?.table || row?.table || "").trim();
  const requiresTable = moduleRequiresTable(row, schema);
  if (requiresTable && !table) {
    throw new Error(`El modulo slug="${slug}" requiere db.table porque es un modulo de datos`);
  }

  const isDataModule = Boolean(table);
  const route = cleanRoute((props as any)?.route ?? (props as any)?.ui?.route ?? row?.route, slug, { isDataModule });
  const primaryKey = String(schema?.db?.primaryKey || "id").trim();

  return {
    id: row?.id ? String(row.id) : undefined,
    slug,
    table: table || undefined,
    primaryKey,
    route,
    tipo: row?.tipo ? String(row.tipo) : undefined,
    schema,
    permissionsKey: slug,
    isDataModule,
    requiresTable,
    titleSingular: String((props as any)?.ui?.titleSingular ?? row?.nombre ?? slug),
    displayField: String((props as any)?.ui?.displayField ?? "id"),
  };
}

export async function resolveModuleConfig(slugOrAlias: string): Promise<ResolvedModuleConfig> {
  const slug = String(slugOrAlias || "").trim();
  if (!slug) throw new Error("slug requerido");

  const supabase = await createClient();
  const { data: bySlug, error } = await supabase
    .from("modulos")
    .select("id,slug,props,activo,tipo,orden,route,nombre")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (bySlug) return resolveModuleConfigFromRow(bySlug);

  // Compatibilidad temporal: aceptar db.table/table solo si coincide con un modulo real.
  const { data: rows, error: indexError } = await supabase
    .from("modulos")
    .select("id,slug,props,activo,tipo,orden,route,nombre");

  if (indexError) throw new Error(indexError.message);

  for (const row of rows || []) {
    const resolved = resolveModuleConfigFromRow(row);
    if (resolved.table && resolved.table === slug) return resolved;
  }

  throw new Error(`Modulo '${slug}' no encontrado`);
}

export async function resolveModuleIndex() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modulos")
    .select("id,slug,props,route,nombre,tipo");

  if (error) throw new Error("No se pudieron cargar los modulos");

  const modulesBySlug: Record<string, any> = {};
  const slugByTable: Record<string, string> = {};

  for (const row of data || []) {
    const resolved = resolveModuleConfigFromRow(row);
    modulesBySlug[resolved.slug] = {
      id: resolved.id,
      nombre: row?.nombre,
      db: { table: resolved.table, primaryKey: resolved.primaryKey },
      route: resolved.route,
      tipo: resolved.tipo,
      schema: resolved.schema,
      ui: resolved.schema.ui,
    };

    if (resolved.table) slugByTable[resolved.table] = resolved.slug;
    slugByTable[resolved.slug] = resolved.slug;
  }

  return { modulesBySlug, slugByTable };
}
