// app/api/pdf/generate/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePdfContext } from "@/lib/pdf/resolvePdfContext";
import { renderTemplateToHtml } from "@/lib/pdf/renderTemplateToHtml";
import { parseTemplateRow, deriveLabelResolversFromTemplate } from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("template");
    const recordId = searchParams.get("id");

    if (!slug || !recordId) {
      return NextResponse.json(
        { ok: false, error: "template e id son requeridos" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1) Cargar plantilla activa
    const { data: tplRow, error } = await supabase
      .from("pdf_templates")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!tplRow) {
      return NextResponse.json({ ok: false, error: "Template no encontrado" }, { status: 404 });
    }

    // 2) Parsear/normalizar template + related (igual que preview)
    const { related, template } = parseTemplateRow(tplRow);

    // 3) Derivar resolvers desde el template (GUID -> label, etc.)
    const labelResolvers = deriveLabelResolversFromTemplate(template);

    // 4) Resolver contexto completo (record + related + lookups/labels)
    const ctx = await resolvePdfContext({
      sourceTable: tplRow.source_table,
      recordId,
      related,
      labelResolvers,
    });

    // 5) HTML
    const html = renderTemplateToHtml(template, ctx);

    // 6) PDF (Render service)
    const serviceUrl = process.env.PDF_SERVICE_URL;
    const serviceSecret = process.env.PDF_SERVICE_SECRET;

    if (!serviceUrl || !serviceSecret) {
      return NextResponse.json(
        { ok: false, error: "PDF service no configurado (PDF_SERVICE_URL / PDF_SERVICE_SECRET)" },
        { status: 500 }
      );
    }

    const r = await fetch(`${serviceUrl.replace(/\/$/, "")}/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceSecret}`,
      },
      body: JSON.stringify({
        html,
        filename: `${slug}-${recordId}.pdf`,
        disposition: "inline", // cambia a "attachment" para descarga directa
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return NextResponse.json(
        { ok: false, error: `PDF service error (${r.status}): ${errText}` },
        { status: 500 }
      );
    }

    const pdfArrayBuffer = await r.arrayBuffer();
    const body = new Uint8Array(pdfArrayBuffer);

    // 7) Respuesta inline (abre en navegador)
    return new NextResponse(body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${slug}-${recordId}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error generate" },
      { status: 500 }
    );
  }
}
