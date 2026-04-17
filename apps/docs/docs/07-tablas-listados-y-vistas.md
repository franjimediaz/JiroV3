# Tablas, listados y vistas

## Patrón de listado principal

La vista de lista estándar se implementa con:

- [apps/web/lib/ListPageClient.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/lib/ListPageClient.tsx)
- [packages/ui/src/ListView.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/packages/ui/src/ListView.tsx)

## Cómo se seleccionan columnas

Orden de prioridad en `ListView`:

1. fields con `appareance = "List"` o `"Always"`
2. si no hay, fields con `list = true`
3. si tampoco hay, fields visibles

## Acciones típicas

- Ver
- Editar
- Eliminar
- Crear
- Exportar
- Importar

Observación:

- En el cliente genérico, `handleExport` y `handleImport` validan permisos pero redirigen a `new`, por lo que su implementación real está parcial.

## Filtros

Los filtros se muestran cuando `field.filter = true`.

Soporte visible:

- texto libre para fields normales
- selector específico para `selectorTabla`

El filtrado de `ListView` es cliente sobre `data` ya cargada, no consulta incremental al backend.

## Paginación

`ListView` pagina en cliente con tamaños:

- 10
- 20
- 50
- 80

## Render de relaciones

Para `selectorTabla`, la lista resuelve labels mediante:

- cache local
- `preloadRelationDisplayCache`
- `dataProvider.list` o `getOne`

## TreeView

`packages/ui/src/TreeView.tsx` implementa una vista agrupada por campo:

- `sourceTable`
- `groupBy`
- `columns`
- `totals`
- `filters`
- `orderBy`

Puede resolver lookups de relaciones, mostrar acciones y totalizar importes.

## Calendario

### Vista vigente

- `packages/ui/src/ModuleCalendarView.tsx`
- usable desde tabs o special views del schema
- filtra por registro padre cuando procede

### Vista legacy local

- `apps/web/lib/Calendar.tsx`
- calendario semanal/mensual para tareas
- consume `/api/task`

No se observa que esta versión local sea la integrada en el `Form` genérico actual.

## Vistas especiales

Desde `Form` se soportan:

- `treeview`
- `calendar`
- `pdfPreview`

## Relaciones y listados derivados

- `ReverseLinkTable` permite ver registros hijos desde la ficha del padre.
- `TreeView` y `Calendar` permiten vistas operativas sobre datos relacionados.

## Estado actual

### Operativo

- Listado estándar con acciones y filtros básicos.
- TreeView declarativo.
- Calendario declarativo en el `Form`.

### Parcial

- Export/import.
- Coexistencia de calendario legacy y calendario nuevo.
