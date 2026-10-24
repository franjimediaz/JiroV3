import { serializeModuleSchema } from "@repo/types";

export function exportModuloSeed(modulo: any): any {
  const raw = typeof modulo?.props === "string" ? JSON.parse(modulo.props) : modulo?.props || {};
  const children = modulo?.children ?? modulo?.hijos ?? [];
  return {
    slug: modulo?.slug, nombre: modulo?.nombre, route: modulo?.route,
    orden: modulo?.orden, tipo: modulo?.tipo, activo: modulo?.activo,
    props: modulo?.tipo === "carpeta" ? raw : serializeModuleSchema(raw),
    ...(children.length ? { children: children.map(exportModuloSeed) } : {}),
  };
}

export function seedToClipboardText(seed: any, constName = "moduloSeed") {
  return `import { SeedNode } from "@repo/types";

export const ${constName}: SeedNode[] = [
${JSON.stringify(seed, null, 2)}
] as const;
`;
}
