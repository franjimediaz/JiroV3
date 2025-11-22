// apps/web/lib/modulos.ts (ajusta la ruta según tu estructura)

import { createClient } from "@/lib/supabase/server";
import type { ModuleSchema } from "@repo/types";

export type ModuloTipo = "carpeta" | "tabla" | "subtabla" | "vista";

export type ModuloRecord = {
  id: string;
  nombre: string;
  slug: string;
  route?: string;
  tipo: ModuloTipo;
  orden?: number;
  activo?: boolean;
  props: ModuleSchema; // ← aquí ya lo tipamos como ModuleSchema
};

/**
 * Carga un módulo por su slug desde la tabla `modulos`.
 * Devuelve el registro completo con `props` tipado como `ModuleSchema`.
 */
export async function fetchModuloBySlug(slug: string): Promise<ModuloRecord> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("modulos")
    .select("id,nombre,slug,route,tipo,orden,activo,props")
    .eq("slug", slug)
    .single();

  if (error) {
    console.error("Error al cargar módulo por slug", { slug, error });
    throw new Error(
      `No se pudo cargar el módulo con slug "${slug}": ${error.message}`
    );
  }

  if (!data) {
    throw new Error(`No se encontró módulo con slug "${slug}"`);
  }

  // `props` viene como jsonb → lo casteamos a ModuleSchema
  const props = (data.props ?? {}) as ModuleSchema;

  return {
    id: data.id,
    nombre: data.nombre,
    slug: data.slug,
    route: data.route ?? undefined,
    tipo: data.tipo as ModuloTipo,
    orden: data.orden ?? undefined,
    activo: data.activo ?? true,
    props,
  };
}
