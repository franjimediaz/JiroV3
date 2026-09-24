"use server";

import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isUUID } from "@/lib/utils/isUUID";
import { normalizeModuleDefaultFilters, normalizeSelectorTableFilters, VALID_FIELD_TYPES } from "@repo/types";

const TABLE = "modulos";
const FIELD_NAMES = ["parent_id", "nombre", "slug", "route", "tipo", "orden", "activo", "props"];

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
    return { ok: false, detail: "props.db.defaultFilters invalido" };
  }
  if (!Array.isArray(props.fields)) return { ok: false, detail: "props.fields debe ser un array" };

  for (const [index, field] of props.fields.entries()) {
    if (!field || typeof field !== "object") return { ok: false, detail: `fields[${index}] debe ser objeto` };
    if (!field.name || typeof field.name !== "string") return { ok: false, detail: `fields[${index}].name requerido` };
    if (!field.label || typeof field.label !== "string") return { ok: false, detail: `fields[${index}].label requerido` };
    if (!FIELD_TYPES.has(field.type)) return { ok: false, detail: `fields[${index}].type invalido` };

    if (field.type === "selectorTabla") {
      const ref = field.ref;
      if (!ref || typeof ref !== "object" || typeof ref.moduleSlug !== "string" || typeof ref.displayField !== "string") {
        return { ok: false, detail: `fields[${index}].ref invalido para selectorTabla` };
      }

      try {
        normalizeSelectorTableFilters(ref.filters);
      } catch {
        return { ok: false, detail: `fields[${index}].ref.filters invalido para selectorTabla` };
      }
    }
  }

  return { ok: true };
}

export async function upsertModuloAction(formData: FormData): Promise<{ ok: boolean; detail: string; id?: string }> {
  const requestId = crypto.randomUUID();
  let actorUserId: string | null = null;
  let operation: "create" | "update" = "create";
  let resourceId: string | null = null;
  let slugForAudit = "";

  async function auditModulo(success: boolean, detail?: string) {
    await writeAuditEvent({
      actorUserId,
      module: "modulos",
      action: `module.${operation}`,
      resourceType: "modulos",
      resourceId,
      requestId,
      success,
      metadata: {
        operation,
        moduleSlug: slugForAudit || null,
        fieldNames: FIELD_NAMES,
        errorCode: success ? undefined : "ACTION_FAILED",
        detail: success ? undefined : detail,
      },
    });
  }

  async function fail(detail: string) {
    await auditModulo(false, detail);
    return { ok: false, detail };
  }

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr) return await fail(`Auth error: ${authErr.message}`);
    if (!user) return await fail("No autenticado.");
    actorUserId = user.id;

    const { data: perfil } = await supabaseAdmin.from("users").select("role").eq("uid", user.id).maybeSingle();
    const role = perfil?.role ?? (user.app_metadata as any)?.role ?? (user.user_metadata as any)?.role;
    if (role !== "systemadmin") return await fail("Permisos insuficientes.");

    const idRaw = String(formData.get("id") || "");
    const id = idRaw && isUUID(idRaw) ? idRaw : "";
    operation = id ? "update" : "create";
    resourceId = id || null;

    const rawParent = String(formData.get("parent_id") ?? "");
    const parent_id = rawParent === "" ? null : rawParent;
    const nombre = String(formData.get("nombre") || "");
    const slug = String(formData.get("slug") || "");
    slugForAudit = slug;
    const route = String(formData.get("route") || "");
    const tipo = String(formData.get("tipo") || "tabla");
    const orden = Number(formData.get("orden") || 0);
    const activo = String(formData.get("activo") ?? "true") === "true";

    let props: any = {};
    try {
      props = JSON.parse(String(formData.get("props") || "{}"));
    } catch {
      return await fail("El JSON de props no es valido.");
    }

    if (!nombre) return await fail("nombre es requerido");
    if (!slug) return await fail("slug es requerido");
    if (!["carpeta", "tabla", "subtabla", "vista"].includes(tipo)) return await fail("tipo invalido");
    if (Number.isNaN(orden) || orden < 0) return await fail("orden debe ser un entero >= 0");

    if (tipo !== "carpeta") {
      const validation = validateModuleProps(props);
      if (!validation.ok) return await fail(`Props invalidos: ${validation.detail}`);
    }

    if (!id) {
      let query = supabaseAdmin.from(TABLE).select("id").eq("slug", slug).limit(1);
      query = parent_id === null ? query.is("parent_id", null) : query.eq("parent_id", parent_id);

      const { data: existing, error: findErr } = await query.maybeSingle();
      if (findErr) return await fail(`Find existente: ${findErr.message}`);
      if (existing) return await fail("Ya existe un modulo con ese slug en ese nivel.");

      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .insert({ parent_id, nombre, slug, route, tipo, orden, activo, props })
        .select("id")
        .single();

      if (error) return await fail(`DB insert: ${error.message}`);
      resourceId = data!.id as string;
      await auditModulo(true);
      return { ok: true, detail: "Modulo creado.", id: data!.id as string };
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({ parent_id, nombre, slug, route, tipo, orden, activo, props })
      .eq("id", id)
      .select("id")
      .single();

    if (error) return await fail(`DB update: ${error.message}`);
    resourceId = data!.id as string;
    await auditModulo(true);
    return { ok: true, detail: "Modulo actualizado.", id: data!.id as string };
  } catch (error: any) {
    return await fail(error?.message ?? "Fallo inesperado.");
  }
}
