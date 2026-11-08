import { WEB_SCHEMA_VERSION, type CreatePublicationManifestInput, type WebPublicationManifest } from "./types.js";
import { validatePublicationManifest } from "./validation.js";

/** IDs and timestamps are supplied by the caller to keep creation deterministic. */
export function createPublicationManifest(input: CreatePublicationManifestInput): WebPublicationManifest {
  return validatePublicationManifest({ ...input, schemaVersion: input.schemaVersion === undefined ? WEB_SCHEMA_VERSION : input.schemaVersion });
}

export function serializePublicationManifest(manifest: unknown): string {
  return JSON.stringify(validatePublicationManifest(manifest));
}

/** Throws SyntaxError for malformed JSON or ZodError for invalid manifest data. */
export function parsePublicationManifest(json: string): WebPublicationManifest {
  return validatePublicationManifest(JSON.parse(json));
}
