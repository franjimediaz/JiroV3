import { requirePermission } from "./requirePermission";

export function requireModulePermission(moduleSlug: string, action: string) {
  return requirePermission(`${moduleSlug}.${action}`);
}
