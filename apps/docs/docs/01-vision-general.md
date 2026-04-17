# Visión general

## Propósito confirmado en código

La aplicación web implementa un workspace autenticado orientado a operar módulos configurables. El concepto central es que la tabla `modulos` describe entidades y comportamiento UI, y desde esa definición se renderizan navegación lateral, listados, formularios `create/view/edit` y vistas especiales como treeview, calendario y preview PDF.

Esto se observa en:

- [apps/web/app/(main)/layout.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/app/(main)/layout.tsx)
- [apps/web/lib/modules.server.ts](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/lib/modules.server.ts)
- [packages/ui/src/Form.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/packages/ui/src/Form.tsx)

## Módulos principales detectados

- `Home`: dashboard autenticado en `/`.
- `Login`: acceso por email/password con Supabase.
- `Módulos dinámicos`: rutas `/m/[slug]`, `/m/[slug]/new`, `/m/[slug]/[id]`.
- `System > Módulos`: editor del árbol de módulos y de sus schemas.
- `System > Roles`: listado de roles, alta y edición de permisos por módulo.
- `System > Users`: listado, alta y edición de usuarios.
- `System > PDF Templates`: listado, alta, edición y preview de plantillas PDF.

## Qué puede hacer el usuario

- Iniciar sesión y cerrar sesión.
- Navegar módulos visibles en sidebar si tiene permiso `ver`.
- Listar registros de módulos dinámicos.
- Crear, ver, editar y eliminar registros según permisos.
- Usar selectores relacionales, uploads, multiselect, rich text y campos computados.
- Ver treeviews, calendarios y previews PDF cuando el schema lo configure.
- Administrar módulos, roles, usuarios y plantillas PDF en el área `system`.

## Estado general del desarrollo

### Hecho

- Estructura principal de autenticación y shell.
- CRUD base sobre módulos dinámicos.
- Gestión funcional de módulos, roles, usuarios y plantillas PDF.
- Motor de render dinámico suficientemente amplio.
- Integración con Supabase y almacenamiento.
- Generación de PDF con preview/contexto.

### Parcial

- Workflows: existe infraestructura y al menos `derive.createFromParent`, pero hay dos entradas distintas en `lib/workflows`.
- Calendarios: existe componente genérico en `@repo/ui` y también un calendario local legacy.
- Export/import en listados: los botones existen, pero el flujo actual redirige a `new`.
- Compute/aggregate: está soportado, pero depende de endpoints genéricos con validación limitada.

### Pendiente o incompleto

- Consolidación entre capas legacy y nuevas.
- Validaciones fuertes y seguridad más estricta en varios endpoints genéricos.
- Normalización de rutas y redirects en algunos módulos `system`.

## Inferencias

- Confirmado en código: el sistema está pensado para crecer añadiendo módulos desde base de datos.
- Inferencia razonable: el proyecto se comporta como plataforma configurable de gestión, pero el código no fija un dominio único cerrado.
