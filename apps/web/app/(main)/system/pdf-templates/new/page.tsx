import PdfTemplateForm from "@/lib/PdfTemplateForm";

export default function NewPdfTemplatePage() {
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
  };

  return (
    <div className="container py-4">
      <PdfTemplateForm initialData={initialData} mode="create" />
    </div>
  );
}
