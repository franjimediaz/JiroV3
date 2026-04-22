"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isUUID } from "@/lib/utils/isUUID";
import { normalizeModuleDefaultFilters, normalizeSelectorTableFilters, VALID_FIELD_TYPES } from "@repo/types";

const TABLE = "modulos";

const FIELD_TYPES = VALID_FIELD_TYPES.reduce((set, type) => (set.add(type), set), new Set<string>());

function validateModuleProps(props: any): { ok: boolean; detail?: string } {
  if (!props || typeof props !== "object") return { ok: false, detail: "props debe ser un objeto" };
  if (!props.db || typeof props.db !== "object") return { ok: false, detail: "props.db es requerido" };
  if (!props.db.table || typeof props.db.table !== "string") {
    return { ok: false, detail: "props.db.table (string) es requerido" };
  }
  try {
    normalizeModuleDefaultFilters(props.db.defaultFilters);
  } catch {
    return { ok: false, detail: "props.db.defaultFilters inválido" };
  }
  if (!Array.isArray(props.fields)) return { ok: false, detail: "props.fields debe ser un array" };

  for (const [index, field] of props.fields.entries()) {
    if (!field || typeof field !== "object") return { ok: false, detail: `fields[${index}] debe ser objeto` };
    if (!field.name || typeof field.name !== "string") return { ok: false, detail: `fields[${index}].name requerido` };
    if (!field.label || typeof field.label !== "string") return { ok: false, detail: `fields[${index}].label requerido` };
    if (!FIELD_TYPES.has(field.type)) return { ok: false, detail: `fields[${index}].type inválido` };

    if (field.type === "selectorTabla") {
      const ref = field.ref;
      if (!ref || typeof ref !== "object" || typeof ref.moduleSlug !== "string" || typeof ref.displayField !== "string") {
        return { ok: false, detail: `fields[${index}].ref inválido para selectorTabla` };
      }

      try {
        normalizeSelectorTableFilters(ref.filters);
      } catch {
        return { ok: false, detail: `fields[${index}].ref.filters inválido para selectorTabla` };
      }
    }
  }

  return { ok: true };
}

export async function upsertModuloAction(formData: FormData): Promise<{ ok: boolean; detail: string; id?: string }> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr) return { ok: false, detail: `Auth error: ${authErr.message}` };
    if (!user) return { ok: false, detail: "No autenticado." };

    const { data: perfil } = await supabaseAdmin.from("users").select("role").eq("uid", user.id).maybeSingle();
    const role = perfil?.role ?? (user.app_metadata as any)?.role ?? (user.user_metadata as any)?.role;
    if (role !== "systemadmin") return { ok: false, detail: "Permisos insuficientes." };

    const idRaw = String(formData.get("id") || "");
    const id = idRaw && isUUID(idRaw) ? idRaw : "";
    const rawParent = String(formData.get("parent_id") ?? "");
    const parent_id = rawParent === "" ? null : rawParent;
    const nombre = String(formData.get("nombre") || "");
    const slug = String(formData.get("slug") || "");
    const route = String(formData.get("route") || "");
    const tipo = String(formData.get("tipo") || "tabla");
    const orden = Number(formData.get("orden") || 0);
    const activo = String(formData.get("activo") ?? "true") === "true";

    let props: any = {};
    try {
      props = JSON.parse(String(formData.get("props") || "{}"));
    } catch {
      return { ok: false, detail: "El JSON de props no es válido." };
    }

    if (!nombre) return { ok: false, detail: "nombre es requerido" };
    if (!slug) return { ok: false, detail: "slug es requerido" };
    if (!["carpeta", "tabla", "subtabla", "vista"].includes(tipo)) return { ok: false, detail: "tipo inválido" };
    if (Number.isNaN(orden) || orden < 0) return { ok: false, detail: "orden debe ser un entero >= 0" };

    if (tipo !== "carpeta") {
      const validation = validateModuleProps(props);
      if (!validation.ok) return { ok: false, detail: `Props inválidos: ${validation.detail}` };
    }

    if (!id) {
      let query = supabaseAdmin.from(TABLE).select("id").eq("slug", slug).limit(1);
      query = parent_id === null ? query.is("parent_id", null) : query.eq("parent_id", parent_id);

      const { data: existing, error: findErr } = await query.maybeSingle();
      if (findErr) return { ok: false, detail: `Find existente: ${findErr.message}` };
      if (existing) return { ok: false, detail: "Ya existe un módulo con ese slug en ese nivel." };

      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .insert({ parent_id, nombre, slug, route, tipo, orden, activo, props })
        .select("id")
        .single();

      if (error) return { ok: false, detail: `DB insert: ${error.message}` };
      return { ok: true, detail: "Módulo creado.", id: data!.id as string };
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({ parent_id, nombre, slug, route, tipo, orden, activo, props })
      .eq("id", id)
      .select("id")
      .single();

    if (error) return { ok: false, detail: `DB update: ${error.message}` };
    return { ok: true, detail: "Módulo actualizado.", id: data!.id as string };
  } catch (error: any) {
    return { ok: false, detail: error?.message ?? "Fallo inesperado." };
  }
}
