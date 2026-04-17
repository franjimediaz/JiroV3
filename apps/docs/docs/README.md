# Documentación de `apps/web`

## Índice

- [01-vision-general.md](./01-vision-general.md)
- [02-arquitectura-web.md](./02-arquitectura-web.md)
- [03-estructura-de-carpetas.md](./03-estructura-de-carpetas.md)
- [04-rutas-y-paginas.md](./04-rutas-y-paginas.md)
- [05-componentes-reutilizables.md](./05-componentes-reutilizables.md)
- [06-formularios-dinamicos.md](./06-formularios-dinamicos.md)
- [07-tablas-listados-y-vistas.md](./07-tablas-listados-y-vistas.md)
- [08-permisos-y-acceso.md](./08-permisos-y-acceso.md)
- [09-integraciones-y-servicios.md](./09-integraciones-y-servicios.md)
- [10-modulos-funcionales.md](./10-modulos-funcionales.md)
- [11-flujos-principales.md](./11-flujos-principales.md)
- [12-deuda-tecnica-observaciones.md](./12-deuda-tecnica-observaciones.md)
- [inventario/componentes.md](./inventario/componentes.md)
- [inventario/hooks.md](./inventario/hooks.md)
- [inventario/utilidades.md](./inventario/utilidades.md)
- [inventario/rutas.md](./inventario/rutas.md)
- [inventario/tipos-y-esquemas.md](./inventario/tipos-y-esquemas.md)

## Mapa de lectura recomendado

1. `01-vision-general.md`
2. `02-arquitectura-web.md`
3. `04-rutas-y-paginas.md`
4. `10-modulos-funcionales.md`
5. `06-formularios-dinamicos.md` y `07-tablas-listados-y-vistas.md`
6. `08-permisos-y-acceso.md` y `09-integraciones-y-servicios.md`
7. `12-deuda-tecnica-observaciones.md`
8. Inventarios

## Resumen ejecutivo

`apps/web` es una aplicación Next.js App Router con Supabase como backend principal y un enfoque dinámico: los módulos se definen en la tabla `modulos`, sus esquemas viven en `props` y desde ahí se construyen rutas genéricas, formularios, listados, sidebar, vistas especiales y parte del comportamiento declarativo.

La app combina dos capas:

- Capa genérica basada en metadatos: [apps/web/app/(main)/m/[slug]/page.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/app/(main)/m/[slug]/page.tsx), [apps/web/lib/FormClient.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/apps/web/lib/FormClient.tsx), [packages/ui/src/Form.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/packages/ui/src/Form.tsx) y [packages/ui/src/ListView.tsx](/abs/path/c:/Users/Fjjim/OneDrive/Escritorio/JiroV3/JiroV3/packages/ui/src/ListView.tsx).
- Capa de administración específica para `system`: módulos, roles, usuarios y plantillas PDF.

## Resumen final

### Módulos detectados

- Inicio/dashboard autenticado.
- Login y signout.
- Módulos dinámicos de negocio bajo `/m/[slug]`.
- Administración de módulos.
- Gestión de roles.
- Gestión de usuarios.
- Gestión de plantillas PDF.
- APIs auxiliares para listados, agregados, permisos, uploads, PDFs y workflows.

### Piezas técnicas clave

- Next.js 16 App Router en `apps/web/app`.
- Supabase SSR/browser/admin en `apps/web/lib/supabase/*`.
- Esquemas tipados con `@repo/types`.
- Componentes dinámicos compartidos en `@repo/ui`.
- Render declarativo de formularios con secciones, tabs, treeview, calendario y acciones.
- Motor de compute para fórmulas y agregados.
- Resolución de permisos en cliente vía `/api/perms`.
- Generación de PDF por HTML + Puppeteer o servicio externo.

### Principales riesgos o deudas técnicas

- Duplicidades y divergencias entre rutas genéricas y módulos `system`.
- Inconsistencias de naming entre `slug`, `table` y `route`.
- Código legado coexistiendo con implementaciones nuevas.
- Varias rutas y handlers sin validación fuerte ni whitelist real.
- Componentes grandes y con mucha responsabilidad, especialmente el editor de PDF y el `Form` compartido.
