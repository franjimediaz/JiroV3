# Inventario de tipos y esquemas

## Tipos clave consumidos por `web`

### Desde `@repo/types`

| Tipo | Archivo | Uso |
| --- | --- | --- |
| `ModuleSchema` | `packages/types/fields.ts` | Schema de módulo |
| `Field` | `packages/types/fields.ts` | Definición de campo |
| `FieldType` | `packages/types/fields.ts` | Tipos de input |
| `Compute` | `packages/types/fields.ts` | Fórmulas y agregados |
| `FormSection` | `packages/types/fields.ts` | Secciones de formulario |
| `UiTab` | `packages/types/fields.ts` | Tabs declarativos |
| `SpecialViewConfig` | `packages/types/fields.ts` | Vistas especiales |
| `PermisosPorModulo` | `packages/types/perms.ts` | Mapa de permisos |
| `ModuloRow`, `ModuloNode` | `packages/types/fields.ts` | Árbol de módulos |
| `SeedNode` | `packages/types/fields.ts` | Seed declarativo |

## Campos de `ModuleSchema` relevantes para `web`

### `db`

- `table`
- `primaryKey`
- `softDelete`

### `fields[]`

- tipos soportados detallados en `06-formularios-dinamicos.md`
- soporte de `ref` para `selectorTabla` y `ReverseLink`
- soporte de `compute`

### `ui`

- `icon`
- `color`
- `sidebar`
- `formSections`
- `previewTabs`
- `specialViews`
- `tabs`
- `formActions`

## Schemas locales detectados

| Archivo | Función |
| --- | --- |
| `apps/web/lib/schemas/modulos.ts` | Tipado local simplificado de módulo |
| `apps/web/lib/schemas/seed.modulos.json` | Seed JSON de módulos |

## Configuraciones declarativas visibles

- `formSections`
- `tabs.form`
- `tabs.treeview`
- `tabs.calendar`
- `specialViews.pdfPreview`
- `specialViews.calendar`
- `formActions`
- `compute.formula`
- `compute.aggregate`
- `selectorTabla.ref.filters`
- `selectorTabla.ref.sort`

## Observación

El contrato real más importante para `web` no está en un archivo de schema local, sino en la tabla `modulos.props` tipada con `ModuleSchema`.
