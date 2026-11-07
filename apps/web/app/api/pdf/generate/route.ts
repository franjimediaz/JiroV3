// app/api/pdf/generate/route.ts
import { NextResponse } from "next/server";
import { performance } from "node:perf_hooks";
import { createClient } from "@/lib/supabase/server";
import { resolvePdfContext } from "@/lib/pdf/resolvePdfContext";
import { renderTemplateToHtml } from "@/lib/pdf/renderTemplateToHtml";
import { htmlToPdfBuffer } from "@/lib/pdf/htmlToPdf";
import { requireModulePermission } from "@/lib/auth/requireModulePermission";
import { handleApiError } from "@/lib/auth/handleApiError";
import { getRequestId } from "@/lib/security/requestId";
import { enforceRateLimit, getClientIp } from "@/lib/security/rateLimit";
import {
  parseTemplateRow,
  deriveLabelResolversFromTemplate,
} from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function shouldLogPdfTimings() {
  return process.env.PDF_TIMING_LOGS === "1";
}

function logPdfTiming(label: string, startedAt: number, benchmarkId: string | null = null) {
  if (!shouldLogPdfTimings()) return;
  console.info(`[pdf] ${label}: ${Math.round(performance.now() - startedAt)}ms`);
  if (benchmarkId) console.info("[pdf-benchmark] " + JSON.stringify({ id: benchmarkId, scope: "web", stage: label, ms: performance.now() - startedAt }));
}

export async function GET(req: Request) {
  const totalStartedAt = performance.now();
  const requestId = getRequestId(req);
  const candidateId = req.headers.get("x-pdf-benchmark-id") || "";
  const benchmarkId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateId) ? candidateId : null;
  const logTiming = (label: string, startedAt: number) => logPdfTiming(label, startedAt, benchmarkId);
  try {
    const ip = getClientIp(req);
    await enforceRateLimit({ key: `pdf-generate:${ip}`, limit: 30, windowMs: 60_000 });

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

    await requireModulePermission("pdf_templates", "exportar");
    const supabase = await createClient();

    // 1) Cargar plantilla activa
    const templateStartedAt = performance.now();
    const { data: tplRow, error } = await supabase
      .from("pdf_templates")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    logTiming("templateQuery", templateStartedAt);

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
    const resolveStartedAt = performance.now();
    const ctx = await resolvePdfContext({
      sourceTable: tplRow.source_table,
      recordId,
      related,
      labelResolvers,
      template,
    });
    logTiming("resolvePdfContext", resolveStartedAt);

    // 5) HTML
    const renderStartedAt = performance.now();
    const html = renderTemplateToHtml(template, ctx);
    logTiming("renderTemplateToHtml", renderStartedAt);

    // 6) PDF
    const filename = `${slug}-${recordId}-${cacheBust}.pdf`;
    const localStartedAt = performance.now();
    let body: Buffer;
    try {
      body = await htmlToPdfBuffer(html);
    } catch (localError: any) {
      return NextResponse.json(
        {
          ok: false,
          error: localError?.message || "No se pudo generar el PDF",
          details: { template: slug },
        },
        { status: 500 },
      );
    } finally {
      logTiming("pdfLocal", localStartedAt);
    }

    // 7) Respuesta como descarga
    return new NextResponse(
      new Blob([new Uint8Array(body)], { type: "application/pdf" }),
      {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${filename}"`,
          "cache-control": "no-store",
          "x-pdf-generator": "local",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, requestId, { route: "/api/pdf/generate", method: "GET" });
  } finally {
    logTiming("total", totalStartedAt);
  }
}
