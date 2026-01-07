// /app/system/modulos/[id]/page.tsx
import { isUUID } from "@/lib/utils/isUUID";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import ModuloForm from "./FormModule";


export const dynamic = "force-dynamic";

async function getModuloById(id: string) {
  const { data, error } = await supabaseAdmin
    .from("modulos")
    .select("id,parent_id,nombre,slug,route,tipo,orden,activo,props")
    .eq("id", id)
    .maybeSingle();
  return { data, error: error?.message ?? null };
}

export default async function ModuloUnifiedPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; parentId?: string }>;
}) {
  // ✅ Desenvuelve las Promises
  const { id } = await props.params;
  const { edit, parentId } = await props.searchParams;

  const isNew = id === "new";
  const isEdit = isNew || edit === "true";

  if (isNew) {
    const initial = {
      id: undefined,
      parent_id: parentId ?? null,
      nombre: "",
      slug: "",
      tipo: "tabla" as const,
      orden: 0,
      activo: true,
      props: { db: { table: "", softDelete: false }, fields: [], ui: {} },
    };
    return (
      <main className="container-fluid py-4">
        <header className="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h1 className="h4 mb-0">Crear módulo</h1>
          </div>
          <nav className="d-flex gap-2">
            <a className="btn btn-outline-secondary btn-sm" href="/system/modulos">
              ← Volver
            </a>
          </nav>
        </header>
        <ModuloForm initialData={initial} mode="create" />
      </main>
    );
  }

  if (!isUUID(id)) {
    return (
          <main className="container py-5">
            <h1 className="h4 text-danger mb-2">ID inválido</h1>
            <p className="text-danger mb-4">
              El parámetro no es un UUID válido.
            </p>
            <a className="btn btn-outline-secondary btn-sm" href="/system/modulos">
              ← Volver
            </a>
          </main>
              );
     }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="container py-5">
        <h1 className="h4 mb-3">No autenticado</h1>
        <a className="btn btn-primary btn-sm" href="/login">
          Ir a login
        </a>
      </main>
    );
  }

  const { data: modulo, error } = await getModuloById(id);
  if (!modulo) {
    return (
            <main className="container py-5">
              <h1 className="h4 text-danger mb-2">Módulo no encontrado</h1>

              {error && (
                <p className="text-danger small mb-3">
                  Detalle: {error}
                </p>
              )}

              <a className="btn btn-outline-secondary btn-sm" href="/system/modulos">
                ← Volver
              </a>
            </main>

          );
    }

  const mode = isEdit ? "edit" : "view" as const;

  return (
<main className="container-fluid py-4">
      <ModuloForm initialData={modulo} mode={mode} />
    </main>
  );
}
