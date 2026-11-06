import type { ModuleSchema } from "./fields";

/** Structural read contracts, independent of the module configuration stored in props. */
export const SYSTEM_MODULE_SCHEMAS = {
  modulos: {
    db: { table: "modulos", primaryKey: "id" },
    fields: [
      { name: "id", label: "ID", type: "text" },
      { name: "parent_id", label: "Padre", type: "text" },
      { name: "nombre", label: "Nombre", type: "text", recordName: true },
      { name: "slug", label: "Slug", type: "text" },
      { name: "route", label: "Ruta", type: "text" },
      { name: "tipo", label: "Tipo", type: "text" },
      { name: "orden", label: "Orden", type: "number" },
      { name: "activo", label: "Activo", type: "boolean" },
      { name: "props", label: "Props", type: "text" },
    ],
  },
  pdf_templates: {
    db: { table: "pdf_templates", primaryKey: "id" },
    fields: [
      { name: "id", label: "ID", type: "text" },
      { name: "name", label: "Nombre", type: "text", recordName: true },
      { name: "slug", label: "Slug", type: "text" },
      { name: "source_table", label: "Tabla origen", type: "text" },
      { name: "template", label: "Plantilla", type: "text" },
      { name: "related", label: "Relaciones", type: "text" },
      { name: "is_active", label: "Activa", type: "boolean" },
    ],
  },
} satisfies Record<string, ModuleSchema>;

export function getSystemModuleSchema(slug: string): ModuleSchema | undefined {
  return Object.prototype.hasOwnProperty.call(SYSTEM_MODULE_SCHEMAS, slug)
    ? SYSTEM_MODULE_SCHEMAS[slug as keyof typeof SYSTEM_MODULE_SCHEMAS]
    : undefined;
}

export const MODULOS_SYSTEM_FIELD_NAMES = SYSTEM_MODULE_SCHEMAS.modulos.fields.map(field => field.name);
