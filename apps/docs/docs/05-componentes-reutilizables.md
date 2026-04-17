# Componentes reutilizables

## Núcleo reutilizable principal

| Componente | Archivo | Propósito | Usos visibles |
| --- | --- | --- | --- |
| `Form` | `packages/ui/src/Form.tsx` | Render dinámico completo de fichas | Módulos dinámicos, users, rol new, formularios varios |
| `FieldInput` | `packages/ui/src/FieldInput.tsx` | Render de cada tipo de campo | Interno de `Form` |
| `ListView` | `packages/ui/src/ListView.tsx` | Tabla/listado con filtros y acciones | Listados genéricos y módulos `system` |
| `Sidebar` | `packages/ui/src/Sidebar.tsx` | Navegación lateral | `MainShell`, `SidebarServer` |
| `TreeView` | `packages/ui/src/TreeView.tsx` | Vista agrupada jerárquica | Tabs treeview del schema |
| `ModuleCalendarView` | `packages/ui/src/ModuleCalendarView.tsx` | Calendario por módulo/relación | Tabs calendario y special views |
| `PdfTemplatePreview` | `packages/ui/src/PdfTemplatePreview.tsx` | Preview PDF dentro de formularios | Special view `pdfPreview` |
| `ModuloForm` | `packages/ui/src/ModuloForm/ModuloForm.tsx` | Editor visual del schema de módulo | `system/modulos/[id]` |
| `ModulosTree` | `packages/ui/src/ModuloForm/ModulosTree.tsx` | Árbol de módulos | `system/modulos` |
| `CreateModule` | `packages/ui/src/ModuloForm/CreateModule.tsx` | Modal de creación rápida de módulo | `system/modulos` |
| `RichTextEditor` | `packages/ui/src/RichTextEditor.tsx` | Rich text | Fields con `ui.variant = richtext`, editor de PDF |
| `ModalConfirm` | `packages/ui/src/modals/ModalConfirm.tsx` | Confirmaciones y diálogos informativos | `useConfirm` |

## Adaptadores locales de `apps/web`

| Componente | Archivo | Función |
| --- | --- | --- |
| `MainShell` | `apps/web/app/(main)/MainShell.tsx` | Shell principal responsive |
| `SidebarWithPerms` | `apps/web/app/(main)/SidebarWithPerms.tsx` | Sidebar filtrado por permisos |
| `ListPageClient` | `apps/web/lib/ListPageClient.tsx` | Adapta listados dinámicos a `ListView` |
| `FormClient` | `apps/web/lib/FormClient.tsx` | Adapta fichas dinámicas a `Form` |
| `PdfTemplateForm` | `apps/web/lib/PdfTemplateForm.tsx` | Editor específico de PDF templates |

## Props/capacidades principales del `Form`

Confirmadas en `packages/ui/src/Form.tsx`:

- `schema`
- `initialData`
- `recordId`
- `moduleSlug`
- `mode`
- `onSubmit`
- `onBack`
- `onEdit`
- `dataProvider`
- `treeViewProvider`
- `treeViewParentRecord`
- `modulesBySlug`
- `schemasBySlug`

## Props/capacidades principales del `ListView`

Confirmadas en `packages/types/fields.ts` y `packages/ui/src/ListView.tsx`:

- `schema`
- `data`
- `loading`
- `onViewRow`
- `onEditRow`
- `onDeleteRow`
- `onCreate`
- `onExport`
- `onImport`

## Dónde se reutilizan

- `ListView` se usa tanto en módulos genéricos como en `rol`, `users` y `pdf_templates`.
- `Form` se usa en la capa genérica `/m/[slug]` y también en altas/detalles específicos.
- `useConfirm` + `ModalConfirm` unifican confirmaciones en listados.
- `SelectorTabla` se usa en formularios y filtros de listados.

## Límites observados

- `PdfTemplateForm` no es genérico; está muy acoplado al dominio PDF.
- `system/users/[id]/FormClient.tsx` y `lib/FormClient.tsx` duplican parte de la lógica.
- `ListView` soporta export/import por interfaz, pero su implementación concreta depende del contenedor y hoy no está cerrada.
