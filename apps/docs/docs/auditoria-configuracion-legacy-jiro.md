# Auditoría de configuración legacy - JiRo

## 1. Resumen ejecutivo

JiRo tiene una base potente de arquitectura dinámica: módulos persistidos en `modulos`, schemas en `props`, formularios y listados renderizados desde configuración, permisos por módulo, relaciones, filtros, vistas especiales, workflows y plantillas PDF configurables. El riesgo principal no es falta de capacidad, sino convivencia de contratos antiguos y nuevos en los mismos flujos.

Los puntos más delicados son:

| Área | Estado observado | Riesgo principal |
| --- | --- | --- |
| Resolución de módulo | Conviven `slug`, `route`, `db.table`, `table`, `moduleSlug` y fallback por tabla. | Navegación o CRUD contra tabla equivocada. |
| Formularios dinámicos | `Form.tsx`, `ModuloForm.tsx`, `FieldInput.tsx` y `PdfTemplateForm.tsx` concentran render, estado, migración, validación y persistencia. | Cambios pequeños pueden romper create/edit/view, tabs, relaciones o PDF. |
| Config legacy en schemas | `ui.formSections`, `ui.previewTabs`, `ui.treeView`, `sourceTable`, `columns: string[]`, `appareance`. | Datos existentes pueden depender de compatibilidad silenciosa. |
| Endpoints genéricos | Varias rutas aceptan tablas/campos dinámicos con validación desigual. | Riesgo de seguridad y errores al evolucionar permisos. |
| Documentación/demo | `apps/docs/app/page.tsx` y `apps/docs/app/v1/page.tsx` muestran código antiguo y placeholders. | Puede guiar refactors hacia contratos obsoletos. |
| Artefactos generados | Existen `packages/ui/dist` y ficheros `.js/.d.ts` en `packages/types`. | Duplicidad y confusión sobre fuente canónica. |

La recomendación es no eliminar compatibilidad de golpe. Primero hay que inventariar datos reales en `modulos.props`, crear adaptadores explícitos y mover la normalización a una capa central. Después se pueden migrar registros y retirar los fallbacks.

## 2. Alcance del análisis

Se revisaron estas áreas:

| Área | Carpetas y archivos representativos |
| --- | --- |
| Apps web | `apps/web/app`, `apps/web/lib`, rutas dinámicas `/m/[slug]`, system, APIs, PDF, workflows, seeds. |
| UI compartida | `packages/ui/src/Form.tsx`, `FieldInput.tsx`, `ListView.tsx`, `Selector.tsx`, `TreeView.tsx`, `ModuleCalendarView.tsx`, `ModuloForm/*`. |
| Tipos compartidos | `packages/types/fields.ts`, filtros de selector, filtros por defecto, permisos y tipos generados. |
| Documentación | `apps/docs/docs/*`, `apps/docs/app/page.tsx`, `apps/docs/app/v1/page.tsx`. |
| PDF | `apps/web/lib/PdfTemplateForm.tsx`, `apps/web/lib/pdf/*`, APIs `/api/pdf/*`, `pdf-service/server.js`. |
| Workflows | `apps/web/lib/workflows/*`, `/api/workflows/run`. |
| Seeds y configuración | `apps/web/lib/seed/*`, `apps/web/lib/scripts/seed-modulos.ts`, `apps/web/lib/schemas/*`. |
| Infra monorepo | `package.json`, `packages/ui/package.json`, `packages/types/package.json`, `turbo.json`. |

No se modificó código fuente de la aplicación ni se eliminaron archivos. Este documento es el único cambio propuesto.

## 3. Hallazgos principales

| Problema | Ubicación | Impacto | Prioridad |
| --- | --- | --- | --- |
| Campo mal nombrado `appareance` usado como contrato real. | `packages/types/fields.ts`, `packages/ui/src/ListView.tsx` | Frena normalización y obliga a soportar typo. | Alta |
| Compatibilidad legacy de tabs, secciones, preview, treeview y calendario dentro del render principal. | `packages/ui/src/Form.tsx`, `packages/ui/src/ModuloForm/ModuloForm.tsx` | Alto acoplamiento y riesgo al tocar formularios. | Alta |
| `ModuloForm` mezcla edición visual, edición JSON, validación, migración y persistencia. | `packages/ui/src/ModuloForm/ModuloForm.tsx` | Difícil validar y testear cambios de schema. | Alta |
| `PdfTemplateForm` es monolítico y contiene tipos, builder, preview, datasets, lookups y JSON avanzado. | `apps/web/lib/PdfTemplateForm.tsx` | Alto coste de mantenimiento y regressions. | Alta |
| Rutas y CRUD system duplican lógica genérica. | `apps/web/app/(main)/system/*` | Divergencias en permisos, rutas y tablas. | Media |
| `FormClientLegacy.tsx` convive con `FormClient.tsx`. | `apps/web/lib/FormClientLegacy.tsx` | Código muerto o fallback no documentado. | Media |
| Endpoints genéricos permiten tabla/campo dinámico con controles parciales. | `/api/create`, `/api/aggregate`, `/api/dp/list`, `/api/upload*` | Seguridad y consistencia. | Alta |
| Workflows tienen dos registries distintos. | `apps/web/lib/workflows/runWorkflow.ts`, `apps/web/lib/workflows/index.ts` | Un workflow existe en una capa y no en otra. | Media |
| Documentación demo conserva placeholders antiguos. | `apps/docs/app/page.tsx`, `apps/docs/app/v1/page.tsx` | Confusión al implementar features nuevas. | Baja |
| Artefactos `dist` versionados junto a fuente. | `packages/ui/dist`, `packages/types/*.js`, `*.d.ts` | Fuente de verdad ambigua. | Baja |

