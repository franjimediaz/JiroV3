"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Form } from "@repo/ui";
import type { ModuleSchema } from "@repo/types";
import { RequirePerms } from "@/lib/perms";

function sanitize(values: any, schema: any) {
  const { meta, ...rest } = values || {};
  const out: any = { ...rest };

  for (const f of schema.fields || []) {
    const v = out[f.name];

    // 1) multiselect: nunca string vacío
    if (f.type === "multiselect") {
      if (v === "" || v === undefined) out[f.name] = [];
      if (typeof v === "string") {
        // por si te llega "a,b,c"
        out[f.name] = v.split(",").map((x) => x.trim()).filter(Boolean);
      }
    }

    // 2) Si algún campo llega como "" pero parece array (por seguridad)
    if (v === "") {
      // Si sospechas que es array, mejor null que ""
      // (esto evita el error en columnas array)
      out[f.name] = null;
    }
    if (f.name === "created_at" || f.name === "updated_at") {
      delete out[f.name];
      continue;
    }
  }

  return out;
}

export default function FormClient({
  schema,
  initialData,
  mode,
  table,
  primaryKey,
  id,
}: {
  schema: ModuleSchema;
  initialData: any;
  mode: "view" | "edit" | "create";
  table: string;
  primaryKey: string;
  id: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  const onSubmit = (values: any) => {
    start(async () => {
      try {
        if (mode !== "edit") return;

        const supabase = createClient();
        const payload = sanitize(values, schema);

        const { error } = await supabase
          .from(table)
          .update(payload)
          .eq(primaryKey, id);

        if (error) throw error;

        const qs = new URLSearchParams(searchParams.toString());
        qs.delete("edit");
        router.replace(`?${qs.toString()}`);
        router.refresh();
      } catch (err: any) {
        console.error("Submit error:", err?.message ?? err, err);
        alert(err?.message ?? "Error guardando");
      }
    });
  };

  return (
    <RequirePerms modulo={table} accion="actualizar">
    <div style={{ opacity: pending ? 0.7 : 1 }}>
      <Form schema={schema} initialData={initialData} mode={mode} onSubmit={onSubmit} />
    </div>
    </RequirePerms>
  );
}
