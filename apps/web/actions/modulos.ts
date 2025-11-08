"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isUUID } from "@/lib/utils/isUUID";
const TABLE = "modulos";

// --- Validación mínima de props (runtime, sin Zod) ---
const FIELD_TYPES = new Set([
  "text","textarea","number","money","date","datetime","boolean",
  "select","multiselect","color","file","image","selectorTabla",
]);

function validateModuleProps(props: any): { ok: boolean; detail?: string } {
  if (!props || typeof props !== "object") return { ok: false, detail: "props debe ser un objeto" };
  if (!props.db || typeof props.db !== "object") return { ok: false, detail: "props.db es requerido" };
  if (!props.db.table || typeof props.db.table !== "string") return { ok: false, detail: "props.db.table (string) es requerido" };
  if (!Array.isArray(props.fields)) return { ok: false, detail: "props.fields debe ser un array" };

  for (const [i, f] of props.fields.entries()) {
    if (!f || typeof f !== "object") return { ok: false, detail: `fields[${i}] debe ser objeto` };
    if (!f.name || typeof f.name !== "string") return { ok: false, detail: `fields[${i}].name requerido` };
    if (!f.label || typeof f.label !== "string") return { ok: false, detail: `fields[${i}].label requerido` };
    if (!FIELD_TYPES.has(f.type)) return { ok: false, detail: `fields[${i}].type inválido` };
    if (f.type === "selectorTabla") {
      const r = f.ref;
      if (!r || typeof r !== "object" || typeof r.moduleSlug !== "string" || typeof r.displayField !== "string") {
        return { ok: false, detail: `fields[${i}].ref inválido para selectorTabla` };
      }
    }
  }
  return { ok: true };
}

export async function upsertModuloAction(formData: FormData): Promise<{ ok: boolean; detail: string; id?: string }> {
  try {
    // 1) Auth + rol
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) return { ok: false, detail: `Auth error: ${authErr.message}` };
    if (!user) return { ok: false, detail: "No autenticado." };

    const { data: perfil } = await supabaseAdmin
      .from("users").select("role").eq("uid", user.id).maybeSingle();
    const role = perfil?.role ?? (user.app_metadata as any)?.role ?? (user.user_metadata as any)?.role;
    if (role !== "systemadmin") return { ok: false, detail: "Permisos insuficientes." };

    // 2) Payload
    const idRaw = (formData.get("id") || "") as string;
    const id = idRaw && isUUID(idRaw) ? idRaw : ""; 
  const rawParent = (formData.get("parent_id") ?? "") as string;
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

    // 3) Validaciones básicas
    if (!nombre) return { ok: false, detail: "nombre es requerido" };
    if (!slug) return { ok: false, detail: "slug es requerido" };
    if (!["carpeta", "tabla", "subtabla", "vista"].includes(tipo)) {
      return { ok: false, detail: "tipo inválido" };
    }
    if (Number.isNaN(orden) || orden < 0) return { ok: false, detail: "orden debe ser un entero >= 0" };

    if (tipo !== "carpeta") {
      const v = validateModuleProps(props);
      if (!v.ok) return { ok: false, detail: `Props inválidos: ${v.detail}` };
    }

    // 4) Crear o actualizar
    if (!id) {
      // crear (id vacío)
      let q = supabaseAdmin.from(TABLE).select("id").eq("slug", slug).limit(1);
      q = parent_id === null ? q.is("parent_id", null) : q.eq("parent_id", parent_id as string);
      const { data: existing, error: findErr } = await q.maybeSingle();
      if (findErr) return { ok: false, detail: `Find existente: ${findErr.message}` };
      if (existing) return { ok: false, detail: "Ya existe un módulo con ese slug en ese nivel." };

      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .insert({ parent_id, nombre, slug, route, tipo, orden, activo, props })
        .select("id")
        .single();
      if (error) return { ok: false, detail: `DB insert: ${error.message}` };
      return { ok: true, detail: "Módulo creado.", id: data!.id as string };
    } else {
      // actualizar
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .update({ parent_id, nombre, slug, route, tipo, orden, activo, props })
        .eq("id", id)
        .select("id")
        .single();
      if (error) return { ok: false, detail: `DB update: ${error.message}` };
      return { ok: true, detail: "Módulo actualizado.", id: data!.id as string };
    }
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? "Fallo inesperado." };
  }
}
