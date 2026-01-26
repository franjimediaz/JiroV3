import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PdfTemplatesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("pdf_templates")
    .select("id,name,slug,source_table,is_active,updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0">Plantillas PDF</h2>
        <Link className="btn btn-primary" href="/system/pdf-templates/new">
          + Nueva plantilla
        </Link>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr className="text-muted small">
                <th>Nombre</th>
                <th>Slug</th>
                <th>Tabla</th>
                <th>Activa</th>
                <th className="text-end" style={{ width: "1%" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td><code>{t.slug}</code></td>
                  <td><code>{t.source_table}</code></td>
                  <td>{t.is_active ? "Sí" : "No"}</td>
                  <td className="text-end">
                    <Link className="btn btn-sm btn-outline-secondary me-2" href={`/system/pdf-templates/${t.id}`}>
                      Ver
                    </Link>
                    <Link className="btn btn-sm btn-outline-primary" href={`/system/pdf-templates/${t.id}?edit=true`}>
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
              {(data || []).length === 0 && (
                <tr><td colSpan={5} className="text-muted p-4">No hay plantillas aún.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
