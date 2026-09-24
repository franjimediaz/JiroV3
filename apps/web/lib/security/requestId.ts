import { randomUUID } from "node:crypto";

export function getRequestId(req?: Request) {
  const fromHeader = req?.headers.get("x-request-id")?.trim();
  return fromHeader && fromHeader.length <= 100 ? fromHeader : randomUUID();
}
