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

export type ModuleAuditProps = {
  audit?: {
    enabled?: boolean;
    events?: ConfigurableAuditEvent[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getModuleAuditConfig(moduleConfig: unknown) {
  if (!isRecord(moduleConfig)) return null;
  const candidate = isRecord(moduleConfig.schema) ? moduleConfig.schema.audit : moduleConfig.audit;
  return isRecord(candidate) ? candidate : null;
}

function isConfigurableAuditEvent(value: unknown): value is ConfigurableAuditEvent {
  return CONFIGURABLE_AUDIT_EVENTS.includes(value as ConfigurableAuditEvent);
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
