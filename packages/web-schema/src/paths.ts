/** First segments owned by the runtime or static asset pipeline. */
export const RESERVED_WEB_PATH_SEGMENTS: readonly string[] = Object.freeze([
  "_next", "_vercel", "api", "assets", "static", "images", "fonts",
  "favicon.ico", "robots.txt", "sitemap.xml", "index.html", "404.html", "_not-found",
]);

/** Canonical absolute paths: trim outer whitespace, collapse slashes, remove trailing slash.
 * Encoded segments, URL suffixes, dot segments and filesystem-special names are rejected.
 * Case is preserved; reserved names are checked case-insensitively.
 */
export function normalizeWebPath(value: string): string {
  if (typeof value !== "string") throw new TypeError("Web path must be a string");
  if (/[\u0000-\u001f\u007f]/u.test(value)) throw new Error("Unsafe control character in web path");
  const path = value.trim().normalize("NFC");
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Web path must be absolute and local");
  const segments = path.split("/").filter(Boolean);
  for (const segment of segments) {
    if (
      segment === "." || segment === ".." ||
      !/^[\p{L}\p{N}_-][\p{L}\p{N}_.-]*$/u.test(segment) ||
      segment.endsWith(".") ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)
    ) throw new Error("Unsafe web path segment");
  }
  if (segments[0] && RESERVED_WEB_PATH_SEGMENTS.includes(segments[0].toLowerCase())) {
    throw new Error("Reserved web path");
  }
  return `/${segments.join("/")}`;
}
