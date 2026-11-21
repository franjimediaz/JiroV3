/** Increment only when introducing a new supported wire format. */
export const WEB_SCHEMA_VERSION = 1 as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

/** Named CSS tokens, e.g. primary: "#123456", body: "Arial", small: "8px". */
export interface WebTheme {
  colors: Record<string, string>;
  typography: Record<string, string>;
  spacing: Record<string, string>;
}

export interface WebPage {
  id: string;
  path: string;
  title: string;
  description?: string;
  /** Puck-compatible JSON without a dependency on the editor. */
  puckData: JsonObject;
  schemaVersion: number;
}

export interface WebTemplate {
  id: string;
  name: string;
  description?: string;
  page: WebPage;
}

export interface WebHeaderLink { label: string; href: string; }
export interface WebGlobalHeader {
  enabled?: boolean;
  brandText?: string;
  logoSrc?: string;
  logoAlt?: string;
  homeHref?: string;
  links?: WebHeaderLink[];
  cta?: WebHeaderLink;
  backgroundColor?: string;
  color?: string;
  minHeight?: number;
  paddingX?: number;
  paddingY?: number;
  maxWidth?: number;
  alignment?: "start" | "center" | "end";
  sticky?: boolean;
}

export interface WebPublicationManifest {
  schemaVersion: number;
  publicationId: string;
  /** ISO 8601 timestamp with an explicit timezone. */
  publishedAt: string;
  theme: WebTheme;
  /** Optional site-wide header. Omitted manifests retain the original wire format. */
  header?: WebGlobalHeader;
  pages: WebPage[];
}

export type CreatePublicationManifestInput = Omit<WebPublicationManifest, "schemaVersion"> & {
  schemaVersion?: number;
};
