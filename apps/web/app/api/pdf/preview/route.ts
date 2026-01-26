import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePdfContext } from "@/lib/pdf/resolvePdfContext";
import { renderTemplateToHtml } from "@/lib/pdf/renderTemplateToHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("template");
  const recordId = searchParams.get("id");

  if (!slug || !recordId) {
    return NextResponse.json({ error: "template e id requeridos" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: tpl, error } = await supabase
    .from("pdf_templates")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !tpl) {
    return NextResponse.json({ error: error?.message || "Template no encontrado" }, { status: 404 });
  }

  const ctx = await resolvePdfContext({
    sourceTable: tpl.source_table,
    recordId,
    related: Array.isArray(tpl.related) ? tpl.related : [],
  });

  // debug útil (ver terminal)
  console.log("preview ctx.record keys:", Object.keys(ctx.record || {}));

  const html = renderTemplateToHtml(tpl.template, ctx);

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
      expires: "0",
    },
  });
}
