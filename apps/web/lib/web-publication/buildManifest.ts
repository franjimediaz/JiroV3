import { createPublicationManifest, normalizeWebPath, serializePublicationManifest, validatePublicationManifest, validateWebPage, WEB_SCHEMA_VERSION, type WebTheme } from "@repo/web-schema";
import { validateWebPuckData } from "@repo/web-puck";

export type PublicationPage = { id: string; path: string; title: string; description: string | null; draft_data: unknown };
// Keep generated JSON bounded to the unchanged 1 MiB Server Action data budget.
export const MAX_PUBLICATION_BYTES = 1024 * 1024;
export class PublicationError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function buildManifest(rows: readonly PublicationPage[], theme: WebTheme, publicationId: string, publishedAt: string) {
  const paths = new Map<string, string>();
  const pages = rows.map(row => {
    const label = String(row.path) + " (" + String(row.id) + ")";
    try {
      const path = normalizeWebPath(row.path);
      if (paths.has(path)) throw new Error("Ruta duplicada con " + paths.get(path));
      const puckData = validateWebPuckData(row.draft_data);
      const page = validateWebPage({ id: row.id, path, title: row.title, ...(row.description === null ? {} : { description: row.description }), puckData, schemaVersion: WEB_SCHEMA_VERSION });
      paths.set(path, label);
      return page;
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 500) : "Datos inválidos";
      throw new PublicationError("VALIDATION", "Página " + label + ": " + detail);
    }
  });
  if (!paths.has("/")) throw new PublicationError("VALIDATION", 'Falta la página raíz "/".');
  pages.sort((a,b) => a.path === b.path ? 0 : a.path === "/" ? -1 : b.path === "/" ? 1 : a.path < b.path ? -1 : 1);
  try {
    const manifest = validatePublicationManifest(createPublicationManifest({ pages, theme, publicationId, publishedAt, schemaVersion: WEB_SCHEMA_VERSION }));
    if (new TextEncoder().encode(serializePublicationManifest(manifest)).byteLength > MAX_PUBLICATION_BYTES) {
      throw new PublicationError("SIZE_LIMIT", "La publicación supera el límite de 1 MiB de datos.");
    }
    return manifest;
  } catch (error) {
    if (error instanceof PublicationError) throw error;
    throw new PublicationError("VALIDATION", "El tema, identificador o fecha del manifiesto no son válidos.");
  }
}
