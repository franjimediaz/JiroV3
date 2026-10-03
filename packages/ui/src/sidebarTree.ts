import type { SidebarItem, SidebarModuleSelection } from "./types";
import { isActive } from "./utils";

export function isSidebarFolder(node: SidebarItem) {
  return node.tipo === "carpeta" || Boolean(node.hijos?.length && !node.route?.trim());
}

const navigable = (node: SidebarItem): boolean =>
  (!isSidebarFolder(node) && Boolean(node.route?.trim()) && node.route !== "#") || Boolean(node.hijos?.some(navigable));

/** Preserve the existing permission gate and ui.sidebar promotion semantics. */
export function filterSidebarTree(items: SidebarItem[], canView?: (slug: string) => boolean): SidebarItem[] {
  return [...items].sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999) || a.nombre.localeCompare(b.nombre)).flatMap((node) => {
    const folder = isSidebarFolder(node);
    if (!folder && canView && !canView(node.slug)) return [];
    const hijos = filterSidebarTree(node.hijos || [], canView);
    if (node.sidebar === true && node.tipo !== "carpeta") return hijos;
    if (folder && !hijos.some(navigable)) return [];
    return [{ ...node, hijos }];
  });
}

export function getSelectableModules(items: SidebarItem[]) {
  const modules: Array<SidebarItem & { moduleLabel: string }> = [];
  const visit = (nodes: SidebarItem[], parents: string[]) => {
    for (const node of nodes) {
      const names = node.tipo === "carpeta" ? [...parents, node.nombre] : parents;
      if (node.tipo === "carpeta" && node.hijos?.some(navigable)) modules.push({ ...node, moduleLabel: names.join(" / ") });
      visit(node.hijos || [], names);
    }
  };
  visit(items, []);
  return modules;
}

/** Longest route wins; a nested folder owns its own descendants. */
export function findModuleForPath(items: SidebarItem[], pathname: string): SidebarItem | undefined {
  let match: SidebarItem | undefined;
  let length = -1;
  const visit = (nodes: SidebarItem[], owner?: SidebarItem) => {
    for (const node of nodes) {
      const owningModule = node.tipo === "carpeta" ? node : owner;
      if (!isSidebarFolder(node) && node.route && node.route !== "#" && isActive(pathname, node.route)) {
        const score = node.route.replace(/\/+$/, "").length;
        if (score > length) { length = score; match = owningModule; }
      }
      visit(node.hijos || [], owningModule);
    }
  };
  visit(items);
  return match;
}

export function selectSidebarModule(items: SidebarItem[], pathname: string, selection?: SidebarModuleSelection | null) {
  const modules = getSelectableModules(items);
  const saved = modules.find((node) => node.id === selection?.id);
  // A deliberate selection can browse another module until the URL changes.
  if (saved && selection?.pathname === pathname) return saved;
  const active = findModuleForPath(items, pathname);
  return modules.find((node) => node.id === active?.id) || saved || modules[0];
}

/** Special top-level links remain available without inventing a selectable module. */
export function getStandaloneItems(items: SidebarItem[]): SidebarItem[] {
  return items.filter((node) => node.tipo !== "carpeta").map((node) => ({ ...node, hijos: getStandaloneItems(node.hijos || []) }));
}

export function getActiveSidebarIds(items: SidebarItem[], pathname: string) {
  const ids = new Set<string>();
  const visit = (node: SidebarItem): boolean => {
    const children = (node.hijos || []).map(visit);
    const active = Boolean(node.route && node.route !== "#" && isActive(pathname, node.route)) || children.some(Boolean);
    if (active) ids.add(node.id);
    return active;
  };
  items.forEach(visit);
  return ids;
}
