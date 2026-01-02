"use client";

import { ListView } from "@repo/ui";
import type { ModuleSchema } from "@repo/types";
import { useRouter } from "next/navigation";
import { RequirePerms } from "./RequirePerms";

export default function CustomersPageClient({
  customers,
  schema,
}: {
  customers: any[];
  schema: ModuleSchema;
}) {
  const router = useRouter();

  return (
    <RequirePerms modulo="customers" accion="ver">
      <ListView
        schema={schema}
        data={customers}
        onViewRow={(row) => router.push(`/customers/${row.id}`)}
        onEditRow={(row) => router.push(`/customers/${row.id}?edit=true`)}
        onDeleteRow={(row) => alert("modal borrar: " + row.id)}
        onCreate={() => router.push("/customers/new")}
      />
    </RequirePerms>
  );
}
