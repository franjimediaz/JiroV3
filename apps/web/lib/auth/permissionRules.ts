export type EffectivePermission = { modulo: string; accion: string };
export const ACTION_PERMISSION_MAP: Record<string, string> = {
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
export function normalizePermissionAction(value: string) {
  const key = value.trim().toLowerCase();
  return ACTION_PERMISSION_MAP[key] || key;
}
export function normalizePermissionModule(value: string) {
  let out = value
    .trim()
    .toLowerCase()
    .split("?")[0]!
    .split("#")[0]!
    .replace(/^\/+/, "")
    .replace(/^public\./, "")
    .replace(/\\/g, "/");
  if (out.includes("/")) out = out.split("/").filter(Boolean).pop() || out;
  if (out.includes(".")) out = out.split(".").filter(Boolean).pop() || out;
  return out;
}
function databaseBoolean(value: unknown) {
  // public.can casts JSON scalar text to PostgreSQL boolean.
  return (
    value === true ||
    value === 1 ||
    (typeof value === "string" &&
      /^(true|tru|tr|t|yes|ye|y|on|1)$/i.test(value.trim()))
  );
}
export function effectivePermissions(perms: unknown): EffectivePermission[] {
  if (!perms || typeof perms !== "object" || Array.isArray(perms)) return [];
  const result: EffectivePermission[] = [];
  for (const [modulo, actions] of Object.entries(perms)) {
    // Preserve legacy module-level true supported by the existing server guard.
    if (actions === true) {
      result.push({ modulo, accion: "*" });
      continue;
    }
    if (!actions || typeof actions !== "object" || Array.isArray(actions))
      continue;
    for (const [accion, enabled] of Object.entries(actions)) {
      if (databaseBoolean(enabled)) result.push({ modulo, accion });
    }
  }
  return result;
}
export function permissionGranted(
  perms: readonly EffectivePermission[],
  module: string,
  action = "ver",
) {
  const modulo = normalizePermissionModule(module);
  const accion = normalizePermissionAction(action);
  return perms.some(
    (p) =>
      (p.modulo === "*" || p.modulo === modulo) &&
      (p.accion === "*" || p.accion === accion),
  );
}
