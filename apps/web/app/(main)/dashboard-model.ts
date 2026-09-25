import iconCatalog from "bootstrap-icons/font/bootstrap-icons.json";
import type { ModuleRow } from "@/lib/modules/resolveModuleConfig";
import type { ModuleDestination } from "@/lib/modules/moduleRoutes";

export type DashboardModule = {
  id: string;
  name: string;
  href: string;
  icon: string;
  color: string;
  order: number;
};
export type DashboardModuleGroup = {
  id: string;
  name: string;
  order: number;
  modules: DashboardModule[];
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function propsRecord(value: unknown) {
  try {
    return record(typeof value === "string" ? JSON.parse(value) : value);
  } catch {
    return {};
  }
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function order(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.MAX_SAFE_INTEGER;
}
const isFolder = (row: ModuleRow) =>
  ["carpeta", "folder", "menu", "grupo"].includes(text(row.tipo).toLowerCase());
const byOrder = (
  a: { order: number; name: string; id: string },
  b: { order: number; name: string; id: string },
) =>
  a.order - b.order ||
  a.name.localeCompare(b.name, "es") ||
  a.id.localeCompare(b.id);

export function dashboardIcon(value: unknown): string {
  const name = text(value)
    .split(/\s+/)
    .find((part) => part.startsWith("bi-"))
    ?.slice(3);
  return name && Object.hasOwn(iconCatalog, name)
    ? `bi bi-${name}`
    : "bi bi-grid-1x2";
}

export function buildDashboardModuleGroups(
  rows: ModuleRow[],
  canView: (slug: string, action?: string) => boolean,
  destinations: ReadonlyMap<string, ModuleDestination>,
): DashboardModuleGroup[] {
  const active = rows.filter((row) => row.activo === true);
  const byId = new Map(active.map((row) => [row.id, row]));
  const groups = new Map<string, DashboardModuleGroup>();
  const seen = new Set<string>();
  for (const row of active) {
    const ui = record(propsRecord(row.props).ui);
    const destination = destinations.get(row.id);
    if (
      isFolder(row) ||
      ui.dashboard !== true ||
      !destination ||
      seen.has(row.id) ||
      !text(row.slug) ||
      !canView(row.slug) ||
      !canView(destination.permissionsKey, destination.action ?? "ver")
    )
      continue;
    seen.add(row.id);
    const visited = new Set([row.id]);
    let parentId = row.parent_id;
    let rootFolder: ModuleRow | undefined;
    let cyclic = false;
    while (parentId) {
      if (visited.has(parentId)) {
        cyclic = true;
        break;
      }
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      if (isFolder(parent)) rootFolder = parent;
      parentId = parent.parent_id;
    }
    // A cycle has no unambiguous root family. Do not invent one.
    if (cyclic) continue;
    const family = rootFolder ?? row;
    let group = groups.get(family.id);
    if (!group) {
      const name = text(family.nombre) || text(family.slug);
      group = {
        id: family.id,
        name: rootFolder ? name.replace(/^módulo\s+/i, "") || name : name,
        order: order(family.orden),
        modules: [],
      };
      groups.set(family.id, group);
    }
    group.modules.push({
      id: row.id,
      name: text(row.nombre) || row.slug,
      href: destination.href,
      icon: dashboardIcon(ui.icon),
      color: /^#[\da-f]{6}$/i.test(text(ui.color)) ? text(ui.color) : "#2563eb",
      order: order(row.orden),
    });
  }
  return [...groups.values()]
    .sort(byOrder)
    .map((group) => ({ ...group, modules: group.modules.sort(byOrder) }));
}
