import { createClient } from "@/lib/supabase/server";
import type { ModuleSchema } from "@repo/types";
import NewFormClient from "./NewFormClient";

export const dynamic = "force-dynamic";

const CFG = {
  moduleSlug: "materialstask",
  titleNew: "Nuevo material",
} as const;

async function fetchSchemaBySlug(slug: string): Promise<ModuleSchema> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("modulos")
    .select("props")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el schema de ${slug}`);
  if (!data) throw new Error(`Módulo '${slug}' no encontrado en modulos`);

  const raw = (data as any).props;
  return typeof raw === "string"
    ? (JSON.parse(raw) as ModuleSchema)
    : (raw as ModuleSchema);
}

export default async function NewEntityPage() {
  const schema = await fetchSchemaBySlug(CFG.moduleSlug);

  // ✅ tabla y PK desde schema
  const table = CFG.moduleSlug;
  const primaryKey = schema.db.primaryKey ?? "id";

  // ✅ por si schema tiene algo raro, lo pasamos serializable
  const schemaClean = JSON.parse(JSON.stringify(schema));

  return (
    <main className="container py-4 bg-secondary bg-opacity-10 rounded">
      <header className="d-flex align-items-center mb-4">
        <h1 className="me-auto">{CFG.titleNew}</h1>
      </header>

      <NewFormClient
        schema={schemaClean}
        table={table}
        primaryKey={primaryKey}
        initialData={{ meta: { overrides: {} } }}
      />
    </main>
  );
}
