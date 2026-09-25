import {
  resolveModuleConfigFromRow,
  type ModuleRow,
  type ResolvedModuleConfig,
} from "./resolveModuleConfig";
import pageRoutes from "./pageRoutes.generated.json";

// These are existing App Router entry points, not a dashboard module catalogue.
// Dynamic /m/:slug destinations are resolved from the module inventory below.
const staticModulePages = new Set(pageRoutes);
// Existing destination guards use these keys. This is authorization metadata,
// not an existence allowlist: new pages use their configured module slug.
const systemPermissionKeys = new Map([
  ["/system/modulos", "modulos"],
  ["/system/rol", "rol"],
  ["/system/users", "users"],
  ["/system/pdf-templates", "pdf_templates"],
]);

export type ModuleDestination = {
  href: string;
  permissionsKey: string;
  action?: string;
};

export function normalizeModuleRoute(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (
    !raw ||
    /[?#\\\s]/.test(raw) ||
    raw.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(raw)
  )
    return null;
  const path = `/${raw.replace(/^\//, "")}`.replace(/\/$/, "");
  if (path === "/" || path.includes("//")) return null;
  try {
    const segments = path.slice(1).split("/").map(decodeURIComponent);
    if (
      segments.some(
        (part) =>
          !part || part === "." || part === ".." || /[/?#\\\s%]/.test(part),
      )
    )
      return null;
    return `/${segments.map(encodeURIComponent).join("/")}`;
  } catch {
    return null;
  }
}

export function resolveModuleDestinations(
  rows: ModuleRow[],
  pages: ReadonlySet<string> = staticModulePages,
): Map<string, ModuleDestination> {
  const bySlug = new Map<string, ResolvedModuleConfig | null>();
  const byTable = new Map<string, ResolvedModuleConfig[]>();
  for (const row of rows) {
    if (row.activo !== true) continue;
    try {
      const resolved = resolveModuleConfigFromRow(row);
      const previous = bySlug.get(resolved.slug);
      bySlug.set(
        resolved.slug,
        bySlug.has(resolved.slug) && previous?.id !== resolved.id
          ? null
          : resolved,
      );
      if (resolved.table)
        byTable.set(resolved.table, [
          ...(byTable.get(resolved.table) ?? []),
          resolved,
        ]);
    } catch {
      // A broken module cannot validate a destination for another card.
    }
  }
  const destinations = new Map<string, ModuleDestination>();
  for (const row of rows) {
    const href = normalizeModuleRoute(row.route);
    if (!href) continue;
    if (pages.has(href)) {
      // Existing system creation forms require crear, unlike their list pages.
      const listRoute = href.endsWith("/new") ? href.slice(0, -4) : href;
      const systemKey = systemPermissionKeys.get(listRoute);
      destinations.set(row.id, {
        href,
        permissionsKey: systemKey ?? row.slug,
        ...(systemKey && href.endsWith("/new") ? { action: "crear" } : {}),
      });
      continue;
    }
    const match = /^\/m\/([^/]+)$/.exec(href);
    if (!match) continue;
    const key = decodeURIComponent(match[1]!);
    const aliases = byTable.get(key);
    const target = bySlug.has(key)
      ? bySlug.get(key)
      : aliases?.length === 1
        ? aliases[0]
        : undefined;
    if (target?.isDataModule)
      // ListPageClient authorizes the URL slug, including legacy table aliases.
      destinations.set(row.id, { href, permissionsKey: key });
  }
  return destinations;
}
