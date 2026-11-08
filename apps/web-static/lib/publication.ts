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

export function getPublishedPage(webPath: string) {
  const normalized = normalizeWebPath(webPath);
  return getPublication().pages.find(({ page }) => page.path === normalized);
}
