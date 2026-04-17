# Módulos funcionales

## Dashboard / Inicio

### Objetivo

Servir de portada autenticada con métricas básicas, accesos destacados y accesos de `system`.

### Pantalla

- `app/(main)/page.tsx`

### Operaciones

- leer sesión
- contar registros de módulos
- abrir módulos destacados
- acceder a `system/modulos`

### Estado

- Operativo

## Módulos dinámicos de negocio

### Objetivo

Permitir CRUD genérico sobre entidades definidas en `modulos`.

### Pantallas

- `/m/[slug]`
- `/m/[slug]/new`
- `/m/[slug]/[id]`

### Entidades relacionadas

- `modulos`
- tabla real del módulo
- tablas relacionadas vía `selectorTabla` o `ReverseLink`

### Operaciones soportadas

- listar
- ver
- crear
- editar
- eliminar
- vistas especiales declarativas

### Dependencias

- `modules.server.ts`
- `FormClient.tsx`
- `ListPageClient.tsx`
- `@repo/ui`

### Estado

- Operativo como base principal del sistema

## Administración de módulos

### Objetivo

Gestionar la definición de módulos, su árbol y su schema.

### Pantallas

- `/system/modulos`
- `/system/modulos/[id]`

### Operaciones

- ver árbol
- crear módulo
- editar módulo
- seed de módulos

### Dependencias

- `actions/modulos.ts`
- `actions/seed-modulos.ts`
- `@repo/ui/ModuloForm`

### Estado

- Operativo

## Roles

### Objetivo

Gestionar roles y permisos por módulo/acción.

### Pantallas

- `/system/rol`
- `/system/rol/new`
- `/system/rol/[id]`

### Operaciones

- listar roles
- crear rol
- editar mapa `perms`

### Dependencias

- `/api/roles`
- `/api/roles/[id]`
- tabla `rol`

### Estado

- Operativo

## Usuarios

### Objetivo

Gestionar usuarios internos y su rol asociado.

### Pantallas

- `/system/users`
- `/system/users/new`
- `/system/users/[id]`

### Operaciones

- listar usuarios
- crear usuario en Auth y `public.users`
- editar usuario
- eliminar usuario desde listado

### Dependencias

- tabla `users`
- `/api/users/create`
- tabla `rol`

### Estado

- Operativo con algunas incoherencias de ruta observadas

## Plantillas PDF

### Objetivo

Diseñar plantillas declarativas y generar/preview PDFs sobre registros.

### Pantallas

- `/system/pdf-templates`
- `/system/pdf-templates/new`
- `/system/pdf-templates/[id]`

### Operaciones

- listar
- crear
- editar
- preview de contexto
- preview renderizado
- generación PDF

### Dependencias

- tabla `pdf_templates`
- `lib/pdf/*`
- `PdfTemplateForm`

### Estado

- Operativo y una de las áreas más avanzadas funcionalmente
