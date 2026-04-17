# Rutas y páginas

## Rutas de página

| Ruta | Archivo | Qué renderiza | Observaciones |
| --- | --- | --- | --- |
| `/login` | `app/(auth)/login/page.tsx` | Formulario de login | Pública |
| `/` | `app/(main)/page.tsx` | Dashboard con métricas y accesos | Requiere sesión |
| `/403` | `app/403/page.tsx` | Acceso denegado | Se usa desde `RequirePerms` |
| `/m/[slug]` | `app/(main)/m/[slug]/page.tsx` | Listado dinámico de un módulo | Carga schema desde `modulos` |
| `/m/[slug]/new` | `app/(main)/m/[slug]/new/page.tsx` | Alta dinámica | Usa `FormClient` en modo `create` |
| `/m/[slug]/[id]` | `app/(main)/m/[slug]/[id]/page.tsx` | Ficha dinámica | `view` por defecto, `edit` si `?edit=true` |
| `/system/modulos` | `app/(main)/system/modulos/page.tsx` | Árbol y editor de módulos | Usa `ModulosTree` |
| `/system/modulos/[id]` | `app/(main)/system/modulos/[id]/page.tsx` | Detalle/edición de módulo | Soporta `id === new` |
| `/system/rol` | `app/(main)/system/rol/page.tsx` | Listado de roles | Específico |
| `/system/rol/new` | `app/(main)/system/rol/new/page.tsx` | Alta de rol | Usa formulario genérico |
| `/system/rol/[id]` | `app/(main)/system/rol/[id]/page.tsx` | Edición de permisos del rol | Pantalla específica |
| `/system/users` | `app/(main)/system/users/page.tsx` | Listado de usuarios | Específico |
| `/system/users/new` | `app/(main)/system/users/new/page.tsx` | Alta de usuario | POST a `/api/users/create` |
| `/system/users/[id]` | `app/(main)/system/users/[id]/page.tsx` | Ficha de usuario | Form específico |
| `/system/pdf-templates` | `app/(main)/system/pdf-templates/page.tsx` | Listado de plantillas PDF | Específico |
| `/system/pdf-templates/new` | `app/(main)/system/pdf-templates/new/page.tsx` | Alta de plantilla PDF | Editor dedicado |
| `/system/pdf-templates/[id]` | `app/(main)/system/pdf-templates/[id]/page.tsx` | Ficha/edición de plantilla PDF | Soporta `?edit=true` |

## Layouts

### Root

- [apps/web/app/layout.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/app/layout.tsx)
- Carga CSS global y `PermisosProvider`.

### Auth

- [apps/web/app/(auth)/layout.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/app/(auth)/layout.tsx)
- Envuelve con `Providers`.

### Main

- [apps/web/app/(main)/layout.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/app/(main)/layout.tsx)
- Consulta módulos activos y construye el árbol del sidebar.
- Usa `MainShell`.

## Rutas API internas

| Ruta API | Archivo | Uso principal |
| --- | --- | --- |
| `/api/perms` | `app/api/perms/route.tsx` | Resolver permisos efectivos del usuario |
| `/api/list` | `app/api/list/route.ts` | Listado genérico por módulo |
| `/api/create` | `app/api/create/route.ts` | Alta genérica por tabla |
| `/api/aggregate` | `app/api/aggregate/route.ts` | Agregados para compute |
| `/api/modulos` | `app/api/modulos/route.ts` | Exponer módulos flat o árbol |
| `/api/modulos/TreeView` | `app/api/modulos/TreeView/route.ts` | Catálogo simplificado de módulos |
| `/api/dp/list` | `app/api/dp/list/route.ts` | Búsqueda para selectores |
| `/api/dp/labels` | `app/api/dp/labels/route.ts` | Resolver labels de UUID |
| `/api/roles` | `app/api/roles/route.ts` | Listado de roles |
| `/api/roles/[id]` | `app/api/roles/[id]/route.ts` | Leer/editar permisos del rol |
| `/api/users/create` | `app/api/users/create/route.ts` | Alta de usuario en Auth y `public.users` |
| `/api/upload` | `app/api/upload/route.ts` | Subida y borrado de archivos |
| `/api/upload-url` | `app/api/upload-url/route.ts` | Signed URLs para privados |
| `/api/pdf/context` | `app/api/pdf/context/route.ts` | Resolver contexto para preview |
| `/api/pdf/preview` | `app/api/pdf/preview/route.ts` | Devolver HTML preview |
| `/api/pdf/template-preview` | `app/api/pdf/template-preview/route.ts` | Preview de template en edición |
| `/api/pdf/generate` | `app/api/pdf/generate/route.ts` | Generar PDF final |
| `/api/workflows/run` | `app/api/workflows/run/route.ts` | Ejecutar workflow |

## Parámetros y modos

- `?edit=true` cambia una ficha de `view` a `edit` en rutas dinámicas y algunas de `system`.
- `/system/modulos/[id]` además acepta `id = new`.
- Las rutas dinámicas `/m/[slug]` usan el `slug` como identificador funcional del módulo.

## Relación entre páginas y componentes

- Rutas dinámicas:
  - página server: carga schema/datos
  - cliente: `ListPageClient` o `FormClient`
  - UI compartida: `ListView` o `Form`
- Rutas `system`:
  - combinan SSR para carga inicial
  - clientes específicos por dominio

## Confirmaciones e inferencias

- Confirmado: el patrón recomendado actual para entidades genéricas es `/m/[slug]`.
- Confirmado: `system` mantiene rutas dedicadas.
- Inferencia: algunas rutas antiguas siguen presentes por evolución incremental del proyecto.