## 4. Configuración legacy detectada

### Campo `appareance`

- Ubicación: `packages/types/fields.ts`, `packages/types/fields.d.ts`, `packages/ui/src/ListView.tsx`, documentación en `apps/docs/docs/06-formularios-dinamicos.md` y `07-tablas-listados-y-vistas.md`.
- Descripción: Propiedad de campo para controlar visibilidad en listados con valores `"List"`, `"Always"` y `"Zoom"`.
- Por qué es legacy: El nombre parece un typo de `appearance`. Además convive con `list`, `filter`, `visible` y `ui`.
- Riesgo: Alto si se elimina directamente, porque `ListView` le da prioridad sobre `list`.
- Dependencias posibles: Configuración guardada en `modulos.props.fields`, seeds antiguos y documentación.
- Propuesta de migración: Añadir adaptador `normalizeFieldConfig` que acepte `appareance` y emita `appearance`. Durante una fase, `ListView` debe leer solo el campo normalizado.
- Validaciones necesarias: Snapshot de todos los `modulos.props.fields` con `appareance`; tests de selección de columnas con `appearance`, `appareance`, `list` y fallback visible.

### `ui.formSections` global frente a tabs de formulario

- Ubicación: `packages/types/fields.ts`, `packages/ui/src/Form.tsx`, `packages/ui/src/ModuloForm/ModuloForm.tsx`, `apps/web/lib/scripts/seed-modulos.ts`.
- Descripción: Hay dos contratos para secciones: `schema.ui.formSections` y `schema.ui.tabs[].config.formSections`.
- Por qué es legacy: `ModuloForm` ya contiene una migración suave de `ui.formSections` hacia la primera tab de tipo `form`, pero `Form.tsx` sigue leyendo ambos formatos.
- Riesgo: Medio-alto. El formato global probablemente protege módulos ya guardados.
- Dependencias posibles: Seeds, módulos creados antes de tabs, formularios existentes en producción.
- Propuesta de migración: Centralizar en `normalizeModuleSchema` y persistir solo `ui.tabs`. Mantener `ui.formSections` como entrada temporal.
- Validaciones necesarias: Comparar render create/edit/view antes y después en módulos con y sin tabs.

### `ui.previewTabs` frente a `ui.specialViews`

- Ubicación: `packages/ui/src/Form.tsx`, `packages/ui/src/ModuloForm/ModuloForm.tsx`, `packages/types/fields.ts`.
- Descripción: `previewTabs` se transforma en `specialViews` de tipo `pdfPreview`.
- Por qué es legacy: El nombre antiguo está limitado a PDF, mientras `specialViews` soporta otros tipos como calendario.
- Riesgo: Medio. Puede haber módulos con previews PDF configuradas en el formato anterior.
- Dependencias posibles: Formularios con pestañas de preview PDF antiguas.
- Propuesta de migración: Script de migración que copie `previewTabs` a `specialViews` y deje marca de versión. El adaptador debe eliminar `previewTabs` solo al guardar.
- Validaciones necesarias: Abrir detalle de registros con PDF preview y comprobar que `PdfTemplatePreview` recibe `templateId` correcto.

### TreeView legacy: `sourceTable`, `groupBy`, `columns: string[]`

- Ubicación: `packages/types/fields.ts`, `packages/ui/src/Form.tsx`, `packages/ui/src/ModuloForm/ModuloForm.tsx`, `apps/web/app/(main)/m/[slug]/[id]/page.tsx`.
- Descripción: El contrato moderno usa `source.table`, `grouping.groupByField`, `columns: { field, label }[]`. El legacy acepta `sourceTable`, `groupBy` y columnas como strings.
- Por qué es legacy: Hay helpers como `extractColumnFields` y carga de schemas extra que leen ambos formatos.
- Riesgo: Alto si se elimina sin migración, porque afecta vistas embebidas y carga de schemas relacionados.
- Dependencias posibles: Módulos con tabs `treeview` o `ui.treeView` creados antes del contrato actual.
- Propuesta de migración: Normalizador único `normalizeTreeViewConfig` usado por editor, render y página server. Luego migrar `props.ui.treeView` a `ui.tabs`.
- Validaciones necesarias: TreeView con agrupación, columnas, totales, lookups, delete y navegación a filas hijas.

### Calendar legacy: `sourceTable`

