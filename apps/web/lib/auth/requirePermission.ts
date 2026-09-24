import { forbidden } from "./apiError";
import { requireUser, type CurrentUserContext, type RolePerms } from "./getCurrentUser";

export const ACTION_PERMISSION_MAP = {
  read: "ver",
  view: "ver",
  list: "ver",
  get: "ver",
  create: "crear",
  add: "crear",
  new: "crear",
  edit: "actualizar",
  update: "actualizar",
  delete: "eliminar",
  remove: "eliminar",
} as const satisfies Record<string, string>;

const CONFIGURABLE_PERMISSION_PATTERN = /^[a-z0-9_-]+\.[a-z0-9_.-]+$/i;

export function configuredPermission(envName: string, fallback: string) {
  const value = process.env[envName]?.trim();
  if (!value) return fallback;
  return CONFIGURABLE_PERMISSION_PATTERN.test(value) ? value : fallback;
}

function normalizeModule(value: string) {
  let out = value.trim().toLowerCase();
  out = out.split("?")[0].split("#")[0].replace(/^\/+/, "").replace(/^public\./, "");
  if (out.includes("/")) out = out.split("/").filter(Boolean).pop() || out;
  if (out.includes(".")) out = out.split(".").filter(Boolean).pop() || out;
  return out;
}

export function normalizePermissionAction(value: string) {
  const key = value.trim().toLowerCase();
  return ACTION_PERMISSION_MAP[key as keyof typeof ACTION_PERMISSION_MAP] || key;
}

export function resolvePermissionParts(permission: string) {
  const [moduleRaw, actionRaw = "ver"] = permission.split(".");
  return {
    moduleName: normalizeModule(moduleRaw),
    action: normalizePermissionAction(actionRaw),
  };
}

function matchesRolePerms(perms: RolePerms, moduleName: string, action: string) {
  if (!perms || typeof perms !== "object") return false;

  const wildcard = perms["*"];
  if (wildcard === true) return true;
  if (wildcard && typeof wildcard === "object" && (wildcard["*"] === true || wildcard[action] === true)) return true;

  const modulePerms = perms[moduleName];
  if (modulePerms === true) return true;
  return Boolean(modulePerms && typeof modulePerms === "object" && (modulePerms["*"] === true || modulePerms[action] === true));
}

export function hasPermission(ctx: CurrentUserContext, permission: string) {
  const { moduleName, action } = resolvePermissionParts(permission);
  const perms = ctx.role?.perms || {};

  return matchesRolePerms(perms, moduleName, action);
}

async function canByDatabasePolicy(ctx: CurrentUserContext, moduleName: string, action: string) {
  const { data, error } = await (ctx.supabase as any).rpc("can", {
    modulo: moduleName,
    accion: action,
  });

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("permission rpc failed", {
        uid: ctx.user.id,
        role_id: ctx.profile.role_id,
        role_slug: ctx.role?.slug ?? ctx.profile.role,
        moduleSlug: moduleName,
        normalizedAction: action,
        error: error.message,
      });
    }
    return false;
  }

  return data === true;
}

export async function requirePermission(permission: string) {
  const ctx = await requireUser();
  const { moduleName, action } = resolvePermissionParts(permission);
  let permissionMatched = hasPermission(ctx, permission);

  if (!permissionMatched) {
    permissionMatched = await canByDatabasePolicy(ctx, moduleName, action);
  }

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
