import { createClient } from "@/lib/supabase/server";
import type { ModuleSchema } from "@repo/types";

export async function fetchModuleRowBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modulos")
    .select("slug, props, activo, tipo, orden, route, nombre")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Módulo '${slug}' no encontrado`);

  const props = typeof (data as any).props === "string" ? JSON.parse((data as any).props) : (data as any).props || {};
  const schema = props as ModuleSchema;

  const table = String(schema?.db?.table || "").trim();
  if (!table) {
    throw new Error(`El módulo slug="${slug}" no tiene props.db.table`);
  }
  const primaryKey = schema?.db?.primaryKey || "id";
  const route = (props?.route ?? props?.ui?.route ?? (data as any).route ?? `/${slug}/`) as string;

  // title/displayField opcionales (si existen en tu schema.ui)
  const titleSingular =
    (props?.ui?.titleSingular ?? (data as any).nombre ?? slug) as string;
  const displayField =
    (props?.ui?.displayField ?? "id") as string;

  return { slug, schema, table, primaryKey, route, titleSingular, displayField };
}

export async function fetchAllModulesIndex() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modulos")
    .select("slug, props, route, nombre");

  if (error) throw new Error("No se pudieron cargar los módulos");

  const modulesBySlug: Record<string, any> = {};
  const slugByTable: Record<string, string> = {};

  for (const m of data || []) {
    const props = typeof (m as any).props === "string" ? JSON.parse((m as any).props) : (m as any).props || {};
    const table = props?.db?.table ?? (m as any).slug;
    const primaryKey = props?.db?.primaryKey ?? "id";
    const route = props?.route ?? props?.ui?.route ?? (m as any).route ?? null;

    modulesBySlug[(m as any).slug] = {
      nombre: (m as any).nombre,
      db: { table, primaryKey },
      route,
      ui: props?.ui,
    };

    slugByTable[String(table)] = String((m as any).slug);
    slugByTable[String((m as any).slug)] = String((m as any).slug);
  }

  return { modulesBySlug, slugByTable };
}

export async function fetchRowById(table: string, primaryKey: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).select("*").eq(primaryKey, id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { ...data, meta: (data as any).meta || { overrides: {} } };
}