- Ubicación: `packages/ui/src/Form.tsx`, `packages/ui/src/ModuloForm/ModuloForm.tsx`, `packages/ui/src/ModuleCalendarView.tsx`, `apps/web/lib/Calendar.tsx`.
- Descripción: El calendario moderno usa `sourceModuleSlug`, pero varios normalizadores aceptan `sourceTable`.
- Por qué es legacy: Conviven componente genérico `ModuleCalendarView` y `apps/web/lib/Calendar.tsx`, documentado como legacy.
- Riesgo: Medio. El fallback puede proteger calendarios creados por tabla real.
- Dependencias posibles: Configuración de tabs `calendar` y módulos con calendario local anterior.
- Propuesta de migración: Resolver siempre módulo fuente por slug y guardar `sourceModuleSlug`. Mantener `sourceTable` como alias solo en el adaptador.
- Validaciones necesarias: Calendario en detalle padre, filtros por parent record, vistas month/week/day y fechas all-day.

### `FormClientLegacy.tsx`

- Ubicación: `apps/web/lib/FormClientLegacy.tsx`.
- Descripción: Cliente anterior del formulario, con tabs locales comentadas para proyecto, árbol y calendario.
- Por qué es legacy: Duplica `sanitize`, `pickPersistablePayload`, permisos y submit de `FormClient.tsx`; contiene imports/comentarios de componentes antiguos.
- Riesgo: Medio. No parece ser la entrada principal de `/m/[slug]`, pero puede usarse manualmente o como referencia.
- Dependencias posibles: Imports no detectados, pruebas manuales o rutas antiguas.
- Propuesta de migración: Confirmar con búsqueda de imports, marcar como deprecated en docs internas y eliminar solo después de dos fases con `FormClient` cubriendo sus casos.
- Validaciones necesarias: `rg "FormClientLegacy"` y pruebas de detalle/edición de módulos de negocio.

### `NewFormClient.tsx` frente a `FormClient.tsx`

- Ubicación: `apps/web/lib/NewFormClient.tsx`, `apps/web/lib/FormClient.tsx`, `apps/web/app/(main)/m/[slug]/new/page.tsx`.
- Descripción: Existe un cliente específico para creación que redirige con `/${table}/${newId}`, mientras la ruta dinámica actual usa `FormClient` con base route.
- Por qué es legacy: La lógica actual de `/m/[slug]/new` no necesita este cliente específico.
- Riesgo: Medio si alguna ruta antigua lo usa; bajo si no hay imports.
- Dependencias posibles: Rutas antiguas o componentes system.
- Propuesta de migración: Consolidar sanitización y creación en un único `FormClient`/servicio CRUD.
- Validaciones necesarias: Crear registros en módulos con `db.table !== slug` y verificar navegación a `/m/[slug]/[id]`.

### Validaciones duplicadas de schema

- Ubicación: `packages/ui/src/ModuloForm/ModuloForm.tsx`, `apps/web/actions/modulos.ts`, `apps/web/app/api/modulos/route.ts`, tipos en `packages/types`.
- Descripción: `validatePropsClient` valida `props`, campos, `selectorTabla`, `ReverseLink` y compute. Backend y tipos tienen reglas separadas.
- Por qué es legacy/problemático: La UI puede permitir algo que backend rechaza o viceversa.
- Riesgo: Alto en edición de módulos.
- Dependencias posibles: Guardado de módulos, seeds, import/export futuros.
- Propuesta de migración: Crear un validador compartido de schema en `packages/types` o paquete nuevo `@repo/schema`, usado por cliente y servidor.
- Validaciones necesarias: Tests unitarios para campos, refs, compute, tabs, filtros y vistas especiales.

### Edición avanzada por JSON crudo

- Ubicación: `packages/ui/src/ModuloForm/ModuloForm.tsx`, `apps/web/lib/PdfTemplateForm.tsx`.
- Descripción: Los editores visuales mantienen un modo de JSON avanzado para `props` y `template`.
- Por qué es legacy/problemático: Es útil para compatibilidad, pero permite saltar validaciones visuales y dificulta migraciones.
- Riesgo: Alto si se elimina, medio si se mantiene sin validación central.
- Dependencias posibles: Configuraciones no cubiertas por UI, soporte de urgencia.
- Propuesta de migración: Mantener JSON avanzado, pero validarlo contra schema normalizado y mostrar diff entre formato legacy y formato guardado.
- Validaciones necesarias: Guardar JSON inválido, JSON legacy y JSON moderno; comprobar que no rompe módulos ni plantillas.

### `modulos` y `modulos_config`

- Ubicación: `apps/web/app/api/dp/list/route.ts`, comentarios en `/api/create`.
- Descripción: El endpoint busca tabla de configuración en `modulos` o `modulos_config`, y campos candidatos como `table`, `tabla`, `table_name`, `resource`, `tabla_real`, `slug`.
- Por qué es legacy: El contrato actual dominante es `modulos.props.db.table`.
- Riesgo: Medio. Puede ocultar datos antiguos o una transición incompleta.
- Dependencias posibles: Selectores que llaman `/api/dp/list` y módulos de configuraciones antiguas.
- Propuesta de migración: Reemplazar resolución heurística por `resolveModule(slug)`. Mantener fallback a `modulos_config` con log temporal.
- Validaciones necesarias: SelectorTabla con módulo normal, módulo cuyo `db.table` difiere de slug, y ausencia de módulo.

