import { randomUUID } from "node:crypto";

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]{1,80}$/;

export function sanitizePathSegment(value: string, fallback = "general") {
  const trimmed = value.trim();
  return SAFE_SEGMENT.test(trimmed) ? trimmed : fallback;
}

export function safeExtension(fileName: string) {
  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() || "" : "";
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "";
}

export function buildServerStoragePath(args: {
  userId: string;
  kind: string;
  fileName: string;
  moduleSlug?: string;
  recordId?: string;
}) {
  const ext = safeExtension(args.fileName);
  const segments = [
    sanitizePathSegment(args.userId),
    sanitizePathSegment(args.moduleSlug || args.kind),
    sanitizePathSegment(args.recordId || "general"),
    `${Date.now()}-${randomUUID()}${ext ? `.${ext}` : ""}`,
  ];
  return segments.join("/");
}

export function isPathInUserScope(path: string, userId: string) {
  return path.split("/").includes(userId);
}
