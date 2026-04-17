# Integraciones y servicios

## Supabase

### Clientes

- `lib/supabase/server.ts`
- `lib/supabase/client.ts`
- `lib/supabase/admin.ts`

Usos visibles:

- auth SSR y browser
- CRUD sobre tablas
- storage público/privado
- admin auth para crear usuarios

## APIs internas de datos

### Listado

- `/api/list`
- consumido por `packages/ui/src/providers/DataProvider.ts`

### Agregados

- `/api/aggregate`
- usado por campos `compute.type = aggregate`

### Creación genérica

- `/api/create`

## Storage y archivos

### Upload

- `/api/upload`
- soporta `kind = file | image`
- bucket público para imágenes
- bucket privado para ficheros genéricos

### Signed URL

- `/api/upload-url`
- para abrir ficheros privados

### Render en formularios

- `FieldInput.tsx` gestiona subida, borrado, preview y descarga

## PDF

### Gestión de plantillas

- tabla `pdf_templates`
- editor específico en `PdfTemplateForm`

### Resolución de contexto

- `lib/pdf/resolvePdfContext.ts`

Incluye:

- registro principal
- relaciones declaradas
- branding
- árbol `py` de relaciones inferidas
- labels resueltos desde UUID

### Render HTML

- `lib/pdf/renderTemplateToHtml.ts`

Soporta:

- bloques `header`, `text`, `divider`, `table`, `cards`, `totalsBox`, `budgetPartidas`
- bindings `{{record.*}}`, `{{item.*}}`, `{{branding.*}}`, `{{now}}`
- rich text sanitizado

### Generación PDF

- `/api/pdf/generate`
- intenta primero servicio externo `PDF_SERVICE_URL`
- fallback local con `htmlToPdfBuffer`

### Preview

- `/api/pdf/context`
- `/api/pdf/preview`
- `/api/pdf/template-preview`

## Workflows

### Endpoint

- `/api/workflows/run`

### Implementaciones visibles

- `derive.createFromParent`
- `budget.generateFromTasks` existe en librería, pero la ruta activa de `runWorkflow.ts` expone solo `derive.createFromParent`

## Dependencias observables con otras carpetas

- `packages/ui`: render dinámico y providers.
- `packages/types`: contratos de schema/permisos/DB.

## Limitaciones técnicas visibles

- `/api/create` no aplica whitelist efectiva de tablas.
- `/api/list` intenta resolver tabla desde `props?.db?.slug`, no `props?.db?.table`, lo que puede generar discrepancias.
- Parte del código mezcla acceso directo cliente a Supabase con paso por APIs internas.
