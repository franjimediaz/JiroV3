// app/api/pdf/generate/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePdfContext } from "@/lib/pdf/resolvePdfContext";
import { renderTemplateToHtml } from "@/lib/pdf/renderTemplateToHtml";
import { htmlToPdfBuffer } from "@/lib/pdf/htmlToPdf";
import { parseTemplateRow, deriveLabelResolversFromTemplate } from "../_helpers";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const candidates = [
  "node_modules/playwright-core/.local-browsers",
  "node_modules/playwright/.local-browsers",
  "node_modules/.pnpm",
];

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

    // 3) ✅ Derivar resolvers desde el template (GUID -> label, etc.)
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

    console.log("CWD", process.cwd());
    console.log("Has node_modules?", fs.existsSync(path.join(process.cwd(), "node_modules")));
    console.log("RUNTIME PLAYWRIGHT_BROWSERS_PATH =", process.env.PLAYWRIGHT_BROWSERS_PATH);
    console.log("Exists chromium bin?", fs.existsSync(
                "/var/task/node_modules/.pnpm/@sparticuz+chromium@143.0.4/node_modules/@sparticuz/chromium/bin"
              ));
    for (const p of candidates) {
      console.log("Exists", p, fs.existsSync(path.join(process.cwd(), p)));
    }

    // 6) PDF
    const pdfBuffer = await htmlToPdfBuffer(html);
    const body = new Uint8Array(pdfBuffer);

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
      { ok: false,
       error: e?.message || "Error generate",
      stack: e?.stack || null,
      pwPath: process.env.PLAYWRIGHT_BROWSERS_PATH || null,
      runtime: process.env.VERCEL ? "vercel" : "local",
      ExistChronium: fs.existsSync(
                "/var/task/node_modules/.pnpm/@sparticuz+chromium@143.0.4/node_modules/@sparticuz/chromium/bin"),
      },
      { status: 500 }
    );
  }
}
