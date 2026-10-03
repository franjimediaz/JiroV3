import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/getCurrentUser";
import { badRequest, forbidden } from "@/lib/auth/apiError";
import { handleApiError } from "@/lib/auth/handleApiError";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { getProfile, updateProfile } from "@/lib/profile/server";
import { parseProfileInput } from "@/lib/profile/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown) => NextResponse.json(value, { headers: { "Cache-Control": "no-store" } });
export async function GET() {
  try {
    const ctx = await requireUser();
    return json(await getProfile(ctx.user.id));
  } catch (error) { return handleApiError(error, crypto.randomUUID(), { route: "/api/profile", method: "GET" }); }
}
export async function POST(req: Request) {
  try {
    const origin = new URL(req.url).origin;
    if (req.headers.get("origin") !== origin || req.headers.get("sec-fetch-site") === "cross-site") throw forbidden("Origen de solicitud no válido");
    const ctx = await requireUser();
    await enforceRateLimit({ key: `profile:${ctx.user.id}`, limit: 12, windowMs: 60_000 });
    if (!req.headers.get("content-type")?.startsWith("application/json")) throw badRequest();
    const raw = await req.text();
    if (raw.length > 4096) throw badRequest("Solicitud demasiado grande");
    let input: unknown;
    try { input = JSON.parse(raw); } catch { throw badRequest("JSON no válido"); }
    return json(await updateProfile(ctx, parseProfileInput(input), origin));
  } catch (error) { return handleApiError(error, crypto.randomUUID(), { route: "/api/profile", method: "POST" }); }
}
