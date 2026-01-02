"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Form } from "@repo/ui";
import type { ModuleSchema } from "@repo/types";
import { RequirePerms } from "@/lib/perms";

function sanitize(values: any, schema: ModuleSchema) {
  const { meta, ...rest } = values || {};
  const out: any = { ...rest };

  for (const f of schema.fields || []) {
    const v = out[f.name];

    // ✅ Fechas: Postgres no acepta "" en timestamp/date
    if ((f.type === "date" || f.type === "datetime" || f.type === "timestamp"|| f.type === "text") && v === "") {
      out[f.name] = null;
    }

     for (const k of Object.keys(out)) {
    if (out[k] === "") out[k] = null;
  }
  if (f.name === "created_at" || f.name === "updated_at") {
      delete out[f.name];
      continue;
    }

    // ✅ Multiselect: nunca ""
    if (f.type === "multiselect") {
      if (v === "" || v == null) out[f.name] = [];
    }

    const isArrayLikeType =
      f.type === "multiselect" ||
      f.type === "ReverseLink" ||          // si lo tienes como type
      (f as any).ui?.variant === "chips";  // ejemplo si lo marcas así

    if (isArrayLikeType) {
      if (v === "" || v == null) {
        out[f.name] = [];
        continue;
      }
      if (typeof v === "string") {
        const s = v.trim();
        if (s === "" || s === "[]") {
          out[f.name] = [];
          continue;
        }
        // opcional: permitir "a,b,c" como input
        out[f.name] = s.split(",").map((x) => x.trim()).filter(Boolean);
        continue;
      }
      if (!Array.isArray(v)) {
        // si llega algo raro, evita romper Postgres
        out[f.name] = [];
        continue;
      }
    }
    if ((f.type === "number" || f.type === "money" || f.type === "percent") && v === "") {
        out[f.name] = null;
        }
  }

  return out;
}


export default function NewFormClient({
  schema,
  table,
  primaryKey,
  initialData,
}: {
  schema: ModuleSchema;
  table: string;
  primaryKey: string;
  initialData: any;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const onSubmit = (values: any) => {
    start(async () => {
      try {
        const supabase = createClient();
        const payload = sanitize(values, schema);

        // ✅ INSERT + devolver fila creada (para redirigir)
        const { data, error } = await supabase
          .from(table)
          .insert(payload)
          .select("*")
          .single();

        if (error) throw error;

        const newId = (data as any)?.[primaryKey] ?? (data as any)?.id;
        if (newId) {
          // ✅ redirige al detalle en modo view
          router.push(`/${table}/${newId}`);
          router.refresh();
        } else {
          // si no devuelve id por RLS o select, al menos vuelve
          router.back();
        }
      } catch (err: any) {
        console.error("Create submit error:", err?.message ?? err, err);
        alert(err?.message ?? "Error creando el registro");
      }
    });
  };

  return (
    <RequirePerms modulo={table} accion="crear">
    <div style={{ opacity: pending ? 0.7 : 1 }}>
      <Form
        schema={schema}
        initialData={initialData}
        mode="create"
        onSubmit={onSubmit}
      />
    </div>
    </RequirePerms>
  );
}
