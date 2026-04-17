# Formularios dinámicos

## Cómo se construyen

El formulario se basa en `ModuleSchema`, definido en `@repo/types` y almacenado habitualmente en `modulos.props`.

Piezas clave:

- [packages/types/fields.ts](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/packages/types/fields.ts)
- [packages/ui/src/Form.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/packages/ui/src/Form.tsx)
- [apps/web/lib/FormClient.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/lib/FormClient.tsx)

## Estructura del schema

`ModuleSchema` soporta:

- `db.table`
- `db.primaryKey`
- `db.softDelete`
- `fields[]`
- `ui`

Cada `field` puede definir:

- `name`, `label`, `type`
- `required`, `virtual`, `readOnly`
- `defaultValue`
- `list`, `filter`, `appareance`
- `visible`, `visibleWhen`
- `placeholder`, `help`
- `allowOverride`
- `compute`
- `ref`
- `ui.width`, `ui.variant`, `ui.icon`, `ui.color`

## Tipos de campo soportados

Confirmados en `packages/types/fields.ts` y `FieldInput.tsx`:

- `text`
- `textarea`
- `number`
- `money`
- `percent`
- `date`
- `datetime`
- `boolean`
- `select`
- `multiselect`
- `color`
- `iconpicker`
- `file`
- `image`
- `selectorTabla`
- `ReverseLink`
- `formula`

## Modos del formulario

- `view`
- `edit`
- `create`

El modo lo decide la página contenedora:

- ficha genérica: `?edit=true`
- alta genérica: `create`
- algunas pantallas `system` fuerzan modo según ruta

## Render y layout

### Sin secciones

Se muestran los fields en una grid basada en `field.ui.width`.

### Con secciones

`ui.formSections` o tabs de tipo `form` permiten agrupar fields en cards colapsables.

### Con tabs

`packages/ui/src/Form.tsx` soporta:

- tabs `form`
- tabs `treeview`
- tabs `calendar`
- special views `pdfPreview`

## Compute y campos calculados

### `formula`

Se evalúa en cliente con `safeEval` y depende de `deps`.

### `aggregate`

Llama a `dataProvider.aggregate` y termina en `/api/aggregate`.

Persistencia visible:

- `persist: none`
- `persist: onSave`
- `persist: always`

`FormClient.tsx` excluye del payload los virtuales y los computes con `persist = none`.

## Overrides

Si `allowOverride` está activo, el `Form` mantiene `meta.overrides[fieldName]` y permite forzar un valor calculado.

## SelectorTabla

Se renderiza con `Selector` y soporta:

- `moduleSlug`
- `displayField`
- `valueField`
- `multiple`
- `filters`
- `sort`
- estilo opcional con icono y color

## ReverseLink

Los campos `ReverseLink` no se renderizan como input normal. El `Form` los agrupa en tabs inferiores usando `ReverseLinkTable`.

## Validaciones visibles

- Required y tipos básicos en UI.
- Normalización de fechas, arrays, UUIDs y campos vacíos al guardar.
- Validación runtime de `modulos.props` en `actions/modulos.ts`.

No se observa un framework de validación de esquema tipo Zod en esta capa.

## Secciones y vistas especiales

Confirmado:

- `ui.formSections`
- `ui.tabs`
- `ui.specialViews`
- `ui.previewTabs` legacy mapeado a `pdfPreview`

## Puntos incompletos o frágiles

- Conviven `FormClient.tsx`, `FormClientLegacy.tsx` y forms específicos.
- Algunos formularios `system` redirigen a rutas que no siguen exactamente el patrón real.
- La semántica de `moduleSlug` vs `table` no siempre está unificada.
