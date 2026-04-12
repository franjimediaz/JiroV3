import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderTemplateToHtml } from "@/lib/pdf/renderTemplateToHtml";
import { parseTemplateRow } from "../_helpers";
import { buildPdfTemplatePreviewContext } from "@/lib/pdf/pdfTemplatePreview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const templateId = String(body?.templateId ?? "").trim();
    const recordId = String(body?.recordId ?? "").trim();
    const recordData =
      body?.recordData && typeof body.recordData === "object" && !Array.isArray(body.recordData)
        ? body.recordData
        : {};
    const schema = body?.schema && typeof body.schema === "object" && !Array.isArray(body.schema) ? body.schema : null;

    if (!templateId) {
      return NextResponse.json({ ok: false, error: "templateId requerido" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: tplRow, error } = await supabase
      .from("pdf_templates")
      .select("*")
      .eq("id", templateId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!tplRow) {
      return NextResponse.json({ ok: false, error: "Template no encontrado" }, { status: 404 });
    }

    const { template } = parseTemplateRow(tplRow);
    const ctx = await buildPdfTemplatePreviewContext({
      templateRow: tplRow,
      recordId,
      recordData,
      schema,
    });

    const html = renderTemplateToHtml(template, ctx);

    return NextResponse.json(
      {
        ok: true,
        html,
        template: {
          id: tplRow.id,
          name: tplRow.name ?? null,
          slug: tplRow.slug ?? null,
        },
        contextMode: recordId ? "record+override" : "recordData-only",
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error preview" }, { status: 500 });
  }
}
