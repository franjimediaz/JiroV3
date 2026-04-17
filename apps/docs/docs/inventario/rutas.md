# Inventario de rutas

## Páginas

- `/login`
- `/`
- `/403`
- `/m/[slug]`
- `/m/[slug]/new`
- `/m/[slug]/[id]`
- `/system/modulos`
- `/system/modulos/[id]`
- `/system/rol`
- `/system/rol/new`
- `/system/rol/[id]`
- `/system/users`
- `/system/users/new`
- `/system/users/[id]`
- `/system/pdf-templates`
- `/system/pdf-templates/new`
- `/system/pdf-templates/[id]`

## Route handlers

- `/auth/signout`
- `/api/admin/users/role`
- `/api/aggregate`
- `/api/create`
- `/api/dp/labels`
- `/api/dp/list`
- `/api/list`
- `/api/modulos`
- `/api/modulos/TreeView`
- `/api/pdf/context`
- `/api/pdf/generate`
- `/api/pdf/preview`
- `/api/pdf/template-preview`
- `/api/perms`
- `/api/roles`
- `/api/roles/[id]`
- `/api/task`
- `/api/upload`
- `/api/upload-url`
- `/api/users/create`
- `/api/workflows/run`

## Observaciones de routing

- La navegación funcional principal usa `/m/[slug]`.
- El área `system` usa rutas dedicadas.
- Algunas redirecciones internas todavía apuntan a rutas no normalizadas.