### Endpoints con tabla dinámica sin whitelist de módulo

- Ubicación: `apps/web/app/api/create/route.ts`, `apps/web/app/api/aggregate/route.ts`, parcialmente `apps/web/app/api/dp/list/route.ts`.
- Descripción: Aceptan `table` o `sourceTable` desde el cliente. `/api/create` tiene whitelist comentada.
- Por qué es legacy/problemático: Nace de una etapa genérica rápida, pero la arquitectura actual ya tiene `moduleSlug` y permisos.
- Riesgo: Alto.
- Dependencias posibles: Compute aggregate, acciones de formulario, clientes antiguos.
- Propuesta de migración: Aceptar `moduleSlug` + operación, resolver tabla desde `modulos`, validar permisos y campos permitidos. Mantener `table` temporal solo si coincide con `db.table` de un módulo permitido.
- Validaciones necesarias: Intentos con tabla inexistente, tabla no permitida, campos no declarados, usuario sin permiso.

### Doble resolución de módulos

- Ubicación: `apps/web/lib/modules.server.ts`, `apps/web/lib/modulos/modulos.ts`, lógica local en `FormClient.tsx`, `Form.tsx`, dashboard y páginas system.
- Descripción: Hay varios resolvers con contratos cercanos pero no idénticos.
- Por qué es legacy/problemático: Cada resolver decide distinto entre `slug`, `db.table`, `route`, `ui.route` y fallback.
- Riesgo: Alto.
- Dependencias posibles: Navegación, permisos, listados, detalles, selectores, PDF.
- Propuesta de migración: Crear `resolveModuleConfig` compartido con salida normalizada `{ slug, table, primaryKey, baseRoute, schema, permissionsKey }`.
- Validaciones necesarias: Módulo business, system, subtabla, vista, `db.table !== slug`, `route` nulo.

### Rutas system hardcodeadas y duplicadas

- Ubicación: `apps/web/app/(main)/system/users/*`, `system/rol/*`, `system/pdf-templates/*`, `apps/web/app/(main)/page.tsx`.
- Descripción: Cada PageClient define `CFG` con `moduleSlug` y `route`, repite handlers de ver/editar/eliminar/crear.
- Por qué es legacy/problemático: La capa dinámica ya resuelve módulos y permisos, pero system sigue parcialmente manual.
- Riesgo: Medio.
- Dependencias posibles: Experiencias específicas de roles, usuarios y plantillas PDF.
- Propuesta de migración: Extraer `SystemListPageClient` o usar `ListPageClient` con adaptadores por módulo.
- Validaciones necesarias: CRUD de usuarios, roles, permisos y plantillas PDF, incluyendo redirecciones.

### Workflows con dos registries

- Ubicación: `apps/web/lib/workflows/runWorkflow.ts`, `apps/web/lib/workflows/index.ts`.
- Descripción: `runWorkflow.ts` soporta `derive.createFromParent`; `index.ts` registra `budget.generateFromTasks`.
- Por qué es legacy/problemático: La ruta puede invocar una implementación distinta a la disponible en el índice.
- Riesgo: Medio.
- Dependencias posibles: Acciones de formulario y automatizaciones.
- Propuesta de migración: Un único registry versionado con keys constantes y validación de input/context.
- Validaciones necesarias: Ejecutar cada workflow registrado desde API y desde UI.

### Render PDF con compatibilidad y reparaciones internas

- Ubicación: `apps/web/lib/pdf/renderTemplateToHtml.ts`, `renderAdvancedBlocks.ts`, `templateExtensions.ts`, `apps/web/lib/PdfTemplateForm.tsx`.
- Descripción: El renderer tiene reparación de mojibake, helpers de fallback para relaciones singleton, bloques legacy como `budgetPartidas`, lookups y datasets.
- Por qué es legacy/problemático: Parte de la compatibilidad vive dentro del renderer final, no en un normalizador de template.
- Riesgo: Alto si se elimina, porque protege plantillas reales y contenido ya guardado.
- Dependencias posibles: PDF existentes con placeholders antiguos, `related`, `py`, `branding`, `datasets` y bloques budget.
- Propuesta de migración: Crear `normalizePdfTemplate(template, version)` y migrar plantillas por versión. El renderer debería recibir formato normalizado.
- Validaciones necesarias: Preview y generación de PDFs con cada tipo de bloque, datasets, lookups y relaciones.

### Placeholders y documentación ejecutable antigua

