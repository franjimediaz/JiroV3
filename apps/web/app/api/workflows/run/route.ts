import { NextRequest, NextResponse } from "next/server";
import { runWorkflow } from "@/lib/workflows/runWorkflow";
import { WORKFLOW_KEYS } from "@/lib/workflows";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleApiError } from "@/lib/auth/handleApiError";
import { badRequest, conflict } from "@/lib/auth/apiError";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { getClientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { getRequestId } from "@/lib/security/requestId";
import { parseRunWorkflowBody } from "@/lib/validation/workflows";

export const runtime = "nodejs";

const idempotencyResults = new Map<string, { resetAt: number; response: Record<string, unknown> }>();

function isKnownWorkflow(workflowKey: string) {
  return Object.values(WORKFLOW_KEYS).includes(workflowKey as (typeof WORKFLOW_KEYS)[keyof typeof WORKFLOW_KEYS]);
}

function getIdempotencyKey(req: Request) {
  const value = req.headers.get("Idempotency-Key")?.trim();
  if (!value) return null;
  if (!/^[a-zA-Z0-9._:-]{8,120}$/.test(value)) throw badRequest("Idempotency-Key invalida");
  return value;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  let actorId: string | null = null;

  try {
    const ip = getClientIp(req);
    await enforceRateLimit({ key: `workflow:${ip}`, limit: 60, windowMs: 60_000 });

    const body = parseRunWorkflowBody(await req.json().catch(() => null));
    if (!isKnownWorkflow(body.workflowKey)) throw badRequest("workflowKey no soportado");

    const ctx = await requirePermission("workflows.run");
    actorId = ctx.user.id;
    await requirePermission(`workflows.${body.workflowKey}`);
    await enforceRateLimit({ key: `workflow:${ctx.user.id}`, limit: 30, windowMs: 60_000 });

    const idempotencyKey = getIdempotencyKey(req);
    const idempotencyStoreKey = idempotencyKey ? `${ctx.user.id}:${body.workflowKey}:${idempotencyKey}` : null;
    const existing = idempotencyStoreKey ? idempotencyResults.get(idempotencyStoreKey) : null;
    if (existing && existing.resetAt > Date.now()) {
      return NextResponse.json({ ...existing.response, requestId, idempotent: true });
    }
    if (existing) idempotencyResults.delete(idempotencyStoreKey || "");

    if (!idempotencyKey && process.env.REQUIRE_WORKFLOW_IDEMPOTENCY_KEY === "1") {
      throw conflict("Idempotency-Key requerida");
    }

    const out = await runWorkflow({ workflowKey: body.workflowKey, context: body.context, input: body.input });
    const response = { ok: true, ...out };

    if (idempotencyStoreKey) {
      idempotencyResults.set(idempotencyStoreKey, { resetAt: Date.now() + 10 * 60_000, response });
    }

    await writeAuditEvent({
      actorUserId: ctx.user.id,
      action: "workflows.run",
      resourceType: "workflow",
      resourceId: body.workflowKey,
      requestId,
      success: true,
      metadata: { recordId: body.context.recordId, idempotency: Boolean(idempotencyKey) },
    });

    return NextResponse.json({ ...response, requestId });
  } catch (error) {
    await writeAuditEvent({
      actorUserId: actorId,
      action: "workflows.run",
      requestId,
      success: false,
      metadata: { reason: error instanceof Error ? error.message : "unknown" },
    });
    return handleApiError(error, requestId, { route: "/api/workflows/run", method: "POST", actorId });
  }
}
