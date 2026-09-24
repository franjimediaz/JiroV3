export const MODULE_CAPABILITY_KEYS = [
  "allowCreate",
  "allowDelete",
  "allowEdit",
  "allowExport",
  "allowImport",
  "allowSearch",
] as const;

export type ModuleCapabilityKey = (typeof MODULE_CAPABILITY_KEYS)[number];

export type ModuleCapabilities = Record<ModuleCapabilityKey, boolean>;

export type ModuleCapabilityAction =
  | "crear"
  | "actualizar"
  | "eliminar"
  | "importar"
  | "exportar"
  | "buscar";

export type ModuleCapabilitiesProps = {
  capabilities?: Partial<ModuleCapabilities>;
};

export const DEFAULT_MODULE_CAPABILITIES: ModuleCapabilities = {
  allowCreate: true,
  allowDelete: true,
  allowEdit: true,
  allowExport: true,
  allowImport: true,
  allowSearch: true,
};

export const MODULE_CAPABILITY_OPTIONS = [
  { key: "allowCreate", label: "Permitir crear" },
  { key: "allowDelete", label: "Permitir eliminar" },
  { key: "allowEdit", label: "Permitir editar" },
  { key: "allowExport", label: "Permitir exportar" },
  { key: "allowImport", label: "Permitir importar" },
  { key: "allowSearch", label: "Permitir buscar" },
] as const satisfies ReadonlyArray<{
  key: ModuleCapabilityKey;
  label: string;
}>;

export const MODULE_CAPABILITY_BY_ACTION = {
  crear: "allowCreate",
  actualizar: "allowEdit",
  eliminar: "allowDelete",
  importar: "allowImport",
  exportar: "allowExport",
  buscar: "allowSearch",
} as const satisfies Record<ModuleCapabilityAction, ModuleCapabilityKey>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getModuleCapabilitiesConfig(moduleConfig: unknown): Partial<ModuleCapabilities> | null {
  if (!isRecord(moduleConfig)) return null;
  const candidate = isRecord(moduleConfig.schema) ? moduleConfig.schema.capabilities : moduleConfig.capabilities;
  return isRecord(candidate) ? candidate : null;
}

export function getEffectiveModuleCapabilities(moduleConfig: unknown): ModuleCapabilities {
  const configured = getModuleCapabilitiesConfig(moduleConfig);
  if (!configured) return { ...DEFAULT_MODULE_CAPABILITIES };

  return MODULE_CAPABILITY_KEYS.reduce<ModuleCapabilities>(
    (acc, key) => ({
      ...acc,
      [key]: typeof configured[key] === "boolean" ? configured[key] : DEFAULT_MODULE_CAPABILITIES[key],
    }),
    { ...DEFAULT_MODULE_CAPABILITIES },
  );
}

export function buildModuleCapabilitiesConfig(capabilities: ModuleCapabilities): ModuleCapabilities {
  return MODULE_CAPABILITY_KEYS.reduce<ModuleCapabilities>(
    (acc, key) => ({
      ...acc,
      [key]: capabilities[key],
    }),
    { ...DEFAULT_MODULE_CAPABILITIES },
  );
}

export function applyModuleCapabilitiesToProps<T extends Record<string, unknown>>(
  props: T,
  capabilities: ModuleCapabilities,
): T & ModuleCapabilitiesProps {
  return {
    ...props,
    capabilities: buildModuleCapabilitiesConfig(capabilities),
  };
}

export function moduleCapabilityEnabled(moduleConfig: unknown, key: ModuleCapabilityKey): boolean {
  return getEffectiveModuleCapabilities(moduleConfig)[key];
}

export function isModuleActionAvailable(
  moduleConfig: unknown,
  action: ModuleCapabilityAction,
  hasRolePermission: boolean,
): boolean {
  return hasRolePermission && moduleCapabilityEnabled(moduleConfig, MODULE_CAPABILITY_BY_ACTION[action]);
}