- Ubicación: `apps/docs/app/page.tsx`, `apps/docs/app/v1/page.tsx`.
- Descripción: Documentación tipo demo menciona que `selectorTabla` era placeholder y describe APIs antiguas.
- Por qué es legacy: Puede no reflejar el renderer real actual, donde `FieldInput` ya usa `Selector`.
- Riesgo: Bajo en runtime, medio para futuros prompts o refactors.
- Dependencias posibles: Onboarding, decisiones de implementación.
- Propuesta de migración: Convertir demos antiguas en `docs/legacy/` o marcarlas como históricas; mantener docs actuales en Markdown.
- Validaciones necesarias: Revisar links de docs y que no se importen demos como app productiva.

### Artefactos generados dentro del repo fuente

- Ubicación: `packages/ui/dist`, `packages/types/index.js`, `fields.js`, `*.d.ts`.
- Descripción: Hay salida compilada conviviendo con `src`, y `@repo/ui` exporta desde `src`.
- Por qué es legacy/problemático: Los artefactos pueden estar desactualizados y duplicar hallazgos.
- Riesgo: Bajo para runtime si exports apuntan a `src`; medio para búsquedas y análisis.
- Dependencias posibles: Builds antiguos o consumo externo local.
- Propuesta de migración: Confirmar que no se importan rutas `dist`, limpiar en fase sin riesgo y ajustar `.gitignore`.
- Validaciones necesarias: `pnpm build`, `pnpm check-types`, búsqueda de imports a `packages/ui/dist`.

### Código comentado, DEBUG y encoding corrupto

- Ubicación: `FormClientLegacy.tsx`, `/api/create`, `/api/dp/list`, múltiples archivos con textos `MÃ³dulo`, `âœ…`, `â‚¬`.
- Descripción: Comentarios y strings muestran mojibake y fragmentos temporales.
- Por qué es legacy/problemático: Dificulta mantenimiento y puede afectar UI/PDF.
- Riesgo: Bajo-medio según si el texto se renderiza al usuario.
- Dependencias posibles: Mensajes de error, docs y PDF.
- Propuesta de migración: Normalizar encoding a UTF-8 en una fase separada, con snapshot visual y sin mezclar con cambios funcionales.
- Validaciones necesarias: Generación PDF, UI de formulario/listado, errores API.

## 5. Inconsistencias de modelo y naming

### `slug`, `moduleSlug`, `db.table`, `table` y `route`

El contrato conceptual debería ser:

| Concepto | Significado recomendado |
| --- | --- |
| `slug` | Identificador estable del módulo en JiRo y clave de permisos. |
| `moduleSlug` | Parámetro runtime que apunta a `slug`; no debería aceptar tabla salvo adaptador legacy. |
| `db.table` | Tabla real de persistencia. |
| `table` | Alias interno normalizado de `db.table`; evitar guardarlo en raíz de módulo. |
| `route` | Ruta base de navegación; para módulos business debería tender a `/m/{slug}/`. |
| `parent_id` | Relación jerárquica entre módulos del menú, no relación de datos de negocio. |

Actualmente hay mezcla en:

| Patrón | Ejemplos | Riesgo |
| --- | --- | --- |
| `moduleSlug` puede ser slug o tabla. | `Form.tsx`, `FieldInput.tsx`, `DataProvider`, `treeViewProvider`. | Selectores y permisos usando claves distintas. |
| Fallback `db.table || slug`. | `modules.server.ts`, páginas PDF, dashboard. | Puede ocultar módulos mal configurados. |
| `table` raíz como compatibilidad. | `Form.tsx` busca `(mod as any)?.table`. | Mantiene contrato no documentado. |
| `route` en fila, `props.route`, `props.ui.route`. | `modules.server.ts`, `FormClient.tsx`. | Navegación no determinista. |
| Rutas system con `moduleSlug` igual a tabla. | `users`, `rol`, `pdf_templates`. | Permisos y tablas se acoplan por accidente. |

La migración segura debe producir una salida normalizada única y prohibir que componentes de UI resuelvan tabla/ruta por su cuenta.

### Campos y propiedades

| Nombre actual | Problema | Nombre recomendado |
| --- | --- | --- |
| `appareance` | Typo persistido. | `appearance` con adaptador temporal. |
| `sourceTable` | Tabla como identidad de vista. | `sourceModuleSlug` o `source.table` según contexto. |
| `previewTabs` | Nombre acoplado a PDF. | `specialViews`. |
| `formSections` global | Compite con tabs. | `tabs[].config.formSections`. |
| `ReverseLink` | Tipo con mayúsculas mientras otros son lower/camel. | Mantener temporal; considerar `reverseLink` con alias. |
| `selectorTabla` | Mezcla español/camel. | Mantener por compatibilidad; documentar como tipo estable o crear alias futuro. |
| `sourceTable` en compute | Puede ser tabla real sin permiso de módulo. | `sourceModuleSlug` + resolución a tabla. |

## 6. Problemas de estructura

