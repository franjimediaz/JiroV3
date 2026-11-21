import { readFileSync } from "node:fs";
import path from "node:path";
import { cache } from "react";
import { normalizeWebPath, parsePublicationManifest } from "@repo/web-schema";
import { validateWebPuckData } from "@repo/web-puck";

// pnpm/Next run this app with apps/web-static as their working directory.
// Every page is validated before any publication content is returned to a route.
export const getPublication = cache(() => {
  const manifest = parsePublicationManifest(
    readFileSync(path.join(process.cwd(), "content", "publication.json"), "utf8"),
  );
  if (!manifest.pages.some((page) => page.path === "/")) {
    throw new Error("The publication must contain a root page");
  }
  const pages = manifest.pages.map((page) => {
    try {
      return { page, data: validateWebPuckData(page.puckData) };
    } catch (cause) {
      throw new Error(`Invalid Puck data for publication page ${page.path}`, { cause });
    }
  });
  return { manifest, pages };
});

function hasHeader(nodes: unknown): boolean {
  if (!Array.isArray(nodes)) return false;
  return nodes.some((node) => {
    if (!node || typeof node !== "object") return false;
    const record = node as { type?: unknown; props?: Record<string, unknown> };
    if (record.type === "Header") return true;
    const props = record.props;
    return !!props && [props.content, props.first, props.second, props.third].some(hasHeader);
  });
}

export function getPublishedPage(webPath: string) {
  const normalized = normalizeWebPath(webPath);
  const publication = getPublication();
  const published = publication.pages.find(({ page }) => page.path === normalized);
  if (!published) return undefined;
  const header = publication.manifest.header && !hasHeader(published.data.content) ? publication.manifest.header : undefined;
  return { ...published, header };
}
