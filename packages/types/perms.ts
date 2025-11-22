export type AccionModulo =
  | "ver"
  | "crear"
  | "actualizar"
  | "eliminar"
  | "importar"
  | "exportar";

export type MapaAcciones = Partial<Record<AccionModulo, boolean>>;

// permisos[moduloSlug] = { ver: true, crear: false, ... }
export type PermisosPorModulo = Record<string, MapaAcciones>;

export interface RolePermisosSchema {
  permisos: PermisosPorModulo;
}
