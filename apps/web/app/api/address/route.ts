import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getCurrentUser";
import { badRequest, forbidden } from "@/lib/auth/apiError";
import { handleApiError } from "@/lib/auth/handleApiError";
import { enforceRateLimit, getClientIp } from "@/lib/security/rateLimit";
import { getAddressProvider } from "@/lib/address/getAddressProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function countries(value: unknown): string[] {
  if (value === undefined) return ["ES"];
  if (!Array.isArray(value) || value.length > 15) throw badRequest("Países no válidos");
  const normalized = value.map(item => String(item).trim().toUpperCase());
  if (normalized.some(item => !/^[A-Z]{2}$/.test(item))) throw badRequest("Países no válidos");
  return Array.from(new Set(normalized));
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const origin = new URL(req.url).origin;
    if (req.headers.get("origin") !== origin || req.headers.get("sec-fetch-site") === "cross-site") throw forbidden("Origen de solicitud no válido");
    const ctx = await requireUser();
    await enforceRateLimit({ key: `address:${ctx.user.id}:${getClientIp(req)}`, limit: 60, windowMs: 60_000 });
    if (!req.headers.get("content-type")?.startsWith("application/json")) throw badRequest();
    const raw = await req.text();
    if (raw.length > 2048) throw badRequest("Solicitud demasiado grande");
    let input: any;
    try { input = JSON.parse(raw); } catch { throw badRequest("JSON no válido"); }
    const provider = getAddressProvider();
    const sessionId = input?.sessionId === undefined ? undefined : typeof input.sessionId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(input.sessionId) ? input.sessionId : (() => { throw badRequest("Sesión de búsqueda no válida"); })();
    if (input?.action === "search") {
      const query = typeof input.query === "string" ? input.query.trim() : "";
      if (query.length < 3 || query.length > 200) throw badRequest("Búsqueda no válida");
      console.info("address.search", { provider: provider.name });
      return NextResponse.json({ suggestions: await provider.search(query, { countries: countries(input.countries), sessionId, signal: req.signal }) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (input?.action === "resolve") {
      const id = typeof input.id === "string" ? input.id.trim() : "";
      if (!id || id.length > 500 || /[\u0000-\u001f]/.test(id)) throw badRequest("Identificador no válido");
      console.info("address.resolve", { provider: provider.name });
      return NextResponse.json({ address: await provider.resolve(id, { saveCoordinates: input.saveCoordinates !== false, sessionId, signal: req.signal }) }, { headers: { "Cache-Control": "no-store" } });
    }
    throw badRequest("Acción no válida");
  } catch (error) { return handleApiError(error, requestId, { route: "/api/address", method: "POST" }); }
}

