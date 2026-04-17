# Inventario de utilidades

## Utilidades en `apps/web/lib`

| Utilidad | Archivo | Función |
| --- | --- | --- |
| `fetchModuleRowBySlug` | `lib/modules.server.ts` | Resolver schema y metadata del módulo |
| `fetchAllModulesIndex` | `lib/modules.server.ts` | Índice `modulesBySlug` y `slugByTable` |
| `fetchRowById` | `lib/modules.server.ts` | Carga de fila genérica |
| `fetchModuloBySlug` | `lib/modulos/modulos.ts` | Carga tipada de módulo |
| `createSupabaseTreeViewProvider` | `lib/utils/treeViewProvider.ts` | Provider para `TreeView` |
| `appDataProvider` | `lib/appDataProvider.ts` | Provider ligero para selector/list |
| `isUUID` | `lib/utils/isUUID.ts` | Validación UUID |
| `resolvePdfContext` | `lib/pdf/resolvePdfContext.ts` | Contexto enriquecido para PDF |
| `renderTemplateToHtml` | `lib/pdf/renderTemplateToHtml.ts` | HTML final de documento |
| `htmlToPdfBuffer` | `lib/pdf/htmlToPdf.ts` | Render a PDF |
| `parseTemplateRow` | `app/api/pdf/_helpers.ts` | Parseo de `template` y `related` |
| `deriveLabelResolversFromTemplate` | `app/api/pdf/_helpers.ts` | Resolución declarativa de labels |

## Utilidades compartidas relevantes

| Utilidad | Archivo |
| --- | --- |
| `applyCompute` | `packages/ui/src/engines/computeEngine.ts` |
| `safeEval` | `packages/ui/src/engines/safeEval.ts` |
| `dataProvider` | `packages/ui/src/providers/DataProvider.ts` |

## Seeds y scripts

| Archivo | Observación |
| --- | --- |
| `lib/seed/modulos.seed.ts` | Define seed de módulos |
| `lib/seed/systemSeed.ts` | Parte del seed de sistema |
| `lib/scripts/seed-modulos.ts` | Script de carga |
| `actions/seed-modulos.ts` | Server action que lo dispara |
