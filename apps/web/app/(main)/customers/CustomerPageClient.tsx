"use client";

import { RequirePermiso } from "@/lib/perms";
import {ListView} from "@repo/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ModuleSchema } from "@repo/types";
import { usePerms, type Accion } from "@/lib/perms"

type Customer = {
  id: string;
  name?: string;
  email?: string;
};

type CustomersPageClientProps = {
  customers: Customer[];
  schema: ModuleSchema;
};

export function useRequirePermiso(modulo: string, accion: Accion = "ver") {
  const router = useRouter();
  const { loading, hasPermiso } = usePerms();

  const allowed = !loading && hasPermiso(modulo, accion);

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace("/403");
    }
  }, [loading, allowed, router]);

  return { loading, allowed };
}

export default function CustomersPageClient({ customers, schema }: CustomersPageClientProps) {
   const { permisos, hasPermiso } = usePerms();
  

    const router = useRouter();
  const { loading, allowed } = useRequirePermiso("customers", "ver");
console.log("PERMS DEBUG", { loading, permisos, canView: hasPermiso("customers", "ver") });
  if (loading || !allowed) return null;
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
