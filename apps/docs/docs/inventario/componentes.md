# Inventario de componentes

## Componentes en `apps/web`

| Componente | Archivo | Tipo |
| --- | --- | --- |
| `Providers` | `apps/web/app/providers.tsx` | Provider |
| `MainShell` | `apps/web/app/(main)/MainShell.tsx` | Shell |
| `SidebarWithPerms` | `apps/web/app/(main)/SidebarWithPerms.tsx` | Wrapper |
| `SidebarServer` | `apps/web/app/ui/SidebarServer.tsx` | Wrapper SSR |
| `ClientLayout` | `apps/web/app/ui/ClientLayout.tsx` | Layout legacy |
| `ListPageClient` | `apps/web/lib/ListPageClient.tsx` | Adaptador de listado |
| `FormClient` | `apps/web/lib/FormClient.tsx` | Adaptador de formulario |
| `FormClientLegacy` | `apps/web/lib/FormClientLegacy.tsx` | Adaptador legacy |
| `NewFormClient` | `apps/web/lib/NewFormClient.tsx` | Alta genérica legacy |
| `PdfTemplateForm` | `apps/web/lib/PdfTemplateForm.tsx` | Editor específico |
| `Calendar` | `apps/web/lib/Calendar.tsx` | Calendario legacy |

## Componentes principales consumidos desde `@repo/ui`

| Componente | Archivo |
| --- | --- |
| `Form` | `packages/ui/src/Form.tsx` |
| `FieldInput` | `packages/ui/src/FieldInput.tsx` |
| `ListView` | `packages/ui/src/ListView.tsx` |
| `Sidebar` | `packages/ui/src/Sidebar.tsx` |
| `TreeView` | `packages/ui/src/TreeView.tsx` |
| `ModuleCalendarView` | `packages/ui/src/ModuleCalendarView.tsx` |
| `PdfTemplatePreview` | `packages/ui/src/PdfTemplatePreview.tsx` |
| `ModalConfirm` | `packages/ui/src/modals/ModalConfirm.tsx` |
| `Selector` | `packages/ui/src/Selector.tsx` |
| `RichTextEditor` | `packages/ui/src/RichTextEditor.tsx` |
| `ModuloForm` | `packages/ui/src/ModuloForm/ModuloForm.tsx` |
| `ModulosTree` | `packages/ui/src/ModuloForm/ModulosTree.tsx` |
| `CreateModule` | `packages/ui/src/ModuloForm/CreateModule.tsx` |

## Clientes específicos por módulo `system`

| Módulo | Archivo |
| --- | --- |
| `system/modulos` | `app/(main)/system/modulos/PageClient.tsx` |
| `system/modulos/[id]` | `app/(main)/system/modulos/[id]/FormModule.tsx` |
| `system/rol` | `app/(main)/system/rol/PageClient.tsx` |
| `system/rol/new` | `app/(main)/system/rol/new/NewFormClient.tsx` |
| `system/users` | `app/(main)/system/users/PageClient.tsx` |
| `system/users/[id]` | `app/(main)/system/users/[id]/FormClient.tsx` |
| `system/users/new` | `app/(main)/system/users/new/NewFormClient.tsx` |
| `system/pdf-templates` | `app/(main)/system/pdf-templates/PageClient.tsx` |
