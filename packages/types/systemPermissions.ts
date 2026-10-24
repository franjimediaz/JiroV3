import { WORKFLOW_CATALOG } from "./workflows";

export type SystemPermissionGroup = {
  namespace: string;
  label: string;
  permissions: { action: string; label: string; description?: string }[];
};

export const SYSTEM_PERMISSION_GROUPS: SystemPermissionGroup[] = [{
  namespace: "workflows",
  label: "Workflows",
  permissions: [
    { action: "run", label: "Ejecutar workflows" },
    ...WORKFLOW_CATALOG.map(({ key, label }) => ({ action: key, label })),
  ],
}];

export type RolePermissions = Record<string, Record<string, boolean> | true>;
const validKey = (key: string) => key === "*" || (
  key.length <= 128 && /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(key)
  && !key.split(".").some(part => ["__proto__", "prototype", "constructor"].includes(part))
);

/** Valid action strings are retained, including extensions not in this UI catalog. */
export function isRolePermissions(value: unknown): value is RolePermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([namespace, actions]) => validKey(namespace) && (
    actions === true || (!!actions && typeof actions === "object" && !Array.isArray(actions)
      && Object.entries(actions).every(([action, enabled]) => validKey(action) && typeof enabled === "boolean"))
  ));
}

export function updatePermission(perms: RolePermissions, namespace: string, action: string, value: boolean): RolePermissions {
  const previous = perms[namespace];
  return { ...perms, [namespace]: { ...(previous === true ? { "*": true } : previous), [action]: value } };
}

export function permissionChecked(perms: RolePermissions, namespace: string, action: string): boolean {
  const actions = perms[namespace];
  return permissionInherited(perms, namespace, action) || (actions !== true && actions?.[action] === true);
}

export function permissionInherited(perms: RolePermissions, namespace: string, action: string): boolean {
  const actions = perms[namespace];
  const global = perms["*"];
  return actions === true || actions?.["*"] === true || global === true
    || global?.["*"] === true || global?.[action] === true;
}
