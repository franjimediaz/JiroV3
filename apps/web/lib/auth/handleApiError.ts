import { NextResponse } from "next/server";
import { ApiError } from "./apiError";

const REDACT_PATTERNS = [
  /authorization/gi,
  /cookie/gi,
  /password/gi,
  /access_token/gi,
  /refresh_token/gi,
  /service_role/gi,
  /PDF_SERVICE_SECRET/g,
  /SUPABASE_SERVICE_ROLE/g,
];

export function redactForLog(value: unknown): unknown {
  if (typeof value === "string") {
    return REDACT_PATTERNS.reduce((out, pattern) => out.replace(pattern, "[REDACTED]"), value);
  }
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactForLog);

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (REDACT_PATTERNS.some((pattern) => key.match(pattern))) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = redactForLog(nested);
    }
  }
  return out;
}

export function handleApiError(error: unknown, requestId: string, context?: Record<string, unknown>) {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError("INTERNAL", 500, "Error interno");

  console.error("api_error", {
    requestId,
    status: apiError.status,
    code: apiError.code,
    context: redactForLog(context),
    error: redactForLog(error instanceof Error ? error.message : String(error)),
  });

  const headers = new Headers();
  if (apiError.retryAfter) headers.set("Retry-After", String(apiError.retryAfter));

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: apiError.code,
        message: apiError.safeMessage,
      },
      requestId,
    },
    { status: apiError.status, headers },
  );
}
