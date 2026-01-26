"use server";

import { createClient } from "@/lib/supabase/server";

export async function upsertPdfTemplateAction(fd: FormData) {
  const supabase = await createClient();

  const id = (fd.get("id") as string) || null;
  const name = String(fd.get("name") || "");
  const slug = String(fd.get("slug") || "");
  const source_table = String(fd.get("source_table") || "");
  const is_active = String(fd.get("is_active") || "true") === "true";

  if (!name || !slug || !source_table) {
    return { ok: false, detail: "name, slug y source_table son requeridos", id: null as any };
  }

  let template: any;
  let related: any;

  try {
    template = JSON.parse(String(fd.get("template") || "{}"));
  } catch {
    return { ok: false, detail: "template JSON inválido", id: null as any };
  }

  try {
    related = JSON.parse(String(fd.get("related") || "[]"));
    if (!Array.isArray(related)) throw new Error();
  } catch {
    return { ok: false, detail: "related debe ser un JSON array", id: null as any };
  }

  const payload = { name, slug, source_table, template, related, is_active };

  const q = id
    ? supabase.from("pdf_templates").update(payload).eq("id", id).select("id").maybeSingle()
    : supabase.from("pdf_templates").insert(payload).select("id").maybeSingle();

  const { data, error } = await q;

  if (error) return { ok: false, detail: error.message, id: null as any };
  if (!data?.id) return { ok: false, detail: "No se devolvió id", id: null as any };

  return { ok: true, detail: "Guardado", id: data.id };
}

export async function deletePdfTemplateAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("pdf_templates").delete().eq("id", id);
  if (error) return { ok: false, detail: error.message };
  return { ok: true, detail: "Eliminado" };
}
