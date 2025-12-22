import { createClient } from "@/lib/supabase/server";
import type { ModuleSchema } from "@repo/types";
import NewUserClientForm from "./UserCreateFormClient";

export const dynamic = "force-dynamic";

const CFG = {
  moduleSlug: "users",
  table: "users",
  titleNew: "Nuevo usuario",
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

  return (
    <main className="container py-4 bg-secondary bg-opacity-10 rounded">
      <header className="d-flex align-items-center mb-4">
        <h1 className="me-auto">{CFG.titleNew}</h1>
      </header>

      <NewUserClientForm schema={schema} />
    </main>
  );
}
