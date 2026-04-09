// app/api/pdf/generate/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePdfContext } from "@/lib/pdf/resolvePdfContext";
import { renderTemplateToHtml } from "@/lib/pdf/renderTemplateToHtml";
import { htmlToPdfBuffer } from "@/lib/pdf/htmlToPdf";
import {
  parseTemplateRow,
  deriveLabelResolversFromTemplate,
} from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readErrorPayload(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const json = await response.json();
      return {
        error: json?.error || json?.message || JSON.stringify(json),
        details: json?.details ?? null,
      };
    }

    const text = await response.text();
    return {
      error: text || `${response.status} ${response.statusText}`,
      details: null,
    };
  } catch {
    return {
      error: `${response.status} ${response.statusText}`,
      details: null,
    };
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("template");
    const recordId = searchParams.get("id");
    const cacheBust = searchParams.get("t") || Date.now().toString();

    if (!slug || !recordId) {
      return NextResponse.json(
        { ok: false, error: "template e id son requeridos" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // 1) Cargar plantilla activa
    const { data: tplRow, error } = await supabase
      .from("pdf_templates")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    if (!tplRow) {
      return NextResponse.json(
        { ok: false, error: "Template no encontrado" },
        { status: 404 },
      );
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

    // 6) PDF
    const serviceUrl = process.env.PDF_SERVICE_URL;
    const serviceSecret = process.env.PDF_SERVICE_SECRET;
    const filename = `${slug}-${recordId}-${cacheBust}.pdf`;

    let body: Buffer | null = null;
    let generator = "local";
    let upstreamError = "";
    let upstreamStatus: number | null = null;
    let upstreamStatusText = "";
    let upstreamDetails: any = null;

    if (serviceUrl && serviceSecret) {
      try {
        const r = await fetch(`${serviceUrl.replace(/\/$/, "")}/generate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${serviceSecret}`,
          },
          body: JSON.stringify({
            html,
            filename,
            disposition: "inline",
          }),
        });

        if (!r.ok) {
          upstreamStatus = r.status;
          upstreamStatusText = r.statusText;
          const payload = await readErrorPayload(r);
          upstreamError = payload.error;
          upstreamDetails = payload.details;
          console.error("PDF upstream service responded with error", {
            serviceUrl,
            upstreamStatus,
            upstreamStatusText,
            upstreamError,
            upstreamDetails,
            template: slug,
            recordId,
            sourceTable: tplRow.source_table,
          });
        } else {
          const pdfArrayBuffer = await r.arrayBuffer();
          body = Buffer.from(pdfArrayBuffer);
          generator = "service";
        }
      } catch (error: any) {
        upstreamError =
          error?.cause?.message || error?.message || "PDF service fetch failed";
        console.error("PDF upstream service fetch failed", {
          serviceUrl,
          upstreamError,
          errorStack: error?.stack || null,
          template: slug,
          recordId,
          sourceTable: tplRow.source_table,
        });
      }
    } else {
      upstreamError = "PDF service no configurado; usando generador local";
    }

    if (!body) {
      try {
        body = await htmlToPdfBuffer(html);
        generator = "local";
      } catch (localError: any) {
        return NextResponse.json(
          {
            ok: false,
            error: localError?.message || "No se pudo generar el PDF",
            details: {
              upstreamError,
              upstreamStatus,
              upstreamStatusText,
              upstreamDetails,
              template: slug,
              recordId,
              sourceTable: tplRow.source_table,
              localError: localError?.stack || localError?.message || null,
            },
          },
          { status: 500 },
        );
      }
    }

    // 7) Respuesta inline (abre en navegador)
    return new NextResponse(
      new Blob([new Uint8Array(body)], { type: "application/pdf" }),
      {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="${filename}"`,
          "cache-control": "no-store",
          "x-pdf-generator": generator,
          "x-pdf-upstream-status": upstreamStatus
            ? String(upstreamStatus)
            : "none",
        },
      },
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Error generate",
        details: e?.cause?.message || null,
      },
      { status: 500 },
    );
  }
}