| Archivo/componente | Tamaño aproximado | Responsabilidades mezcladas | Propuesta |
| --- | ---: | --- | --- |
| `apps/web/lib/PdfTemplateForm.tsx` | 4700 líneas | Tipos, builder, modales, bindings, preview, datasets, JSON avanzado, persistencia. | Separar `types`, `templateDefaults`, `BindingTokenHelper`, `DatasetEditor`, `LookupEditor`, `BlockEditor`, `ThemeEditor`, `PreviewPanel`. |
| `packages/ui/src/ModuloForm/ModuloForm.tsx` | 2200 líneas | Form de metadatos, schema editor, tabs, treeview, calendario, filtros, JSON crudo, migraciones, submit. | Crear hooks `useModuleSchemaEditor`, subcomponentes por tab y normalizador compartido. |
| `packages/ui/src/ModuloForm/FieldRow.tsx` | 1100 líneas | Edición de todos los tipos de campo, compute, refs, UI y validaciones. | Dividir por familias: básico, selector, reverse link, file/image, compute, appearance. |
| `packages/ui/src/Form.tsx` | 1060 líneas | Render, tabs, special views, compute, display cache, reverse links, treeview, calendario, navegación. | Separar `useFormState`, `useCompute`, `useRelationDisplay`, `FormTabs`, `FormFieldRenderer`, `SpecialViewRenderer`. |
| `packages/ui/src/FieldInput.tsx` | 900 líneas | Inputs básicos, selector, richtext, upload/delete/open file, validación de archivos, URLs. | Extraer `FileFieldInput`, `SelectorFieldInput`, helpers de storage y validación. |
| `apps/web/lib/pdf/renderTemplateToHtml.ts` | 1400 líneas | Sanitización, bindings, theme, bloques, budget, CSS, compatibilidad. | Separar renderer por bloque y normalización previa. |
| `packages/ui/src/ListView.tsx` | 530 líneas | Columnas, filtros, selector modal, cache de relaciones, export payload, paginación. | Extraer `useListFilters`, `useRelationDisplayCache`, `ListToolbar`, `ListTable`. |

La estructura actual funciona, pero hace que cada feature nueva toque archivos centrales con mucho estado. La refactorización debe ser incremental y con tests de comportamiento antes de extraer.

## 7. Problemas de lógica de codificación

| Problema | Ubicación | Resolución recomendada |
| --- | --- | --- |
| Uso extendido de `any`. | Especialmente `PdfTemplateForm`, `Form`, `TreeView`, `ModuloForm`, `FieldRow`, filtros. | Introducir tipos normalizados y usar `unknown` + type guards en adaptadores. |
| `JSON.stringify` en dependencias de hooks. | `Form.tsx`, `ListView.tsx`, otros docs/demo. | Usar firmas estables calculadas, reducers o memoización por partes. |
| Navegación mezclando `window.location.href`, `window.history` y router Next. | `Form.tsx`, `FormClient.tsx`, legacy. | Pasar callbacks `onBack`, `onEdit`, `navigate` desde capa Next. |
| Validaciones frontend/backend duplicadas. | `ModuloForm`, APIs, actions. | Validador compartido de schema y payload. |
| Resolución URL repartida. | `FormClient`, `modules.server`, dashboard, system PageClients. | Helper central de rutas y módulo normalizado. |
| Tablas dinámicas sin validación por módulo. | `/api/create`, `/api/aggregate`, `/api/dp/list`. | Resolver por `moduleSlug`, validar permisos y campo declarado. |
| Comentarios temporales y whitelists comentadas. | `/api/create`, `/api/dp/list`, legacy clients. | Convertir en issues/docs o implementar controles. |
| Encoding mojibake en strings. | UI, PDF, docs. | Normalización UTF-8 con revisión visual. |
| Imports/props sin uso. | `ListPageClient` hace `void modulesBySlug`; otros componentes system repiten `customers`. | Ejecutar lint y limpiar en fase 1. |
| Código muerto potencial. | `FormClientLegacy`, `NewFormClient`, `Calendar`, demos docs. | Confirmar imports y mover a legacy docs o eliminar por fases. |

## 8. Propuestas de mejora arquitectónica

1. Crear una capa central `ModuleResolver`.
   - Entrada: `slug` o alias legacy.
   - Salida: `{ slug, table, primaryKey, route, schema, ui, permissionsKey }`.
   - Usos: rutas `/m`, APIs, selectores, treeview, PDF, workflows.

2. Crear `normalizeModuleSchema`.
   - Debe migrar en memoria `appareance`, `formSections`, `previewTabs`, `treeView`, `calendar`, `sourceTable`, columnas string y root `table`.
   - Debe devolver también warnings para mostrar en `ModuloForm`.

3. Versionar `props`.
   - Añadir `schemaVersion` o `meta.configVersion`.
   - Cada guardado debe persistir formato moderno.
   - Los adaptadores deben declarar de qué versión a cuál migran.

4. Separar formulario runtime de editor de configuración.
   - Runtime: solo render, estado de valores y submit.
   - Editor: construcción de schema, validación y migración.
   - Persistencia: actions/API fuera de UI compartida.

5. Unificar filtros dinámicos.
   - Hay buen avance en `selectorTableFilters.ts` y `moduleDefaultFilters.ts`.
   - Falta una interfaz común para operadores, grupos, resolución por contexto y serialización.

