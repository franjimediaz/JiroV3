type AnyObj = Record<string, any>;

function deepClean(v: any): any {
  if (Array.isArray(v)) {
    const arr = v.map(deepClean).filter((x) => x !== undefined);
    return arr.length ? arr : undefined;
  }
  if (v && typeof v === "object") {
    const out: AnyObj = {};
    for (const [k, val] of Object.entries(v)) {
      // evita basura típica
      if (["created_at", "updated_at", "deleted_at"].includes(k)) continue;

      const cleaned = deepClean(val);

      // quita undefined, null y strings vacíos
      if (cleaned === undefined || cleaned === null) continue;
      if (typeof cleaned === "string" && cleaned.trim() === "") continue;

      out[k] = cleaned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// ✅ helper: obtiene hijos de forma compatible
function getChildren(modulo: any): any[] {
  return modulo?.children ?? modulo?.hijos ?? [];
}

export function exportModuloSeed(modulo: any): any {
  const props =
    (typeof modulo?.props === "string" ? safeParse(modulo.props) : modulo?.props) ?? {};

  const db = props?.db ?? {};
  const fields = Array.isArray(props?.fields) ? props.fields : [];
  const ui = props?.ui ?? {};
  const formSections = Array.isArray(ui?.formSections) ? ui.formSections : [];

  // ✅ Export recursivo de children
  const children = getChildren(modulo);
  const childrenSeeds = children.length ? children.map(exportModuloSeed) : undefined;

  const seed = {
    slug: modulo?.slug,
    nombre: modulo?.nombre,
    route: modulo?.route, // 👈 OJO: en tu BD es "route". Si usas "ruta" en UI, ajusta.
    orden: modulo?.orden,
    tipo: modulo?.tipo,
    activo: modulo?.activo,

    props: {
      db: {
        table: db?.table,
        softDelete: db?.softDelete ?? false,
      },

      ui: {
        icon: ui?.icon,
        color: ui?.color,
        view: ui?.view,
      },

      fields: fields.map((f: any) => ({
        name: f?.name,
        type: f?.type,
        label: f?.label,
        required: !!f?.required,
        list: !!f?.list,
        filter: !!f?.filter,
        readOnly: !!f?.readOnly,
        visible: f?.visible !== undefined ? !!f?.visible : undefined,
        appareance: f?.appareance,
        allowOverride: f?.allowOverride,
        defaultValue: f?.defaultValue,
        compute: f?.compute,
        selectorTabla: f?.selectorTabla,
        ui: f?.ui,
        help: f?.help,
      })),

      // ⚠️ Tu runtime suele esperar ui.formSections dentro de props.ui, no fuera.
      // Si quieres mantenerlo fuera, ok, pero tu importador actual ya lo reubica.
      // Yo te lo pondría dentro de ui para consistencia:
      formSections: formSections.map((s: any) => ({
        id: s?.id,
        label: s?.label,
        description: s?.description,
        fields: s?.fields,
      })),
    },

    // ✅ solo aparece si hay hijos (deepClean borrará si está vacío)
    children: childrenSeeds,
  };

  return deepClean(seed) ?? {};
}

export function seedToClipboardText(seed: any, constName = "moduloSeed") {
  return `import { SeedNode } from "@repo/types";

export const ${constName}: SeedNode[] = [
${JSON.stringify(seed, null, 2)}
] as const;
`;
}
