import iconCatalog from "bootstrap-icons/font/bootstrap-icons.json";

export type ModuleRow = {
  id: string;
  slug: string;
  nombre: string | null;
  route: string | null;
  activo: boolean | null;
  orden: number | null;
  parent_id: string | null;
  tipo: string | null;
  props: unknown;
};

export type DashboardModule = {
  id: string;
  name: string;
  href: string | null;
  icon: string;
  color: string;
  table: string | null;
  featured: boolean;
  order: number;
  system: boolean;
  count: number | null;
  canCount: boolean;
};

const systemRoutes: Record<string, string> = {
  modulos: "/system/modulos",
  rol: "/system/rol",
  users: "/system/users",
  "pdf-templates": "/system/pdf-templates",
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

export function dashboardIcon(value: unknown): string {
  const name = text(value)
    .split(/\s+/)
    .find((part) => part.startsWith("bi-"))
    ?.slice(3);
  return name && Object.hasOwn(iconCatalog, name)
    ? `bi bi-${name}`
    : "bi bi-grid-1x2";
}

export function buildDashboardModules(rows: ModuleRow[]): DashboardModule[] {
  const systemIds = new Set(
    rows.filter((row) => row.slug === "system").map((row) => row.id),
  );
  // Iteration handles deep trees and cyclic configuration without recursion.
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (
        row.parent_id &&
        systemIds.has(row.parent_id) &&
        !systemIds.has(row.id)
      ) {
        systemIds.add(row.id);
        changed = true;
      }
    }
  }
  const seen = new Set<string>();
  return rows.flatMap((row): DashboardModule[] => {
    const slug = text(row.slug);
    const props = propsRecord(row.props);
    const tipo = text(row.tipo || props.tipo).toLowerCase();
    if (
      !row.activo ||
      !slug ||
      slug === "system" ||
      seen.has(slug) ||
      ["carpeta", "folder", "menu", "grupo"].includes(tipo)
    )
      return [];
    seen.add(slug);
    const ui = record(props.ui);
    const home = record(ui.home);
    const dashboard = record(ui.dashboard);
    const db = record(props.db);
    const table = text(db.table) || text(props.table) || null;
    const system = systemIds.has(row.id) || Object.hasOwn(systemRoutes, slug);
    const configuredRoute =
      text(props.route) || text(ui.route) || text(row.route);
    const knownSystemRoute = Object.values(systemRoutes).find(
      (route) => route === configuredRoute.replace(/\/$/, ""),
    );
    const validSlug = !/[/?#\\]/.test(slug) && slug !== "." && slug !== "..";
    const href = system
      ? Object.hasOwn(systemRoutes, slug)
        ? systemRoutes[slug]!
        : knownSystemRoute || null
      : table && validSlug
        ? `/m/${encodeURIComponent(slug)}`
        : null;
    const rawOrder =
      home.order ?? dashboard.order ?? ui.featuredOrder ?? row.orden;
    const order =
      typeof rawOrder === "number" || typeof rawOrder === "string"
        ? Number(rawOrder)
        : NaN;
    return [
      {
        id: row.id,
        name: text(row.nombre) || slug,
        href,
        table,
        system,
        icon: dashboardIcon(ui.icon),
        color: /^#[\da-f]{6}$/i.test(text(ui.color))
          ? text(ui.color)
          : "#2563eb",
        featured:
          home.featured === true ||
          dashboard.featured === true ||
          ui.featuredOnHome === true,
        order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER,
        count: null,
        canCount: db.readMode !== "server" && props.readMode !== "server",
      },
    ];
  });
}

export function featuredModules(modules: DashboardModule[]) {
  const business = modules.filter((item) => !item.system && item.href);
  const configured = business.filter((item) => item.featured);
  return [...(configured.length ? configured : business)]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "es"))
    .slice(0, 4);
}