6. Unificar relaciones.
   - `selectorTabla`, `ReverseLink`, TreeView lookups, PDF lookups y datasets resuelven relaciones de forma parecida.
   - Crear un `RelationResolver` que use `moduleSlug`, `valueField`, `displayField`, permisos y filtros.

7. Unificar compute/formulas/aggregates.
   - `computeEngine` y `/api/aggregate` deben compartir contrato.
   - Agregados deberían usar módulo fuente y campos permitidos, no tabla/campo arbitrarios.

8. Rediseñar permisos como contrato transversal.
   - Permisos por `slug` deben aplicarse en UI, API y data provider.
   - Añadir tests para acciones `ver`, `crear`, `actualizar`, `eliminar`, `exportar`, `importar`.

9. Modularizar PDF.
   - `PdfTemplateForm` debe pasar a carpeta `pdf-template/` con editores por bloque.
   - `renderTemplateToHtml` debe recibir template normalizado.

10. Ordenar documentación.
   - Mantener docs actuales en `apps/docs/docs`.
   - Mover demos antiguas a sección `legacy` o marcarlas como históricas.

## 9. Plan de migración por fases

### Fase 0: auditoría y snapshots de configuración actual

- Exportar todos los registros de `modulos` con `id`, `slug`, `route`, `tipo`, `parent_id`, `props`.
- Exportar todas las plantillas `pdf_templates` con `slug`, `source_table`, `related`, `template`.
- Crear reporte automático de uso de claves legacy: `appareance`, `formSections`, `previewTabs`, `treeView`, `calendar`, `sourceTable`, `groupBy`, `columns` string, root `table`.
- Añadir tests snapshot de módulos críticos: clientes, obras/proyectos, tareas, presupuestos, usuarios, roles y PDF.

### Fase 1: limpieza sin riesgo

- Confirmar imports de `FormClientLegacy`, `NewFormClient`, `Calendar` y `packages/ui/dist`.
- Limpiar imports/props sin uso y comentarios temporales solo si no cambian runtime.
- Corregir documentación que afirma placeholders ya sustituidos.
- Marcar explícitamente archivos legacy en docs, sin eliminarlos todavía.
- Añadir `.gitignore` o política de no versionar `dist` tras confirmar que no se consume.

### Fase 2: normalización de nombres y adaptadores

- Implementar `normalizeModuleSchema` y `normalizeField`.
- Mapear `appareance -> appearance`.
- Mapear `ui.formSections -> ui.tabs[].config.formSections`.
- Mapear `ui.previewTabs -> ui.specialViews`.
- Mapear `sourceTable -> sourceModuleSlug` o `source.table`.
- Mantener warnings y compatibilidad de lectura.

### Fase 3: separación de componentes monolíticos

- Extraer hooks de `Form.tsx`: estado, compute, relación display, tabs.
- Extraer subcomponentes de `ModuloForm`: metadatos, campos, layout, vistas, filtros, JSON.
- Extraer `FileFieldInput` y helpers de upload fuera de `FieldInput.tsx`.
- Extraer editores de bloques PDF desde `PdfTemplateForm.tsx`.
- Mantener exports públicos iguales hasta completar validación.

### Fase 4: migración de configuración legacy

- Ejecutar script dry-run que lea `modulos.props`, normalice y compare.
- Revisar manualmente módulos con warnings.
- Guardar props normalizados con versión.
- Migrar plantillas PDF a versión explícita.
- Dejar adaptadores activos pero registrar uso legacy en logs.

### Fase 5: eliminación definitiva de compatibilidad antigua

- Retirar lectura directa de `appareance`, `previewTabs`, `ui.treeView`, `ui.calendar`, `sourceTable` y root `table` del runtime.
- Eliminar clientes legacy si no hay imports ni uso.
- Eliminar heurísticas `modulos_config` si snapshots confirman que no hay dependencia.
- Retirar fallbacks que convierten tabla en moduleSlug.

### Fase 6: tests, documentación y validación final

- Tests unitarios de resolvers, normalizadores, permisos, filtros, compute y render de formularios.
- Tests de integración para CRUD dinámico, SelectorTabla, TreeView, Calendar, PDF preview/generate.
- Documentación de contrato moderno de módulo.
- Checklist manual por módulo crítico antes de merge.

## 10. Matriz de riesgos

