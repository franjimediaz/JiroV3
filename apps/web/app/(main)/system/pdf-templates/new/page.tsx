import PdfTemplateForm from "@/lib/PdfTemplateForm";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

export default async function NewPdfTemplatePage() {
  const tableCatalog = await getTableCatalog();
  const initialData = {
    name: "",
    slug: "",
    source_table: "",
    is_active: true,
    related: [],
    template: {
      page: { size: "A4", margin: 24 },
      blocks: [
        { type: "header", title: "Documento {{record.id}}", subtitle: "{{now}}" },
        { type: "divider" },
        { type: "text", value: "Ejemplo: {{record.id}}" },
      ],
    },
    tableCatalog,
  };

  return (
    <div className="container py-4">
      <PdfTemplateForm initialData={initialData} mode="create" />
    </div>
  );
}
