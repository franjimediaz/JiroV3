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
  schemasByTable,
  
}: {
  schema: ModuleSchema;
  initialData: any;
  mode: "view" | "edit" | "create";
  table: string;
  primaryKey: string;
  id: string;
  modulesBySlug?: Record<string, { db?: { table?: string; primaryKey?: string } }>;
  schemasBySlug?: Record<string, ModuleSchema>;
  schemasByTable?: Record<string, ModuleSchema>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  const treeViewProvider = useMemo(() => createSupabaseTreeViewProvider(), []);
  const [activeTab, setActiveTab] = useState<TabKey>("proyecto");

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
        <div className={`tab-pane fade mt-3 ${activeTab === "proyecto" ? "show active" : ""}`}>
          {activeTab === "proyecto" && (
            <Form
              schema={schema}
              initialData={initialData}
              recordId={id || initialData?.[primaryKey] || initialData?.id}
              moduleSlug={table}
              mode={mode}
              onSubmit={onSubmit}
              modulesBySlug={modulesBySlug}
              treeViewProvider={treeViewProvider}
              treeViewParentRecord={initialData}
              onTreeViewRowView={(row) => router.push(`${row.id}`)}
              onTreeViewRowEdit={(row) => router.push(`${row.id}?edit=true`)}
              schemasBySlug={schemasBySlug}
              schemasByTable={schemasByTable}
            />
          )}
        </div>


      </div>
    </RequirePerms>
  );
}
