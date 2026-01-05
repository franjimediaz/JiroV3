"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Form } from "@repo/ui";
import  TreeServices  from "./TreeServices";
import  Calendar  from "./Calendar";
import type { ModuleSchema } from "@repo/types";
import { RequirePerms } from "@/lib/perms";
type TabKey = "proyecto" | "arbol"| "calendario";

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
    if (f.name === "created_at" || f.name === "updated_at") {
      delete out[f.name];
      continue;
    }

    // 2) Si algún campo llega como "" pero parece array (por seguridad)
    if (v === "") {
      // Si sospechas que es array, mejor null que ""
      // (esto evita el error en columnas array)
      out[f.name] = null;
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
   const [activeTab, setActiveTab] = useState<TabKey>("proyecto");

  return (
    <RequirePerms modulo={table} accion="actualizar">
      {/* Tabs Bootstrap */}
      <ul className="nav nav-tabs mt-3">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link bg-secondary  text-light ${activeTab === "proyecto" ? "active" : ""}`}
            onClick={() => setActiveTab("proyecto")}
          >
            Proyecto
          </button>
        </li>

        <li className="nav-item">
          <button
            type="button"
            className={`nav-link bg-secondary  text-light ${activeTab === "arbol" ? "active" : ""}`}
            onClick={() => setActiveTab("arbol")}
          >
            Tareas
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link bg-secondary text-light ${activeTab === "calendario" ? "active" : ""}`}
            onClick={() => setActiveTab("calendario")}
          >
            Calendario
          </button>
        </li>
      </ul>

      
    <div style={{ opacity: pending ? 0.7 : 1 }}>
      <div className={`tab-pane fade mt-3 ${activeTab === "proyecto" ? "show active" : ""}`}>
      {activeTab === "proyecto" && (
      <Form schema={schema} initialData={initialData} mode={mode} onSubmit={onSubmit} />
        )}
      </div>
    
    <div className={`tab-pane fade  mt-3 ${activeTab === "arbol" ? "show active" : ""}`}>
          {activeTab === "arbol" && (
            
              <TreeServices proyectoId={id} />
            
          )}
        </div>

            <div className={`tab-pane fade mt-3 ${activeTab === "calendario" ? "show active" : ""}`}>
          {activeTab === "calendario" && (
            
              <Calendar proyectoId={id} />
            
          )}
        </div>
    </div>
    </RequirePerms>
  );
}
