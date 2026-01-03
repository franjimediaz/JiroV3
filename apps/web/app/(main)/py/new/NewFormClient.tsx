"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Form } from "@repo/ui";
import type { ModuleSchema } from "@repo/types";
import { RequirePerms } from "@/lib/perms";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export function sanitize(values: any, schema: ModuleSchema) {
  const { meta, ...rest } = values || {};
  const out: any = { ...rest };

  // 1) Normalización global (una sola vez, fuera del loop)
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (typeof v === "string") {
      const s = v.trim();
      if (s === "" || s === "null" || s === "undefined") out[k] = null;
    } else if (v === "") {
      out[k] = null;
    }
  }

  // 2) Elimina timestamps gestionados por DB (para que default now() aplique)
  delete out.created_at;
  delete out.updated_at;

  // 3) Reglas por campo según schema
  for (const f of schema.fields || []) {
    const v = out[f.name];

    // Fechas: si llega string vacío ya sería null por arriba, pero por seguridad:
    if ((f.type === "date" || f.type === "datetime" || f.type === "timestamp") && v === "") {
      out[f.name] = null;
    }

    // Arrays
    const isArrayLikeType =
      f.type === "multiselect" ||
      f.type === "ReverseLink" ||
      (f as any).ui?.variant === "chips";

    if (isArrayLikeType) {
      if (v == null) out[f.name] = [];
      else if (typeof v === "string") {
        const s = v.trim();
        out[f.name] = s ? s.split(",").map(x => x.trim()).filter(Boolean) : [];
      } else if (!Array.isArray(v)) {
        out[f.name] = [];
      }
    }

    // Números
    if ((f.type === "number" || f.type === "money" || f.type === "percent") && v === "") {
      out[f.name] = null;
    }

    // ✅ UUIDs típicos: selectorTabla suele ser uuid. Si no es uuid válido, lo anulamos
    // (Esto es lo que te evita el error de Postgres)
    const looksLikeUuidField =

      f.type === "selectorTabla" ||
      /(^id$|_id$|Id$)/.test(f.name); // heurística útil (clienteId, obra_id, etc.)

    if (looksLikeUuidField) {
      if (v == null) {
        // ok
      } else if (typeof v === "string") {
        const s = v.trim();
        out[f.name] = isUuid(s) ? s : null; // o delete out[f.name]
      } else {
        out[f.name] = null;
      }
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
