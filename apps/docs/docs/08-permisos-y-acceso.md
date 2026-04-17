# Permisos y acceso

## Autenticación

### Protección de rutas

- [apps/web/proxy.ts](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/proxy.ts)

El proxy:

- permite rutas públicas como `/login` y `/403`
- consulta sesión con Supabase SSR
- redirige a `/login` si no hay sesión

### Logout

- `app/auth/signout/route.ts`

## Resolución de permisos

### Provider principal

- [apps/web/lib/perms.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/lib/perms.tsx)

Responsabilidades:

- cargar permisos desde `/api/perms`
- normalizar alias de acciones
- exponer `hasPermiso`
- proveer `RequirePerms`

### Endpoint de permisos

- [apps/web/app/api/perms/route.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/app/api/perms/route.tsx)

Flujo:

1. obtiene usuario autenticado
2. busca `role_id` en `users`
3. consulta `rol.perms`
4. aplana el mapa de permisos a pares `{ modulo, accion }`

## Acciones contempladas

- `ver`
- `crear`
- `actualizar`
- `eliminar`
- `importar`
- `exportar`
- wildcard `*`

## Cómo se decide el acceso

### A nivel de pantalla

`RequirePerms`:

- si está cargando, no renderiza
- si no hay permiso, redirige a `/403`

### A nivel de UX en botones

Listados y formularios también verifican permisos antes de navegar o ejecutar acciones y muestran modales informativos.

### En sidebar

`SidebarWithPerms` filtra módulos mediante `hasPermiso(slug, "ver")`.

## Redirecciones y pantallas de error

- sin sesión: `/login`
- sin permiso: `/403`

## Huecos o riesgos detectados

- `RequirePerms` vive en cliente y protege render/navegación UX, no sustituye seguridad de backend.
- Algunos route handlers genéricos no comprueban permiso funcional explícito; dependen de autenticación y de las políticas de Supabase.
- Hay componentes que envuelven en `RequirePerms` con acción fija `actualizar` incluso para modo `view`, lo que puede endurecer acceso más de lo esperado.

## Confirmado vs inferido

- Confirmado: la fuente de verdad de permisos funcionales es `rol.perms`.
- Confirmado: el usuario enlaza con un rol por `users.role_id`.
- Inferencia: el proyecto espera que RLS o permisos de Supabase completen la seguridad de datos.
