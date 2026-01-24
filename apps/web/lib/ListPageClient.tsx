"use client";

import { ListView } from "@repo/ui";
import type { ModuleSchema } from "@repo/types";
import { useRouter } from "next/navigation";
import { RequirePerms, usePerms } from "@/lib/perms";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/lib/hooks/useConfirm";

export default function ListPageClient({
  schema,
  rows,
  moduleSlug,
  baseRoute,
  titleSingular,
  modulesBySlug,
}: {
  schema: ModuleSchema;
  rows: any[];
  moduleSlug: string;
  baseRoute: string;
  titleSingular: string;
  modulesBySlug?: Record<string, any>;
}) {
  const router = useRouter();
  const { loading, hasPermiso } = usePerms();
  const { confirm, modal, inform } = useConfirm();

  const handleDelete = async (row: any) => {
    if (!hasPermiso(moduleSlug, "eliminar")) {
      await inform({
        title: "Acción no permitida",
        message: `No tienes permisos para eliminar este ${titleSingular}.`,
        details: [{ label: "Acción", value: "Eliminar" }, { label: "Módulo", value: titleSingular }],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }

    const ok = await confirm({
      title: `Eliminar ${titleSingular}`,
      message: "Esta acción no se puede deshacer.",
      details: [{ label: "ID", value: row.id }],
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      danger: true,
    });
    if (!ok) return;

    const supabase = createClient();
    const { error } = await supabase.from(moduleSlug).delete().eq("id", row.id);
    if (error) {
      alert(`No se pudo eliminar: ${error.message}`);
      return;
    }

    router.refresh();
  };

  const handleView = async (row: any) => {
    if (!hasPermiso(moduleSlug, "ver")) {
      await inform({
        title: "Acción no permitida",
        message: `No tienes permisos para ver este ${titleSingular}.`,
        details: [{ label: "Acción", value: "Ver" }, { label: "ID", value: row.id }],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }
    router.push(`${baseRoute.replace(/\/?$/, "/")}${row.id}`);
  };

  const handleEdit = async (row: any) => {
    if (!hasPermiso(moduleSlug, "actualizar")) {
      await inform({
        title: "Acción no permitida",
        message: `No tienes permisos para editar este ${titleSingular}.`,
        details: [{ label: "Acción", value: "Editar" }, { label: "ID", value: row.id }],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }
    router.push(`${baseRoute.replace(/\/?$/, "/")}${row.id}?edit=true`);
  };

  const handleCreate = async () => {
    if (!hasPermiso(moduleSlug, "crear")) {
      await inform({
        title: "Acción no permitida",
        message: `No tienes permisos para crear un nuevo ${titleSingular}.`,
        details: [{ label: "Acción", value: "Crear" }, { label: "Módulo", value: titleSingular }],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }
    router.push(`${baseRoute.replace(/\/?$/, "/")}new`);
  };

  if (loading) return null;

  return (
    <RequirePerms modulo={moduleSlug} accion="ver">
      <>
        {modal}
        <ListView
          schema={schema}
          data={rows}
          onViewRow={handleView}
          onEditRow={handleEdit}
          onDeleteRow={handleDelete}
          onCreate={handleCreate}
        />
      </>
    </RequirePerms>
  );
}
