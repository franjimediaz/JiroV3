"use client";

import { Form } from "@repo/ui";
import { useRouter } from "next/navigation";
import { RequirePerms } from "@/lib/perms";

export default function NewUserClientForm({ schema }: { schema: any }) {
  const router = useRouter();
  

  return (
    <RequirePerms modulo='users' accion="crear">
    <Form
      schema={schema}
      initialData={{ meta: { overrides: {} } }}
      mode="create"
      onSubmit={async (values: any) => {
        // Esperamos que el form tenga email + password + lo que quieras guardar en public.users
        const res = await fetch("/api/users/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });

        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.detail || "No se pudo crear el usuario");
        }

        // Ajusta la ruta al listado real
        router.push("/users");
      }}
    />
    </RequirePerms>
  );
}
