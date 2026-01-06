"use client";

import { ListView} from "@repo/ui";
import { useConfirm } from "@/lib/hooks/useConfirm";
import type { ModuleSchema } from "@repo/types";
import { useRouter } from "next/navigation";
import { RequirePerms, usePerms } from "@/lib/perms";
import { createClient } from "@/lib/supabase/client";



const CFG = {
  moduleSlug: "py",
  titleSingular: "Proyecto",
  displayField: "title",
  route:"/py/"
} as const;



export default function PageClient({
  customers,
  schema,
}: {
  customers: any[];
  schema: ModuleSchema;
}) {


  const router = useRouter();
  const { loading, hasPermiso } = usePerms();
  const { confirm, modal, inform  } = useConfirm();

  const handleDelete = async (row: any) => {
    // 1) permiso (UX)
    if (!hasPermiso(CFG.moduleSlug, "eliminar")) {
    await inform({
    title: "Acción no permitida",
    message: `No tienes permisos para eliminar este ${CFG.titleSingular}. `,
    details: [
      { label: "Acción", value: "Eliminar" },
      { label: "Módulo", value: CFG.titleSingular }, 
    ],
    mode: "info",
    confirmText: "Aceptar",
  });

  return;
}

    // 2) confirm 

    const ok = await confirm({
    title: `Eliminar ${CFG.titleSingular}`,
    message: "Esta acción no se puede deshacer.",
    details: [{ label: "ID", value: row.id }],
    confirmText: "Eliminar",
    cancelText: "Cancelar",
    danger: true,
    
    
  });

  if (!ok) return;;

    // 3) delete Supabase (cliente)
    const supabase = createClient();
    const { error } = await supabase
      .from(CFG.moduleSlug)
      .delete()
      .eq("id", row.id);

    if (error) {
      // Si pones RLS bien, aquí verás "permission denied" si no tiene permiso real
      alert(`No se pudo eliminar: ${error.message}`);
      return;
    }

    router.refresh();
  };
  const handleView = async (row: any) => {
    if (!hasPermiso(CFG.moduleSlug, "ver")) {
      await inform({
        title: "Acción no permitida",
        message: `No tienes permisos para ver este ${CFG.titleSingular}.`,
        details: [
          { label: "Acción", value: "Ver" },
          { label: "ID", value: row.id },
        ],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }

    router.push(`${CFG.route}${row.id}`);
  };
  const handleEdit = async (row: any) => {
    if (!hasPermiso(CFG.moduleSlug, "actualizar")) {
      await inform({
        title: "Acción no permitida",
        message: `No tienes permisos para editar este ${CFG.titleSingular}.`,
        details: [
          { label: "Acción", value: "Editar" },
          { label: "ID", value: row.id },
        ],
        mode: "info",
        confirmText: "Aceptar",
      });
      return;
    }

    router.push(`${CFG.route}${row.id}?edit=true`);
  };
  const handleCreate = async () => {
  if (!hasPermiso(CFG.moduleSlug, "crear")) {
    await inform({
      title: "Acción no permitida",
      message: `No tienes permisos para crear un nuevo ${CFG.titleSingular}.`,
      details: [
        { label: "Acción", value: "Crear" },
        { label: "Módulo", value: CFG.titleSingular },
      ],
      mode: "info",
      confirmText: "Aceptar",
    });
    return;
  }

  router.push(`${CFG.route}new`);
};



  if (loading) return null;

  return (
    <RequirePerms modulo={CFG.moduleSlug} accion="ver">
      <>
      {modal}
      <ListView
        schema={schema}
        data={customers}
        onViewRow={handleView}
        onEditRow={handleEdit}
        onDeleteRow={handleDelete}
        onCreate={handleCreate}
      />
      </>
    </RequirePerms>
  );
}
