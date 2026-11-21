"use server";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { webGlobalHeaderSchema, type WebGlobalHeader } from "@repo/web-schema";
import { readSiteHeader, settingsDatabaseError } from "@/lib/web-publication/siteSettings";
import { PublicationError } from "@/lib/web-publication/buildManifest";

async function authorize() {
  const context = await getCurrentUser();
  if (!context || context.role?.slug !== "systemadmin") throw new PublicationError("FORBIDDEN", "Acceso denegado.");
}
function failure(error: unknown) {
  return { ok: false as const, message: error instanceof PublicationError ? error.message : "No se pudo guardar o recuperar la configuración global.", header: null };
}
export async function getWebSiteSettings() {
  try { await authorize(); return { ok: true as const, header: await readSiteHeader() ?? null, message: "" }; }
  catch (error) { return failure(error); }
}
export async function saveWebSiteSettings(header: WebGlobalHeader) {
  try {
    await authorize();
    const parsed = webGlobalHeaderSchema.safeParse(header);
    if (!parsed.success) throw new PublicationError("VALIDATION", "Revisa los enlaces, las dimensiones y los colores HEX del Header.");
    const { data, error } = await supabaseAdmin.from("web_site_settings").upsert({ id: 1, header: parsed.data, updated_at: new Date().toISOString() }, { onConflict: "id" }).select("header").single();
    if (error) throw settingsDatabaseError(error);
    if (!data) throw new PublicationError("DATABASE", "No se pudo confirmar el guardado del Header.");
    return { ok: true as const, header: webGlobalHeaderSchema.parse(data.header), message: "Header guardado. Se incluirá en la próxima publicación." };
  } catch (error) { return failure(error); }
}
