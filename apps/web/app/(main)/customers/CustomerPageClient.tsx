"use client";

import { RequirePermiso } from "@/lib/perms";
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

export default function CustomersPageClient({ customers, schema }: CustomersPageClientProps) {
  return (
    <RequirePermiso modulo="customers" accion="ver">

      <ListView
        schema={schema}
        data={customers}
        onViewRow={(row) => (window.location.href = `/customers/${row.id}`)}
        onEditRow={(row) => (window.location.href = `/customers/${row.id}?edit=true`)}
        onDeleteRow={(row) => alert("Aquí pondrás tu modal para borrar: " + row.id)}
        onCreate={() => (window.location.href = "/customers/new")}
      />
    </RequirePermiso>
  );
}
