import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { configuredPermission, requirePermission } from "@/lib/auth/requirePermission";
import { handleApiError } from "@/lib/auth/handleApiError";
import { badRequest, forbidden } from "@/lib/auth/apiError";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { getClientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { getRequestId } from "@/lib/security/requestId";
import { isPathInUserScope } from "@/lib/security/safeStoragePath";
import { parseSignedUrlBody } from "@/lib/validation/pdf";

export const runtime = "nodejs";

function privateBucket() {
  return process.env.NEXT_PUBLIC_SUPABASE_PRIVATE_BUCKET || "crm-private";
}

function publicBucket() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET || "crm-public";
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  let actorId: string | null = null;

  try {
    const ip = getClientIp(req);
    await enforceRateLimit({ key: `signed-url:${ip}`, limit: 60, windowMs: 60_000 });

    const ctx = await requirePermission(configuredPermission("FILES_READ_PERMISSION", "files.read"));
    actorId = ctx.user.id;
    await enforceRateLimit({ key: `signed-url:${ctx.user.id}`, limit: 40, windowMs: 60_000 });

    const body = parseSignedUrlBody(await req.json().catch(() => null));
    if (body.bucket === publicBucket()) throw badRequest("No se generan signed URLs para buckets publicos");
    if (body.bucket !== privateBucket()) throw badRequest("bucket no permitido");
    if (body.path.includes("..") || body.path.startsWith("/") || !isPathInUserScope(body.path, ctx.user.id)) {
      throw forbidden("No tienes permiso para acceder a este archivo");
    }

    const { data, error } = await supabaseAdmin.storage.from(body.bucket).createSignedUrl(body.path, body.expiresIn);
    if (error || !data?.signedUrl) throw new Error("Signed URL generation failed");

    await writeAuditEvent({
      actorUserId: ctx.user.id,
      action: "file.signed_url",
      resourceType: "storage.objects",
      resourceId: body.path,
      requestId,
      success: true,
      metadata: { bucket: body.bucket, expiresIn: body.expiresIn },
    });

    return NextResponse.json({ ok: true, signedUrl: data.signedUrl, expiresIn: body.expiresIn, requestId });
  } catch (error) {
    await writeAuditEvent({
      actorUserId: actorId,
      action: "file.signed_url",
      requestId,
      success: false,
      metadata: { reason: error instanceof Error ? error.message : "unknown" },
    });
    return handleApiError(error, requestId, { route: "/api/upload-url", method: "POST", actorId });
  }
}
