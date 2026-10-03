import type { ModuleSchema } from "@repo/types";

/** Reuse the provider's schema cache; providers without metadata keep legacy labels. */
export async function getRecordNameSchema(provider: { getSchema?: (slug: string) => Promise<ModuleSchema> }, slug: string) {
  try { return await provider.getSchema?.(slug); }
  catch { return undefined; }
}
