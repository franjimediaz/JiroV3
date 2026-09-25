import { createClient } from "@/lib/supabase/server";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";
import type { ModuleSchema } from "@repo/types";
import type { ModuleReadMode } from "@repo/types";
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
    readMode: resolved.readMode,
    titleSingular: resolved.titleSingular || resolved.slug,
    displayField: resolved.displayField || "id",
  };
}

export async function fetchAllModulesIndex() {
  return resolveModuleIndex();
}

export async function fetchRowById(
  table: string,
  primaryKey: string,
  id: string,
  options?: { readMode?: ModuleReadMode; permissionsKey?: string },
) {
  let queryClient: any = await createClient();
  if (options?.readMode === "server") {
    if (!options.permissionsKey) throw new Error("permissionsKey requerido para readMode=server");
    await requireModulePermission(options.permissionsKey, "ver");
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    queryClient = supabaseAdmin;
  }

  const { data, error } = await queryClient.from(table).select("*").eq(primaryKey, id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { ...data, meta: (data as any).meta || { overrides: {} } };
}
