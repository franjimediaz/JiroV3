export const MODULE_READ_MODES = ["client", "server"] as const;

export type ModuleReadMode = (typeof MODULE_READ_MODES)[number];

export const DEFAULT_MODULE_READ_MODE: ModuleReadMode = "client";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeModuleReadMode(value: unknown): ModuleReadMode {
  return value === "server" ? "server" : DEFAULT_MODULE_READ_MODE;
}

export function getEffectiveModuleReadMode(moduleConfig: unknown): ModuleReadMode {
  if (!isRecord(moduleConfig)) return DEFAULT_MODULE_READ_MODE;
  const schema = isRecord(moduleConfig.schema) ? moduleConfig.schema : moduleConfig;
  const db = isRecord(schema.db) ? schema.db : {};
  return normalizeModuleReadMode(db.readMode);
}
