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
    const id = searchParams.get("id");

    if (!slug || !id) {
      return NextResponse.json({ ok: false, error: "template e id requeridos" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: tplRow, error } = await supabase
      .from("pdf_templates")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!tplRow) return NextResponse.json({ ok: false, error: "Template no encontrado" }, { status: 404 });

    const { related, template } = parseTemplateRow(tplRow);

    // ✅ SIN hardcode: se deriva desde el template
    const labelResolvers = deriveLabelResolversFromTemplate(template);

    const ctx = await resolvePdfContext({
      sourceTable: tplRow.source_table,
      recordId: id,
      related,
      labelResolvers,
      template,
    });

    const html = renderTemplateToHtml(template, ctx);

    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error preview" }, { status: 500 });
  }
}
