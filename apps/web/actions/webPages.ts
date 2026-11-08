"use server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { validateWebPuckData } from "@repo/web-puck";
import { validateWebPage } from "@repo/web-schema";
import { serializeEditorPage } from "@/app/(main)/system/web-editor/fixture";

async function authorize(action: string) {
  const context = await getCurrentUser();
  if (!context || context.role?.slug !== "systemadmin") {
    await writeAuditEvent({ action, requestId: randomUUID(), actorUserId: context?.user.id, success: false, metadata: { code: "FORBIDDEN" } });
    throw new Error("FORBIDDEN");
  }
  return context;
}
export async function getWebPageDraft() {
  const context = await authorize("webPages.load");
  try {
    const { data, error } = await supabaseAdmin.from("web_pages").select("id,title,description,revision,draft_data").eq("path", "/").maybeSingle();
    if (error) throw new Error("No se pudo cargar el borrador.");
    const result = data ? { id: String(data.id), title: String(data.title), description: data.description as string | null, revision: Number(data.revision), puckData: validateWebPuckData(data.draft_data) } : null;
    if (result && (!Number.isInteger(result.revision) || result.revision < 1)) throw new Error("Revisión de borrador inválida.");
    await writeAuditEvent({ action: "webPages.load", requestId: randomUUID(), actorUserId: context.user.id, success: true, resourceId: result?.id });
    return result;
  } catch (error) {
    await writeAuditEvent({ action: "webPages.load", requestId: randomUUID(), actorUserId: context.user.id, success: false });
    throw error;
  }
}
export async function saveWebPageDraft(input: unknown) {
  let actorUserId: string | undefined;
  const finish = async (ok: boolean, code: string, message: string, revision: number | null = null, id: string | null = null) => {
    await writeAuditEvent({ action: "webPages.save", requestId: randomUUID(), actorUserId, success: ok, resourceId: id, metadata: { code, revision } });
    return { ok, code, message, revision, id };
  };
  try { actorUserId = (await authorize("webPages.save")).user.id; }
  catch { return finish(false, "FORBIDDEN", "No tienes permiso para guardar borradores."); }
  let title: string, description: string | null, revision: number | null, puckData;
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    const fields = input as Record<string, unknown>;
    if (Object.keys(fields).some(key => !["title", "description", "puckData", "revision"].includes(key))) throw new Error();
    if (typeof fields.title !== "string" || (fields.description != null && typeof fields.description !== "string")) throw new Error();
    if (fields.revision !== null && (!Number.isInteger(fields.revision) || Number(fields.revision) < 1 || Number(fields.revision) >= 2147483647)) throw new Error();
    title = fields.title; description = fields.description as string | null ?? null; revision = fields.revision as number | null;
    puckData = validateWebPuckData(JSON.parse(serializeEditorPage(fields.puckData)));
    validateWebPage({ id: "root", path: "/", title, ...(description === null ? {} : { description }), puckData, schemaVersion: 1 });
  } catch { return finish(false, "VALIDATION", "El título, la revisión o los datos de la página no son válidos."); }
  try {
    const values = { title, description, draft_data: puckData, updated_by: actorUserId, updated_at: new Date().toISOString(), revision: revision === null ? 1 : revision + 1 };
    const query = revision === null
      ? supabaseAdmin.from("web_pages").insert({ ...values, path: "/" })
      : supabaseAdmin.from("web_pages").update(values).eq("path", "/").eq("revision", revision);
    const { data, error } = await query.select("id,revision").maybeSingle();
    if (error?.code === "23505" || (!error && !data)) return finish(false, "CONFLICT", "Otra sesión ha cambiado el borrador. Exporta tus cambios y recarga antes de guardar.");
    if (error) return finish(false, "DATABASE", "No se pudo guardar el borrador. Inténtalo de nuevo.");
    if (!data) return finish(false, "DATABASE", "Respuesta de guardado inválida.");
    return finish(true, "OK", "Borrador guardado.", data.revision, data.id);
  } catch { return finish(false, "DATABASE", "No se pudo guardar el borrador. Inténtalo de nuevo."); }
}

