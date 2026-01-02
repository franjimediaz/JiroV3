"use client";

import { useRouter } from "next/navigation";
import { RequirePerms, usePerms } from "@/lib/perms";
import { createClient } from "@/lib/supabase/client";
import {ListView} from "@repo/ui"; // ruta donde lo hayas guardado
import type { ModuleSchema } from "@repo/types";

type Customer = {
  id: string;
  name?: string;
  email?: string;
};

type CustomersPageClientProps = {
  customers: Customer[];
  schema: ModuleSchema; // ⬅️ añadimos el schema del módulo
};

export default function PageClient({ customers, schema }: CustomersPageClientProps) {

const router = useRouter();
const { loading, hasPermiso } = usePerms();

const handleDelete = async (row: any) => {
    // 1) permiso (UX)
    if (!hasPermiso("py", "eliminar")) {
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
    <RequirePerms modulo="users" accion="ver">

      <ListView
        schema={schema}
        data={customers}
        onViewRow={(row) => (window.location.href = `/system/users/${row.uid}`)}
        onEditRow={(row) => (window.location.href = `/system/users/${row.uid}?edit=true`)}
        onDeleteRow={handleDelete}
        onCreate={() => (window.location.href = "/system/users/new")}
      />
    </RequirePerms>
  );
}
