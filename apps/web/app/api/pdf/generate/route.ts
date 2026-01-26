import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePdfContext } from "@/lib/pdf/resolvePdfContext";
import { renderTemplateToHtml } from "@/lib/pdf/renderTemplateToHtml";
import { htmlToPdfBuffer } from "@/lib/pdf/htmlToPdf";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("template");
  const recordId = searchParams.get("id");

  if (!slug || !recordId) {
    return NextResponse.json(
      { error: "template e id son requeridos" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // 1) Cargar plantilla
  const { data: tpl, error } = await supabase
    .from("pdf_templates")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  if (!tpl) {
    return NextResponse.json(
      { error: "Template no encontrado" },
      { status: 404 }
    );
  }

  // 2) Resolver contexto (SERVER ONLY)
  const ctx = await resolvePdfContext({
    sourceTable: tpl.source_table,      // 👈 OJO AQUÍ
    recordId,
    related: Array.isArray(tpl.related) ? tpl.related : [],
  });

  // 3) HTML
  const html = renderTemplateToHtml(tpl.template, ctx);

  // 4) PDF
  const pdfBuffer = await htmlToPdfBuffer(html);
    const body = new Uint8Array(pdfBuffer);
  // 5) Respuesta
  return new NextResponse(body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${slug}-${recordId}.pdf"`,
    },
  });
}
