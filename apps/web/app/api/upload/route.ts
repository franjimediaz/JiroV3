import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { configuredPermission, requirePermission } from "@/lib/auth/requirePermission";
import { handleApiError } from "@/lib/auth/handleApiError";
import { badRequest, forbidden } from "@/lib/auth/apiError";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { getClientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { getRequestId } from "@/lib/security/requestId";
import { buildServerStoragePath, isPathInUserScope } from "@/lib/security/safeStoragePath";
import { FILE_POLICIES, parseUploadKind, validateFileAgainstPolicy } from "@/lib/validation/upload";
import { asRecord, requiredString } from "@/lib/validation/common";

export const runtime = "nodejs";

function permission(name: "create" | "delete") {
  return configuredPermission(`FILES_${name.toUpperCase()}_PERMISSION`, `files.${name}`);
}

function bucketForKind(kind: keyof typeof FILE_POLICIES) {
  const policy = FILE_POLICIES[kind];
  return process.env[policy.bucketEnv] || policy.fallbackBucket;
}

function allowedBuckets() {
  return new Set(Object.keys(FILE_POLICIES).map((kind) => bucketForKind(kind as keyof typeof FILE_POLICIES)));
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  let actorId: string | null = null;

  try {
    const ip = getClientIp(req);
    await enforceRateLimit({ key: `upload:${ip}`, limit: 30, windowMs: 60_000 });

    const ctx = await requirePermission(permission("create"));
    actorId = ctx.user.id;
    await enforceRateLimit({ key: `upload:${ctx.user.id}`, limit: 20, windowMs: 60_000 });

    const formData = await req.formData();
    const file = formData.get("file");
    const kind = parseUploadKind(formData.get("kind"));
    const moduleSlug = typeof formData.get("moduleSlug") === "string" ? String(formData.get("moduleSlug")) : undefined;
    const recordId = typeof formData.get("recordId") === "string" ? String(formData.get("recordId")) : undefined;

    if (formData.has("bucket") || formData.has("folder") || formData.has("allowedMimeTypes")) {
      throw badRequest("Parametros de storage no permitidos");
    }
    if (!(file instanceof File)) throw badRequest("No se recibio ningun archivo valido");

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = validateFileAgainstPolicy(file, buffer, kind);
    const bucket = bucketForKind(kind);
    const path = buildServerStoragePath({
      userId: ctx.user.id,
      kind,
      fileName: file.name,
      moduleSlug,
      recordId,
    });

    const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
    });

    if (uploadError) throw new Error("Storage upload failed");

    await writeAuditEvent({
      actorUserId: ctx.user.id,
      action: "file.upload",
      resourceType: "storage.objects",
      resourceId: path,
      requestId,
      success: true,
      metadata: { bucket, kind, size: file.size, mimeType },
    });

    return NextResponse.json({
      ok: true,
      bucket,
      path,
      name: file.name,
      size: file.size,
      mimeType,
      kind,
      isPublic: kind === "image",
      requestId,
    });
  } catch (error) {
    await writeAuditEvent({
      actorUserId: actorId,
      action: "file.upload",
      requestId,
      success: false,
      metadata: { reason: error instanceof Error ? error.message : "unknown" },
    });
    return handleApiError(error, requestId, { route: "/api/upload", method: "POST", actorId });
  }
}

export async function DELETE(req: Request) {
  const requestId = getRequestId(req);
  let actorId: string | null = null;

  try {
    const ip = getClientIp(req);
    await enforceRateLimit({ key: `delete-file:${ip}`, limit: 30, windowMs: 60_000 });

    const ctx = await requirePermission(permission("delete"));
    actorId = ctx.user.id;
    await enforceRateLimit({ key: `delete-file:${ctx.user.id}`, limit: 20, windowMs: 60_000 });

    const body = asRecord(await req.json().catch(() => null));
    const bucket = requiredString(body.bucket, "bucket", 120);
    const path = requiredString(body.path, "path", 500);

    if (!allowedBuckets().has(bucket)) throw badRequest("bucket no permitido");
    if (path.includes("..") || path.startsWith("/") || !isPathInUserScope(path, ctx.user.id)) {
      throw forbidden("No tienes permiso para eliminar este archivo");
    }

    const { error } = await supabaseAdmin.storage.from(bucket).remove([path]);
    if (error) throw new Error("Storage delete failed");

    await writeAuditEvent({
      actorUserId: ctx.user.id,
      action: "file.delete",
      resourceType: "storage.objects",
      resourceId: path,
      requestId,
      success: true,
      metadata: { bucket },
    });

    return NextResponse.json({ ok: true, requestId });
  } catch (error) {
    await writeAuditEvent({
      actorUserId: actorId,
      action: "file.delete",
      requestId,
      success: false,
      metadata: { reason: error instanceof Error ? error.message : "unknown" },
    });
    return handleApiError(error, requestId, { route: "/api/upload", method: "DELETE", actorId });
  }
}
