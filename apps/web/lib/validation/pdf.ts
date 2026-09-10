import { boundedNumber, requiredString } from "./common";
import { badRequest } from "@/lib/auth/apiError";

export function parseSignedUrlBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("JSON invalido");
  }
  const body = value as Record<string, unknown>;
  return {
    bucket: requiredString(body.bucket, "bucket", 120),
    path: requiredString(body.path, "path", 500),
    expiresIn: boundedNumber(body.expiresIn, "expiresIn", 30, 300, 60),
  };
}
