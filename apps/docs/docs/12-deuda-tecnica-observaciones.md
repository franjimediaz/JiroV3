# Deuda técnica y observaciones

## Hecho

- Existe una base sólida de metamodelo para módulos dinámicos.
- La UI compartida soporta escenarios complejos: relaciones, compute, treeview, calendario, reverse links y PDF preview.
- El área `system` cubre administración real de módulos, roles, usuarios y PDFs.

## Parcial

- `workflows`: hay dos definiciones de `runWorkflow`; la expuesta por la ruta no coincide con todo lo disponible en `lib/workflows/index.ts`.
- `export/import`: la interfaz existe pero la implementación observable no está finalizada.
- `calendar`: hay componente nuevo genérico y componente legacy local.
- `FormClientLegacy.tsx` sigue presente junto al flujo vigente.

## Pendiente

- Normalizar por completo `slug`, `db.table`, `route` y rutas reales de navegación.
- Unificar formularios específicos de `system` con la capa genérica donde sea posible.
- Endurecer seguridad y validación en endpoints genéricos.

## Riesgos

### Seguridad

- `/api/create` acepta tabla arbitraria sin whitelist activa.
- `/api/upload` y `/api/upload-url` usan `supabaseAdmin`.
- Parte de la protección funcional depende de UX y de políticas externas de Supabase.

### Incoherencias de datos

- `api/list` intenta usar `props?.db?.slug` como nombre de tabla; el contrato principal documentado en tipos es `db.table`.
- En `FormClient` se resuelve `table`, pero las operaciones de update/insert usan `resolved.slug`, no siempre `resolved.table`.

### Rutas

- `system/users/new/NewFormClient.tsx` redirige a `/users`, mientras el módulo vive en `/system/users`.
- `system/rol/new/NewFormClient.tsx` construye `router.push('system/${table}/${newId}')` sin slash inicial.
- Algunos helpers y comentarios siguen mencionando rutas antiguas.

### Duplicidad

- `lib/modules.server.ts` y `lib/modulos/modulos.ts` resuelven módulos con enfoques cercanos pero no idénticos.
- Existe shell antiguo en `app/ui/*`.
- Hay lógica parecida repetida entre listados de `rol`, `users`, `pdf_templates` y el listado genérico.

### Componentes grandes

- `PdfTemplateForm.tsx` concentra mucha lógica de edición, preview, relaciones, bindings y configuración.
- `packages/ui/src/Form.tsx` concentra render, compute, tabs, reverse links y special views.

## Mejoras recomendables

- Consolidar rutas y helpers de navegación.
- Centralizar más el CRUD para módulos `system`.
- Revisar endpoints genéricos y validación.
- Reducir duplicidad entre código legacy y vigente.
