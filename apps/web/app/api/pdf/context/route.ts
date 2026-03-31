import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePdfContext } from "@/lib/pdf/resolvePdfContext";
import { parseTemplateRow, deriveLabelResolversFromTemplate } from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function buildContext(args: {
  sourceTable: string;
  recordId: string;
  related?: any[];
  template: any;
}) {
  const labelResolvers = deriveLabelResolversFromTemplate(args.template);

  return resolvePdfContext({
    sourceTable: args.sourceTable,
    recordId: args.recordId,
    related: Array.isArray(args.related) ? args.related : [],
    labelResolvers,
  });
}

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
    const ctx = await buildContext({
      sourceTable: tplRow.source_table,
      recordId: id,
      related,
      template,
    });

    return NextResponse.json({ ok: true, ctx }, { headers: { "cache-control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error context" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sourceTable = String(body?.sourceTable ?? "").trim();
    const recordId = String(body?.recordId ?? "").trim();
    const template = body?.template ?? {};
    const related = Array.isArray(body?.related) ? body.related : [];

    if (!sourceTable || !recordId) {
      return NextResponse.json({ ok: false, error: "sourceTable y recordId requeridos" }, { status: 400 });
    }

    const ctx = await buildContext({
      sourceTable,
      recordId,
      related,
      template,
    });

    return NextResponse.json({ ok: true, ctx }, { headers: { "cache-control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error context" }, { status: 500 });
  }
}
