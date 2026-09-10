import { forbidden } from "./apiError";
import { requireUser, type CurrentUserContext } from "./getCurrentUser";

const ACTION_ALIASES: Record<string, string> = {
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
};

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

function normalizeAction(value: string) {
  const key = value.trim().toLowerCase();
  return ACTION_ALIASES[key] || key;
}

export function hasPermission(ctx: CurrentUserContext, permission: string) {
  const [moduleRaw, actionRaw = "ver"] = permission.split(".");
  const moduleName = normalizeModule(moduleRaw);
  const action = normalizeAction(actionRaw);
  const perms = ctx.role?.perms || {};

  const wildcard = perms["*"];
  if (wildcard === true) return true;
  if (wildcard && typeof wildcard === "object" && (wildcard["*"] === true || wildcard[action] === true)) return true;

  const modulePerms = perms[moduleName];
  if (modulePerms === true) return true;
  return Boolean(modulePerms && typeof modulePerms === "object" && (modulePerms["*"] === true || modulePerms[action] === true));
}

export async function requirePermission(permission: string) {
  const ctx = await requireUser();
  if (!hasPermission(ctx, permission)) throw forbidden();
  return ctx;
}