| Elemento legacy | Ubicación | Riesgo | Impacto | Dependencias | Acción recomendada | Prioridad |
| --- | --- | --- | --- | --- | --- | --- |
| `appareance` | `fields.ts`, `ListView.tsx` | Alto | Columnas de listados | Config en DB | Adaptador y migración a `appearance` | Alta |
| `ui.formSections` global | `Form.tsx`, `ModuloForm.tsx` | Medio-alto | Layout de formularios | Módulos antiguos | Migrar a tabs form | Alta |
| `ui.previewTabs` | `Form.tsx`, `ModuloForm.tsx` | Medio | PDF preview en detalle | Plantillas/módulos antiguos | Migrar a `specialViews` | Alta |
| TreeView `sourceTable/groupBy/columns[]` | `Form.tsx`, `[id]/page.tsx` | Alto | Vistas hijas y totales | Módulos con treeview | Normalizador TreeView | Alta |
| Calendar `sourceTable` | `Form.tsx`, `ModuleCalendarView.tsx` | Medio | Calendarios embebidos | Tabs calendar | Resolver por moduleSlug | Media |
| `FormClientLegacy.tsx` | `apps/web/lib` | Medio | Edición antigua | Imports desconocidos | Confirmar uso y deprecar | Media |
| `NewFormClient.tsx` | `apps/web/lib` | Medio | Creación/rutas | Rutas antiguas | Consolidar en `FormClient` | Media |
| `/api/create` con tabla libre | `apps/web/app/api/create/route.ts` | Alto | Seguridad CRUD | Clientes antiguos | Reemplazar por módulo + permisos | Alta |
| `/api/aggregate` con tabla libre | `apps/web/app/api/aggregate/route.ts` | Alto | Compute/seguridad | Campos aggregate | Validar módulo/campo | Alta |
| `/api/dp/list` heurístico | `apps/web/app/api/dp/list/route.ts` | Medio | Selectores | `modulos_config` posible | Usar resolver central | Alta |
| Doble registry workflow | `workflows/runWorkflow.ts`, `workflows/index.ts` | Medio | Automatizaciones | Form actions/API | Unificar registry | Media |
| `PdfTemplateForm` monolítico | `apps/web/lib/PdfTemplateForm.tsx` | Alto | Plantillas PDF | PDF existentes | Modularizar con snapshots | Alta |
| `renderTemplateToHtml` con compat interna | `apps/web/lib/pdf` | Alto | Generación PDF | Templates antiguos | Normalizar por versión | Alta |
| Demos docs con placeholders | `apps/docs/app/*` | Bajo | Onboarding | Docs | Marcar legacy | Baja |
| `packages/ui/dist` | `packages/ui/dist` | Bajo | Confusión builds | Imports posibles | Confirmar y limpiar | Baja |
| Mojibake | Varios archivos | Medio | UI/PDF/docs | Strings visibles | Normalizar UTF-8 aislado | Media |

## 11. Checklist de limpieza segura

- [ ] Exportar snapshot de `modulos` y `pdf_templates`.
- [ ] Crear script de detección de claves legacy en JSON.
- [ ] Buscar imports reales de `FormClientLegacy`, `NewFormClient`, `Calendar` y `packages/ui/dist`.
- [ ] Añadir tests de `resolveModuleConfig`.
- [ ] Añadir tests de `normalizeModuleSchema`.
- [ ] Añadir tests de `ListView` para `appearance/appareance/list`.
- [ ] Añadir tests de filtros `selectorTabla` con arrays legacy y grupos nuevos.
- [ ] Añadir tests de `moduleDefaultFilters`.
- [ ] Añadir tests de compute formula y aggregate.
- [ ] Validar permisos en APIs genéricas.
- [ ] Migrar `previewTabs` a `specialViews` en dry-run.
- [ ] Migrar `formSections` global a tabs en dry-run.
- [ ] Migrar TreeView legacy a contrato moderno en dry-run.
- [ ] Migrar Calendar `sourceTable` a `sourceModuleSlug`.
- [ ] Revisar todos los módulos con `db.table !== slug`.
- [ ] Revisar rutas system y redirecciones a `/system/*`.
- [ ] Modularizar `Form.tsx` sin cambiar exports.
- [ ] Modularizar `ModuloForm.tsx` por pestañas internas.
- [ ] Extraer `FileFieldInput` y helpers de storage.
- [ ] Modularizar `PdfTemplateForm.tsx`.
- [ ] Versionar schemas y templates.
- [ ] Ejecutar pruebas manuales de create/edit/view/list/delete por módulo crítico.
- [ ] Validar PDF preview y generación real.
- [ ] Actualizar documentación con contrato moderno.
- [ ] Eliminar adaptadores solo cuando no haya registros legacy en snapshots.

## 12. Recomendaciones finales

La refactorización debe empezar por normalización, no por eliminación. El proyecto ya tiene piezas modernas suficientes, pero están rodeadas de compatibilidad implícita. Convertir esa compatibilidad en adaptadores explícitos reducirá el riesgo y permitirá medir cuántos datos reales siguen usando contratos antiguos.

Siguientes prompts recomendados:

1. Crear un script de auditoría JSON de `modulos.props` y `pdf_templates.template` que liste claves legacy sin modificar datos.
2. Diseñar `normalizeModuleSchema` con tests unitarios y snapshots.
3. Centralizar `resolveModuleConfig` y reemplazar progresivamente resoluciones locales.
4. Extraer de `Form.tsx` la lógica de tabs/special views sin cambiar comportamiento.
5. Endurecer `/api/create`, `/api/aggregate` y `/api/dp/list` para que operen por `moduleSlug` y permisos.

La regla de oro: cada eliminación de legacy debe ir precedida por snapshot, adaptador temporal, migración dry-run y prueba manual del flujo protegido.
