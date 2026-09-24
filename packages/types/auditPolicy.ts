export const CONFIGURABLE_AUDIT_EVENTS = [
  "record.create",
  "record.update",
  "record.delete",
  "record.read",
  "file.upload",
] as const;

export const DEFAULT_MODULE_AUDIT_EVENTS = [
  "record.create",
  "record.update",
  "record.delete",
  "file.upload",
] as const;

export const MANDATORY_AUDIT_EVENTS = [
  "users.create",
  "users.roles.update",
  "workflows.run",
] as const;

export type ConfigurableAuditEvent = (typeof CONFIGURABLE_AUDIT_EVENTS)[number];
export type MandatoryAuditEvent = (typeof MANDATORY_AUDIT_EVENTS)[number];
export type AuditEventName = ConfigurableAuditEvent | MandatoryAuditEvent;

export const MODULE_AUDIT_EVENT_OPTIONS = [
  { event: "record.create", label: "Crear registros" },
  { event: "record.update", label: "Modificar registros" },
  { event: "record.delete", label: "Eliminar registros" },
  { event: "record.read", label: "Consultar registros", highVolume: true },
  { event: "file.upload", label: "Subir archivos" },
] as const satisfies ReadonlyArray<{
  event: ConfigurableAuditEvent;
  label: string;
  highVolume?: boolean;
}>;

export type ModuleAuditConfig = {
  enabled?: boolean;
  events?: ConfigurableAuditEvent[];
};

export type ModuleAuditProps = {
  audit?: ModuleAuditConfig;
};

export type EffectiveModuleAuditConfig = {
  enabled: boolean;
  events: Record<ConfigurableAuditEvent, boolean>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getModuleAuditConfig(moduleConfig: unknown): ModuleAuditConfig | null {
  if (!isRecord(moduleConfig)) return null;
  const candidate = isRecord(moduleConfig.schema) ? moduleConfig.schema.audit : moduleConfig.audit;
  return isRecord(candidate) ? candidate : null;
}

function isConfigurableAuditEvent(value: unknown): value is ConfigurableAuditEvent {
  return CONFIGURABLE_AUDIT_EVENTS.includes(value as ConfigurableAuditEvent);
}

function eventMapFromList(events: readonly ConfigurableAuditEvent[]) {
  const selected = new Set(events);
  return Object.fromEntries(
    CONFIGURABLE_AUDIT_EVENTS.map((event) => [event, selected.has(event)]),
  ) as Record<ConfigurableAuditEvent, boolean>;
}

export function getEffectiveModuleAuditConfig(moduleConfig: unknown): EffectiveModuleAuditConfig {
  const audit = getModuleAuditConfig(moduleConfig);
  if (!audit) {
    return {
      enabled: true,
      events: eventMapFromList(DEFAULT_MODULE_AUDIT_EVENTS),
    };
  }

  if (audit.enabled === false) {
    return {
      enabled: false,
      events: eventMapFromList(
        Array.isArray(audit.events) ? audit.events.filter(isConfigurableAuditEvent) : DEFAULT_MODULE_AUDIT_EVENTS,
      ),
    };
  }

  const events = Array.isArray(audit.events)
    ? audit.events.filter(isConfigurableAuditEvent)
    : DEFAULT_MODULE_AUDIT_EVENTS;

  return {
    enabled: true,
    events: eventMapFromList(events),
  };
}

export function buildModuleAuditConfig(config: EffectiveModuleAuditConfig): ModuleAuditConfig {
  if (!config.enabled) return { enabled: false };

  return {
    enabled: true,
    events: CONFIGURABLE_AUDIT_EVENTS.filter((event) => config.events[event]),
  };
}

export function applyModuleAuditConfigToProps<T extends Record<string, unknown>>(
  props: T,
  config: EffectiveModuleAuditConfig,
): T & ModuleAuditProps {
  return {
    ...props,
    audit: buildModuleAuditConfig(config),
  };
}

export function shouldAuditEvent(moduleConfig: unknown, event: AuditEventName): boolean {
  if (MANDATORY_AUDIT_EVENTS.includes(event as MandatoryAuditEvent)) return true;

  const audit = getModuleAuditConfig(moduleConfig);
  if (!audit) {
    return DEFAULT_MODULE_AUDIT_EVENTS.includes(event as (typeof DEFAULT_MODULE_AUDIT_EVENTS)[number]);
  }

  if (audit.enabled === false) return false;

  if (Array.isArray(audit.events)) {
    return audit.events.filter(isConfigurableAuditEvent).includes(event as ConfigurableAuditEvent);
  }

  return DEFAULT_MODULE_AUDIT_EVENTS.includes(event as (typeof DEFAULT_MODULE_AUDIT_EVENTS)[number]);
}
