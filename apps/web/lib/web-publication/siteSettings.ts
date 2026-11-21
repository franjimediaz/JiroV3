import { webGlobalHeaderSchema, type WebGlobalHeader } from "@repo/web-schema";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PublicationError } from "./buildManifest";

export function settingsDatabaseError(error: { code?: string }) {
  return new PublicationError("DATABASE", ["42P01", "PGRST205"].includes(error.code || "")
    ? "Falta la tabla web_site_settings. Ejecuta manualmente docs/sql/web_site_settings.sql. No se ha guardado ni generado ninguna publicación."
    : "No se pudo acceder a la configuración global de la web.");
}

export async function readSiteHeader(): Promise<WebGlobalHeader | undefined> {
  const { data, error } = await supabaseAdmin.from("web_site_settings").select("header").eq("id", 1).maybeSingle();
  if (error) throw settingsDatabaseError(error);
  if (!data || data.header === null) return undefined;
  const result = webGlobalHeaderSchema.safeParse(data.header);
  if (!result.success) throw new PublicationError("VALIDATION", "La configuración del Header guardada no es válida.");
  return result.data;
}
