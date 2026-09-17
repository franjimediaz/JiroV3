import { normalizePermissionAction, requirePermission } from "./requirePermission";

export function requireModulePermission(moduleSlug: string, action: string) {
  return requirePermission(`${moduleSlug}.${normalizePermissionAction(action)}`);
}
