import { createClient } from "@/lib/supabase/server";
import type { ModuleSchema } from "@repo/types";
import { resolveModuleConfig, resolveModuleIndex } from "@/lib/modules/resolveModuleConfig";

export async function fetchModuleRowBySlug(slug: string) {
  const resolved = await resolveModuleConfig(slug);
  return {
    slug: resolved.slug,
    schema: resolved.schema as ModuleSchema,
    table: resolved.table,
    primaryKey: resolved.primaryKey,
    route: resolved.route,
    isDataModule: resolved.isDataModule,
    requiresTable: resolved.requiresTable,
    titleSingular: resolved.titleSingular || resolved.slug,
    displayField: resolved.displayField || "id",
  };
}

export async function fetchAllModulesIndex() {
  return resolveModuleIndex();
}

export async function fetchRowById(table: string, primaryKey: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).select("*").eq(primaryKey, id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { ...data, meta: (data as any).meta || { overrides: {} } };
}
