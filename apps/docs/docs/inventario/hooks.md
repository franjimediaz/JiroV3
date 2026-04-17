# Inventario de hooks

## Hooks locales de `apps/web`

| Hook | Archivo | Función |
| --- | --- | --- |
| `useConfirm` | `apps/web/lib/hooks/useConfirm.tsx` | Confirmaciones e información modal |
| `usePerms` | `apps/web/lib/perms.tsx` | Acceso a permisos cargados |

## Hooks/estados internos relevantes en componentes

No son hooks exportados, pero condicionan comportamiento:

- `PermisosProvider` en `lib/perms.tsx`
- gestión de tabs, compute y overrides en `packages/ui/src/Form.tsx`
- estado de filtros/paginación en `packages/ui/src/ListView.tsx`
- estado de preview y configuración en `apps/web/lib/PdfTemplateForm.tsx`
