# Arquitectura web

## Stack detectado

- Next.js `^16.1.1` App Router.
- React `^19.2.3`.
- Supabase SSR/browser/admin.
- Bootstrap + Bootstrap Icons.
- Monorepo con paquetes compartidos `@repo/ui` y `@repo/types`.
- Puppeteer Core + `@sparticuz/chromium` para PDF.

## Patrón arquitectónico dominante

El frontend sigue un patrón híbrido:

- páginas server para resolver sesión, cargar schemas y datos iniciales
- componentes client para interacción, permisos UX y submit
- metadatos persistidos en DB para definir módulos, fields y UI

El flujo general es:

1. El server obtiene sesión y datos de `modulos` o de la tabla objetivo.
2. El schema del módulo se interpreta como `ModuleSchema`.
3. `@repo/ui` renderiza formularios o listados con ese schema.
4. Operaciones de datos se ejecutan contra Supabase directamente desde cliente o mediante route handlers.

## Organización por capas

### Routing y shell

- `apps/web/app/layout.tsx`
- `apps/web/app/(auth)/*`
- `apps/web/app/(main)/*`
- `apps/web/proxy.ts`

### Adaptadores de datos y permisos

- `apps/web/lib/supabase/*`
- `apps/web/lib/perms.tsx`
- `apps/web/lib/modules.server.ts`
- `apps/web/lib/utils/treeViewProvider.ts`
- `packages/ui/src/providers/DataProvider.ts`

### Render dinámico

- `apps/web/lib/FormClient.tsx`
- `apps/web/lib/ListPageClient.tsx`
- `packages/ui/src/Form.tsx`
- `packages/ui/src/FieldInput.tsx`
- `packages/ui/src/ListView.tsx`
- `packages/ui/src/TreeView.tsx`
- `packages/ui/src/ModuleCalendarView.tsx`

### Casos específicos `system`

- `system/modulos`
- `system/rol`
- `system/users`
- `system/pdf-templates`

### Servicios auxiliares

- APIs `app/api/*`
- PDFs en `apps/web/lib/pdf/*`
- workflows en `apps/web/lib/workflows/*`

## Dependencias con paquetes compartidos

### `@repo/types`

Define contratos de datos usados por `web`: `ModuleSchema`, `Field`, `Compute`, `FormSection`, `UiTab`, `SpecialViewConfig`, `PermisosPorModulo`.

Archivo de referencia principal:

- [packages/types/fields.ts](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/packages/types/fields.ts)

### `@repo/ui`

Contiene la implementación reutilizable del render dinámico:

- `Form`
- `FieldInput`
- `ListView`
- `Sidebar`
- `TreeView`
- `ModuleCalendarView`
- `ModuloForm`
- `RichTextEditor`
- `ModalConfirm`

## Flujo entre páginas, componentes, tipos y servicios

- `app/(main)/m/[slug]/page.tsx` resuelve módulo con `fetchModuleRowBySlug`.
- `modules.server.ts` extrae schema desde `modulos.props`.
- `ListPageClient` usa `ListView`.
- `ListView` interpreta flags `appareance`, `list`, `filter`.
- `FormClient` resuelve modo, tabla y ruta.
- `packages/ui/src/Form.tsx` renderiza fields, secciones, tabs, reverse links y acciones.
- `computeEngine.ts` recalcula fórmulas y agregados.
- `DataProvider.ts` llama a `/api/list`, `/api/aggregate` y `/api/create`.

## Decisiones visibles en el código

- El schema vive en DB, no en archivos estáticos.
- El sidebar también depende de `modulos`.
- Los permisos UX se consultan en cliente y luego se refuerzan con acceso real a DB/RLS.
- El sistema mezcla operaciones client-side directas a Supabase con route handlers.
- Los módulos `system` no reutilizan completamente la capa genérica; mantienen clientes propios.

## Limitaciones técnicas actuales

- Varios caminos duplicados para hacer lo mismo.
- Muchas convenciones implícitas entre `slug`, `table`, `route` y `props`.
- Dependencia alta de la calidad de `props` en `modulos`.
- Algunos endpoints genéricos son demasiado permisivos.
