"use client";

import {ListView} from "@repo/ui"; // ruta donde lo hayas guardado
import type { ModuleSchema } from "@repo/types";

type Customer = {
  id: string;
  name?: string;
  email?: string;
};

type RolPageClientProps = {
  Rol: Customer[];
  schema: ModuleSchema; // ⬅️ añadimos el schema del módulo
};

export default function RolPageClient({ Rol, schema }: RolPageClientProps) {
  return (
    

      <ListView
        schema={schema}
        data={Rol}
        onViewRow={(row) => (window.location.href = `/system/rol/${row.id}`)}
        onEditRow={(row) => (window.location.href = `/system/rol/${row.id}?edit=true`)}
        onDeleteRow={(row) => alert("Aquí pondrás tu modal para borrar: " + row.id)}
        onCreate={() => (window.location.href = "/system/rol/new")}
      />
    
  );
}
