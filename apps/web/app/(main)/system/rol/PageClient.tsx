"use client";

import {ListView} from "@repo/ui"; // ruta donde lo hayas guardado
import type { ModuleSchema } from "@repo/types";
import { RequirePerms, usePerms } from "@/lib/perms";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Customer = {
  id: string;
  name?: string;
  email?: string;
};

type RolPageClientProps = {
  Rol: Customer[];
  schema: ModuleSchema; // ⬅️ añadimos el schema del módulo
};

export default function PageClient({ Rol, schema }: RolPageClientProps) {

const router = useRouter();
const { loading, hasPermiso } = usePerms();

const handleDelete = async (row: any) => {

      // 1) permiso (UX)
      if (!hasPermiso("rol", "eliminar")) {
        router.replace("/403");
        return;
      }
  
      // 2) confirm (cámbialo por tu modal)
      const ok = window.confirm(
        `¿Eliminar este cliente?\n\nID: ${row.id}\n\nEsta acción no se puede deshacer.`
      );
      if (!ok) return;
  
      // 3) delete Supabase (cliente)
      const supabase = createClient();
      const { error } = await supabase.from("customers").delete().eq("id", row.id);
  
      if (error) {
        // Si pones RLS bien, aquí verás "permission denied" si no tiene permiso real
        alert(`No se pudo eliminar: ${error.message}`);
        return;
      }
  
      router.refresh();
    };

      if (loading) return null;

  return (
    <RequirePerms modulo="rol" accion="ver">

      <ListView
        schema={schema}
        data={Rol}
        onViewRow={(row) => (window.location.href = `/system/rol/${row.id}`)}
        onEditRow={(row) => (window.location.href = `/system/rol/${row.id}?edit=true`)}
        onDeleteRow={handleDelete}
        onCreate={() => (window.location.href = "/system/rol/new")}
      />
      </RequirePerms>
    
  );
}
