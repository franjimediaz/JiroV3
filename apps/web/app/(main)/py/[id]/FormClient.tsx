"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseTreeViewProvider } from "@/lib/utils/treeViewProvider";
import { createClient } from "@/lib/supabase/client";
import { Form } from "@repo/ui";
//import TreeServices from "./TreeServices";
//import Calendar from "./Calendar";
import type { ModuleSchema } from "@repo/types";
import { RequirePerms } from "@/lib/perms";
import {CFG} from "./page"

type TabKey = "proyecto" | "arbol" | "calendario";

function sanitize(values: any, schema: any) {
  const { meta, ...rest } = values || {};
  const out: any = { ...rest };

  for (const f of schema.fields || []) {
    const v = out[f.name];

    if (f.type === "multiselect") {
      if (v === "" || v === undefined) out[f.name] = [];
      if (typeof v === "string") {
        out[f.name] = v.split(",").map((x) => x.trim()).filter(Boolean);
      }
    }

    if (f.name === "created_at" || f.name === "updated_at") {
      delete out[f.name];
      continue;
    }

    if (v === "") out[f.name] = null;
  }

  return out;
}

function pickPersistablePayload(values: any, schema: ModuleSchema) {
  const allowed = new Set(
    (schema.fields || [])
      .filter((f) => f.virtual !== true)
      .filter((f) => !(f.compute && (f.compute as any).persist === "none"))
      .map((f) => f.name)
  );

  const out: Record<string, any> = {};
  for (const k of allowed) out[k] = values?.[k];

  delete out.meta;
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
  modulesBySlug,
  schemasBySlug,
  
}: {
  schema: ModuleSchema;
  initialData: any;
  mode: "view" | "edit" | "create";
  table: string;
  primaryKey: string;
  id: string;
  modulesBySlug?: Record<string, { db?: { table?: string; primaryKey?: string } }>;
  schemasBySlug?: Record<string, ModuleSchema>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const resolveRouteFromModules = (source: string) => {
  if (!modulesBySlug) return null;

  // 1) source como slug
  const bySlug = modulesBySlug[source] as any;
  const r1 = bySlug?.route || bySlug?.ui?.route || null;
  if (r1) return String(r1);

  // 2) source como tabla -> busca quien tenga db.table === source
  for (const mod of Object.values(modulesBySlug)) {
    const m: any = mod;
    if (m?.db?.table === source) {
      const r2 = m?.route || m?.ui?.route || null;
      if (r2) return String(r2);
    }
  }

  return null;
};

  

  const treeViewProvider = useMemo(() => createSupabaseTreeViewProvider(), []);
  const [activeTab, setActiveTab] = useState<TabKey>("proyecto");

  const onSubmit = (values: any) => {
    start(async () => {
      try {
        if (mode !== "edit") return;

        const supabase = createClient();
        const sanitized = sanitize(values, schema);
        const payload = pickPersistablePayload(sanitized, schema);

        const { error } = await supabase.from(table).update(payload).eq(primaryKey, id);
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
  {/**    <ul className="nav nav-tabs mt-3">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link bg-secondary text-light ${activeTab === "proyecto" ? "active" : ""}`}
            onClick={() => setActiveTab("proyecto")}
          >
            Proyecto
          </button>
        </li>

        <li className="nav-item">
          <button
            type="button"
            className={`nav-link bg-secondary text-light ${activeTab === "arbol" ? "active" : ""}`}
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
      </ul>*/} 

      <div style={{ opacity: pending ? 0.7 : 1 }}>
        <div className={`tab-pane fade mt-3 ${activeTab === "proyecto" ? "show active" : ""}`}>
          {activeTab === "proyecto" && (
            <Form
              schema={schema}
              initialData={initialData}
              mode={mode}
              onSubmit={onSubmit}
              modulesBySlug={modulesBySlug}
              treeViewProvider={treeViewProvider}
              treeViewParentRecord={initialData}
              //nTreeViewRowView={(row) => router.push(`${row.id}`)}
              //onTreeViewRowEdit={(row) => router.push(`${row.id}?edit=true`)}
              schemasBySlug={schemasBySlug}
              
            />
          )}
        </div>

    {/**     <div className={`tab-pane fade mt-3 ${activeTab === "arbol" ? "show active" : ""}`}>
          {activeTab === "arbol" && <TreeServices proyectoId={id} />}
        </div>

        <div className={`tab-pane fade mt-3 ${activeTab === "calendario" ? "show active" : ""}`}>
          {activeTab === "calendario" && <Calendar proyectoId={id} />}
        </div>*/}
      </div>
    </RequirePerms>
  );
}
