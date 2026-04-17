# Estructura de carpetas

## Árbol comentado de `apps/web`

```text
apps/web/
  actions/                  Server actions para módulos y seed de módulos
  app/                      App Router: layouts, páginas y route handlers
    (auth)/                 Shell de autenticación
      login/                Página de login
    (main)/                 Shell autenticado principal
      m/[slug]/             Módulos dinámicos basados en schema
      system/               Administración específica del sistema
    403/                    Pantalla de acceso denegado
    api/                    Endpoints internos usados por la UI
    auth/signout/           Cierre de sesión
    ui/                     Componentes de shell antiguos/auxiliares
  lib/                      Adaptadores, clientes, lógica de formularios, PDF y workflows
    actions/                Lógica server de plantillas PDF
    hooks/                  Hooks locales
    modulos/                Helpers de carga del módulo `modulos`
    pdf/                    Resolución de contexto y render PDF
    schemas/                Tipos/schema locales y seed JSON
    seed/                   Estructuras de seed de módulos
    supabase/               Clientes server/browser/admin
    utils/                  Utilidades locales
    workflows/              Automatizaciones declarativas
  public/                   Activos públicos
  proxy.ts                  Protección de rutas por sesión
```

## Responsabilidad por carpeta

### `actions/`

- [apps/web/actions/modulos.ts](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/actions/modulos.ts): alta/edición de módulos con validación runtime.
- [apps/web/actions/seed-modulos.ts](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/actions/seed-modulos.ts): carga seed de módulos.

### `app/(auth)`

- layout específico con providers.
- login de usuario con Supabase Browser client.

### `app/(main)`

- layout principal con sidebar, providers y sesión.
- dashboard `/`.
- capa dinámica `/m/[slug]`.
- área `system`.

### `app/api`

Principales grupos:

- `aggregate`, `create`, `list`: data provider genérico.
- `dp/*`: soporte para selectors y labels.
- `modulos`, `roles`, `perms`: configuración y seguridad.
- `pdf/*`: contexto, preview y generación.
- `upload*`: almacenamiento.
- `users/create`: alta de usuarios.
- `workflows/run`: disparo de automatizaciones.

### `lib/`

Es la carpeta de mayor peso técnico:

- `FormClient.tsx` y `ListPageClient.tsx`: puente entre páginas y `@repo/ui`.
- `modules.server.ts`: resuelve módulos desde DB.
- `perms.tsx`: provider, hook y guard.
- `PdfTemplateForm.tsx`: editor completo de plantillas.
- `pdf/*`: motor de documentos.
- `workflows/*`: automatizaciones declarativas.

## Carpetas relevantes fuera de `apps/web`

- `packages/ui/src`: implementación real del render dinámico.
- `packages/types`: contratos de schema, fields, permisos y tipos de DB.

## Observaciones

- Existen `app/ui/SidebarServer.tsx` y `app/ui/ClientLayout.tsx` que no son la ruta principal actual del shell.
- `lib/FormClientLegacy.tsx` convive con `lib/FormClient.tsx`.
- `lib/Calendar.tsx` es un calendario local distinto al calendario genérico de `@repo/ui`.
