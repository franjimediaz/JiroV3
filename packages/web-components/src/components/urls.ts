/** Restrict URLs to web links, local paths and explicit contact schemes. */
export function safeUrl(value: string, image = false): string {
  const url = value.trim();
  if (!url || /[\u0000-\u0020\u007f\\\\]/u.test(url) || url.startsWith("//")) {
    throw new Error("Invalid URL");
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme && !(image ? ["http", "https"] : ["http", "https", "mailto", "tel"]).includes(scheme)) {
    throw new Error("Unsupported URL scheme");
  }
  return url;
}
