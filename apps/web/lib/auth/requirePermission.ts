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
  const { moduleName, action } = splitPermission(permission);
  return permissionGranted(
    ctx.permissions ?? effectivePermissions(ctx.role?.perms),
    moduleName,
    action,
  );
}

function splitPermission(permission: string) {
  const dotIndex = permission.indexOf(".");
  return dotIndex === -1
    ? { moduleName: permission, action: "ver" }
    : { moduleName: permission.slice(0, dotIndex), action: permission.slice(dotIndex + 1) };
}

export async function requirePermission(permission: string) {
  const ctx = await requireUser();
  const { moduleName, action: actionRaw } = splitPermission(permission);
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
