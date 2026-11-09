"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { validateWebPuckData } from "@repo/web-puck";
import { normalizeWebPath, validateWebPage } from "@repo/web-schema";
import { createEditorExample, serializeEditorPage } from "@/app/(main)/system/web-editor/fixture";

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
    if (ok) revalidatePath("/system/web-pages");
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


type PageSummary = { id: string; path: string; title: string; description: string | null; revision: number; updated_at: string };
type PageDraft = PageSummary & { puckData: ReturnType<typeof validateWebPuckData> };
type Outcome<T> = { ok: true; code: "OK"; message: string; data: T } | { ok: false; code: string; message: string; data: null };
class PageError extends Error { constructor(public code: string, message: string) { super(message); } }
async function operation<T>(action: string, work: (actor: string) => Promise<T>): Promise<Outcome<T>> {
  let actorUserId: string | undefined;
  try {
    actorUserId = (await authorize(action)).user.id;
    const data = await work(actorUserId);
    if (["webPages.create", "webPages.metadata", "webPages.saveById"].includes(action)) {
      revalidatePath("/system/web-pages");
      if (data && typeof data === "object" && "id" in data && typeof data.id === "string") {
        revalidatePath("/system/web-pages/" + data.id);
        revalidatePath("/system/web-editor/" + data.id);
      }
      revalidatePath("/system/web-editor");
    }
    await writeAuditEvent({ action, actorUserId, requestId: randomUUID(), success: true });
    return { ok: true, code: "OK", message: "Operación completada.", data };
  } catch (error) {
    const code = error instanceof PageError ? error.code : error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "DATABASE";
    await writeAuditEvent({ action, actorUserId, requestId: randomUUID(), success: false, metadata: { code } });
    return { ok: false, code, message: error instanceof PageError ? error.message : code === "FORBIDDEN" ? "Acceso denegado." : "No se pudo completar la operación.", data: null };
  }
}
function fields(input: unknown, allowed: string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k))) throw new PageError("VALIDATION", "Argumentos inválidos.");
  return input as Record<string, unknown>;
}
function uuid(id: unknown): string {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new PageError("VALIDATION", "ID de página inválido.");
  return id;
}
function expectedRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value >= 2147483647) throw new PageError("VALIDATION", "Revisión inválida.");
  return value;
}
function metadata(input: Record<string, unknown>, puckData: unknown) {
  try {
    if (typeof input.path !== "string" || typeof input.title !== "string" || (input.description != null && typeof input.description !== "string")) throw new Error();
    const path = normalizeWebPath(input.path);
    const description = input.description as string | null ?? null;
    const page = validateWebPage({ id: "page", path, title: input.title, ...(description === null ? {} : {description}), puckData, schemaVersion: 1 });
    return { path: page.path, title: page.title, description };
  } catch { throw new PageError("VALIDATION", "Título, descripción o ruta inválidos o reservados."); }
}
function draft(value: unknown) {
  try { return validateWebPuckData(JSON.parse(serializeEditorPage(value))); }
  catch { throw new PageError("VALIDATION", "Datos Puck inválidos."); }
}
function databaseError(error: {code?: string} | null) {
  if (error?.code === "23505") throw new PageError("DUPLICATE", "Ya existe una página con esa ruta.");
  if (error) throw new PageError("DATABASE", "Error al acceder a las páginas.");
}
const summaryColumns = "id,path,title,description,revision,updated_at";
export async function listWebPages() {
  return operation("webPages.list", async () => {
    const { data, error } = await supabaseAdmin.from("web_pages").select(summaryColumns).order("path");
    databaseError(error);
    return (data as PageSummary[]).sort((a,b) => a.path === "/" ? -1 : b.path === "/" ? 1 : a.path.localeCompare(b.path));
  });
}
export async function createWebPage(input: unknown) {
  return operation("webPages.create", async actor => {
    const f = fields(input, ["path", "title", "description"]);
    const puckData = createEditorExample();
    const meta = metadata(f, puckData);
    puckData.root.props = { ...puckData.root.props, title: meta.title };
    const {data,error} = await supabaseAdmin.from("web_pages").insert({ ...meta, draft_data: draft(puckData), revision: 1, updated_by: actor }).select(summaryColumns).single();
    databaseError(error); return data as PageSummary;
  });
}
async function readPage(id: string): Promise<PageDraft | null> {
  const {data,error} = await supabaseAdmin.from("web_pages").select("id,path,title,description,revision,updated_at,draft_data").eq("id",id).maybeSingle();
  databaseError(error);
  if (!data) return null;
  return { id:data.id, path:data.path, title:data.title, description:data.description, revision:data.revision, updated_at:data.updated_at, puckData:draft(data.draft_data) };
}
export async function getWebPageById(id: unknown) {
  return operation("webPages.get", async () => {
    const page = await readPage(uuid(id));
    if (!page) throw new PageError("NOT_FOUND", "Página no encontrada.");
    return page;
  });
}
export async function updateWebPageMetadata(input: unknown) {
  return operation("webPages.metadata", async actor => {
    const f=fields(input,["id","path","title","description","revision"]), id=uuid(f.id), revision=expectedRevision(f.revision);
    const page=await readPage(id);
    if (!page) throw new PageError("NOT_FOUND","Página no encontrada.");
    if (page.revision !== revision) throw new PageError("CONFLICT","La página ha cambiado. Recarga antes de guardar.");
    const meta=metadata(f,page.puckData);
    page.puckData.root.props={...page.puckData.root.props,title:meta.title};
    const {data,error}=await supabaseAdmin.from("web_pages").update({...meta,draft_data:draft(page.puckData),revision:revision+1,updated_by:actor,updated_at:new Date().toISOString()}).eq("id",id).eq("revision",revision).select(summaryColumns).maybeSingle();
    databaseError(error);
    if(!data) throw new PageError("CONFLICT","La página ha cambiado. Recarga antes de guardar.");
    return data as PageSummary;
  });
}
export async function saveWebPageDraftById(input: unknown) {
  return operation("webPages.saveById",async actor=>{
    const f=fields(input,["id","revision","puckData"]), id=uuid(f.id), revision=expectedRevision(f.revision), puckData=draft(f.puckData);
    const title=puckData.root.props?.title;
    const {data: page,error: readError} = await supabaseAdmin.from("web_pages").select("path,description,revision").eq("id",id).maybeSingle();
    databaseError(readError);
    if (!page || page.revision !== revision) throw new PageError("CONFLICT","La página ha cambiado. Exporta tus cambios y recarga antes de guardar.");
    metadata({path:page.path,title,description:page.description},puckData);
    const {data,error}=await supabaseAdmin.from("web_pages").update({draft_data:puckData,title,revision:revision+1,updated_by:actor,updated_at:new Date().toISOString()}).eq("id",id).eq("revision",revision).select(summaryColumns).maybeSingle();
    databaseError(error);
    if(!data) throw new PageError("CONFLICT","La página ha cambiado. Exporta tus cambios y recarga antes de guardar.");
    return data as PageSummary;
  });
}
