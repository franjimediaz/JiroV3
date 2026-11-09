"use server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { serializePublicationManifest } from "@repo/web-schema";
import { buildManifest, MAX_PUBLICATION_BYTES, PublicationError, type PublicationPage } from "@/lib/web-publication/buildManifest";
import { defaultTheme } from "@/lib/web-publication/defaultTheme";

export async function generateWebPublication() {
  const requestId = randomUUID();
  let actorUserId: string | undefined;
  try {
    const context = await getCurrentUser();
    actorUserId = context?.user.id;
    if (!context || context.role?.slug !== "systemadmin") throw new PublicationError("FORBIDDEN", "Acceso denegado.");
    const pages: PublicationPage[] = [];
    let cursor: string | undefined;
    let bytes = 0;
    // Keyset pagination continues until an empty batch, even if the API caps batches below 100.
    for (;;) {
      let query = supabaseAdmin.from("web_pages").select("id,path,title,description,draft_data").order("id", { ascending: true }).limit(100);
      if (cursor) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error || !data) throw new PublicationError("DATABASE", "No se pudieron recuperar las páginas.");
      if (!data.length) break;
      for (const page of data) {
        bytes += Buffer.byteLength(JSON.stringify(page), "utf8");
        if (bytes > MAX_PUBLICATION_BYTES) throw new PublicationError("SIZE_LIMIT", "La publicación supera el límite de 1 MiB al leer la página " + page.path + ".");
        pages.push(page);
      }
      const next = data[data.length - 1]!.id as string;
      if (cursor && next <= cursor) throw new PublicationError("DATABASE", "No se pudo avanzar en la lectura de páginas.");
      cursor = next;
    }
    const publicationId = randomUUID();
    const manifest = buildManifest(pages, defaultTheme, publicationId, new Date().toISOString());
    const json = serializePublicationManifest(manifest);
    await writeAuditEvent({ action: "webPublication.generate", requestId, actorUserId, success: true, metadata: { publicationId, pageCount: manifest.pages.length } });
    return { ok: true, code: "OK", message: "JSON generado. Todavía no se ha publicado en GitHub ni Vercel.", json, publicationId, pageCount: manifest.pages.length };
  } catch (error) {
    const code = error instanceof PublicationError ? error.code : "INTERNAL";
    await writeAuditEvent({ action: "webPublication.generate", requestId, actorUserId, success: false, metadata: { code } });
    return { ok: false, code, message: error instanceof PublicationError ? error.message : "No se pudo generar la publicación.", json: null, publicationId: null, pageCount: 0 };
  }
}
