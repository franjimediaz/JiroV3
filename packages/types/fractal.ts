import type { ModuleSchema } from "./fields";

export type FractalConfig = {
  enabled?: boolean;
  parentField?: string;
  titleField?: string;
  visibleFields?: string[];
};

export function getFractalConfig(schema: ModuleSchema): FractalConfig {
  const raw = schema.ui?.fractal;
  return {
    enabled: raw?.enabled === true,
    parentField: typeof raw?.parentField === "string" ? raw.parentField : "",
    titleField: typeof raw?.titleField === "string" ? raw.titleField : "",
    visibleFields: Array.isArray(raw?.visibleFields)
      ? [...new Set(raw.visibleFields.filter((name): name is string => typeof name === "string"))] : [],
  };
}

export function validateFractalConfig(schema: ModuleSchema): string | null {
  const config = getFractalConfig(schema);
  if (!config.enabled) return null;
  const names = new Set(schema.fields.map(field => field.name));
  names.add(schema.db.primaryKey || "id");
  if (!config.parentField || !names.has(config.parentField) || config.parentField === (schema.db.primaryKey || "id"))
    return "Fractal: selecciona un campo padre que contenga la clave de otro registro de este módulo.";
  if (!config.titleField || !names.has(config.titleField)) return "Fractal: selecciona el campo principal del nodo.";
  if (config.visibleFields?.some(name => !names.has(name))) return "Fractal: hay campos visibles que ya no existen.";
  return null;
}
