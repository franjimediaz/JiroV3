import { forbidden } from "./apiError";
import { requireUser, type CurrentUserContext } from "./getCurrentUser";

import {
  effectivePermissions,
  permissionGranted,
  normalizePermissionAction,
} from "./permissionRules";
export { normalizePermissionAction } from "./permissionRules";

const CONFIGURABLE_PERMISSION_PATTERN = /^[a-z0-9_-]+\.[a-z0-9_.-]+$/i;

export function configuredPermission(envName: string, fallback: string) {
  const value = process.env[envName]?.trim();
  if (!value) return fallback;
  return CONFIGURABLE_PERMISSION_PATTERN.test(value) ? value : fallback;
}

export function hasPermission(ctx: CurrentUserContext, permission: string) {
  const [moduleName, action = "ver"] = permission.split(".");
  return permissionGranted(
    ctx.permissions ?? effectivePermissions(ctx.role?.perms),
    moduleName!,
    action,
  );
}

export async function requirePermission(permission: string) {
  const ctx = await requireUser();
  const [moduleName, actionRaw = "ver"] = permission.split(".");
  const action = normalizePermissionAction(actionRaw);
  const permissionMatched = hasPermission(ctx, permission);

  if (process.env.NODE_ENV !== "production") {
    console.info("permission check", {
      uid: ctx.user.id,
      role_id: ctx.profile.role_id,
      role_slug: ctx.role?.slug ?? ctx.profile.role,
      moduleSlug: moduleName,
      normalizedAction: action,
      permissionMatched,
    });
  }

  if (!permissionMatched) throw forbidden();
  return ctx;
}
