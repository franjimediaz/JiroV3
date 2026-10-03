import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getCurrentUser";
import { badRequest, notFound } from "@/lib/auth/apiError";
import { handleApiError } from "@/lib/auth/handleApiError";
import { executeReport, prepareReport, reportSources } from "@/lib/reports/server";

const reportId = (value: unknown) => {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) throw badRequest("Identificador de informe no válido");
  return value;
};
async function body(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw badRequest("Se requiere Content-Type application/json");
  const raw = await req.text();
  if (raw.length > 70000) throw badRequest("La definición es demasiado grande");
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
    return value;
  } catch { throw badRequest("JSON de informe no válido"); }
}
export async function GET(req: Request) {
  try {
    const ctx = await requireUser();
    if (new URL(req.url).searchParams.get("metadata") === "1") return NextResponse.json({sources: await reportSources()});
    const {data, error} = await ctx.supabase.from("report_definitions").select("id,config,created_at,updated_at")
      .eq("owner_id", ctx.user.id).order("updated_at", {ascending: false}).limit(200);
    if (error) throw Error("No se pudieron cargar los informes");
    return NextResponse.json({reports: (data || []).map(row => ({...row.config, id: row.id, created_at: row.created_at, updated_at: row.updated_at}))});
  } catch (error) { return handleApiError(error, crypto.randomUUID(), {route: "/api/reports", method: "GET"}); }
}
export async function POST(req: Request) {
  try {
    const ctx = await requireUser();
    const input = await body(req);
    if (input.action === "preview") return NextResponse.json({result: await executeReport(input.report, true)});
    if (input.action === "run") {
      const {data, error} = await ctx.supabase.from("report_definitions").select("config").eq("id", reportId(input.id)).eq("owner_id", ctx.user.id).maybeSingle();
      if (error) throw Error("No se pudo cargar el informe");
      if (!data) throw notFound("Informe no encontrado");
      return NextResponse.json({result: await executeReport(data.config, false)});
    }
    if (input.action !== "save") throw badRequest("Acción de informe no válida");
    const {report} = await prepareReport(input.report);
    const values = {owner_id: ctx.user.id, name: report.name, description: report.description, type: report.type, source_module: report.sourceModule, config: report};
    const query = input.id
      ? ctx.supabase.from("report_definitions").update(values).eq("id", reportId(input.id)).eq("owner_id", ctx.user.id)
      : ctx.supabase.from("report_definitions").insert(values);
    const {data, error} = await query.select("id,config,created_at,updated_at").maybeSingle();
    if (error) throw Error("No se pudo guardar el informe");
    if (!data) throw notFound("Informe no encontrado");
    return NextResponse.json({report: {...data.config, id: data.id, created_at: data.created_at, updated_at: data.updated_at}});
  } catch (error) { return handleApiError(error, crypto.randomUUID(), {route: "/api/reports", method: "POST"}); }
}
export async function DELETE(req: Request) {
  try {
    const ctx = await requireUser();
    const input = await body(req);
    const {data, error} = await ctx.supabase.from("report_definitions").delete().eq("id", reportId(input.id)).eq("owner_id", ctx.user.id).select("id").maybeSingle();
    if (error) throw Error("No se pudo eliminar el informe");
    if (!data) throw notFound("Informe no encontrado");
    return NextResponse.json({ok: true});
  } catch (error) { return handleApiError(error, crypto.randomUUID(), {route: "/api/reports", method: "DELETE"}); }
}
