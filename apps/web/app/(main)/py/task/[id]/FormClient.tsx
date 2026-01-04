"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Form } from "@repo/ui";
import type { ModuleSchema } from "@repo/types";
import { RequirePerms } from "@/lib/perms";
import  MaterialTaskModal  from "./MaterialTaskModal";

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
function pickPersistablePayload(values: any, schema: ModuleSchema) {
  const allowed = new Set(
    (schema.fields || [])
      .filter((f) => f.virtual !== true)
      // opcional: si tienes compute y NO quieres persistir algunos:
      .filter((f) => !(f.compute && (f.compute as any).persist === "none"))
      .map((f) => f.name)
  );

  // Construye payload solo con campos permitidos
  const out: Record<string, any> = {};
  for (const k of allowed) out[k] = values?.[k];

  // Nunca mandes meta al update
  delete out.meta;

  // Si por seguridad quieres borrar campos de sistema:
  delete out.created_at;
  delete out.updated_at;

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
  const [open, setOpen] = useState(false);

  const onSubmit = (values: any) => {
      start(async () => {
        try {
          if (mode !== "edit") return;
    
          const supabase = createClient();
    
          // 1) tu sanitize (convierte "" a null, quita arrays vacíos, etc.)
          const sanitized = sanitize(values, schema);
    
          // 2) filtro final por schema: SOLO virtual=false
          const payload = pickPersistablePayload(sanitized, schema);
    
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
      <button className="btn btn-success mb-3" onClick={() => setOpen(true)}>
        + Añadir material
      </button>
      <MaterialTaskModal
        open={open}
        onClose={() => setOpen(false)}
        taskId={id}
      />
      <Form schema={schema} initialData={initialData} mode={mode} onSubmit={onSubmit} />
    </div>
    </RequirePerms>
  );
}
