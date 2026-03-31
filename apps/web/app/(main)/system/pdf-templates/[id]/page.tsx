import { isUUID } from "@/lib/utils/isUUID";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import PdfTemplateForm from "@/lib/PdfTemplateForm";

export const dynamic = "force-dynamic";

async function getPdfTemplateById(id: string) {
  const { data, error } = await supabaseAdmin
    .from("pdf_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return { data, error: error?.message ?? null };
}

async function getTableCatalog() {
  const { data } = await supabaseAdmin.from("modulos").select("slug, props");
  const byTable = new Map<string, Set<string>>();

  for (const row of data ?? []) {
    const props = (row as any)?.props || {};
    const table = String(props?.db?.table || (row as any)?.slug || "").trim();
    if (!table) continue;

    const fields = Array.isArray(props?.fields) ? props.fields : [];
    if (!byTable.has(table)) byTable.set(table, new Set<string>());

    for (const f of fields) {
      const name = String((f as any)?.name || "").trim();
      if (!name) continue;
      byTable.get(table)!.add(name);
    }
  }

  return Array.from(byTable.entries())
    .map(([table, fields]) => ({ table, fields: Array.from(fields).sort() }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

export default async function PdfTemplateUnifiedPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  // ✅ desenvuelve promises como haces en módulos
  const { id } = await props.params;
  const { edit } = await props.searchParams;

  const isNew = id === "new";
  const isEdit = isNew || edit === "true";
  const tableCatalog = await getTableCatalog();

  // (opcional) require auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="container py-5">
        <h1 className="h4 mb-3">No autenticado</h1>
        <a className="btn btn-primary btn-sm" href="/login">Ir a login</a>
      </main>
    );
  }

  if (isNew) {
    const initial = {
      id: undefined,
      name: "",
      slug: "",
      source_table: "",
      is_active: true,
      related: [],
      template: { page: { size: "A4", margin: 24 }, blocks: [] },
      test_record_id: "",
      tableCatalog,
    };

    return (
      <main className="container-fluid py-4">
        <header className="d-flex justify-content-between align-items-center mb-4">
          <h1 className="h4 mb-0">Crear plantilla PDF</h1>
          <a className="btn btn-outline-secondary btn-sm" href="/system/pdf-templates">← Volver</a>
        </header>

        <PdfTemplateForm initialData={initial} mode="create" />
      </main>
    );
  }

  if (!isUUID(id)) {
    return (
      <main className="container py-5">
        <h1 className="h4 text-danger mb-2">ID inválido</h1>
        <p className="text-danger mb-4">El parámetro no es un UUID válido.</p>
        <a className="btn btn-outline-secondary btn-sm" href="/system/pdf-templates">← Volver</a>
      </main>
    );
  }

  const { data: tpl, error } = await getPdfTemplateById(id);

  if (!tpl) {
    return (
      <main className="container py-5">
        <h1 className="h4 text-danger mb-2">Plantilla no encontrada</h1>
        {error && <p className="text-danger small mb-3">Detalle: {error}</p>}
        <a className="btn btn-outline-secondary btn-sm" href="/system/pdf-templates">← Volver</a>
      </main>
    );
  }

  const mode = isEdit ? ("edit" as const) : ("view" as const);

  return (
    <main className="container-fluid py-4">
      <PdfTemplateForm initialData={{ ...tpl, tableCatalog }} mode={mode} />
    </main>
  );
}
