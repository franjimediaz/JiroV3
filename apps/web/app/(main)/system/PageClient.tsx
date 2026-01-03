"use client";

import { ListView } from "@repo/ui";
import type { ModuleSchema } from "@repo/types";
import { useRouter } from "next/navigation";
import { RequirePerms, usePerms } from "@/lib/perms";
import { createClient } from "@/lib/supabase/client"; // 👈 tu supabase client de navegador

export default function CustomersPageClient({
  customers,
  schema,
}: {
  customers: any[];
  schema: ModuleSchema;
}) {
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
    <RequirePerms modulo="py" accion="ver">
      <ListView
        schema={schema}
        data={customers}
        onViewRow={(row) => router.push(`/py/${row.id}`)}
        onEditRow={(row) => router.push(`/py/${row.id}?edit=true`)}
        onDeleteRow={handleDelete}
        onCreate={() => router.push("/py/new")}
      />
    </RequirePerms>
  );
}
