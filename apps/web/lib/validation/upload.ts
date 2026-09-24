import { badRequest } from "@/lib/auth/apiError";

export type UploadKind = "image" | "document";

export const FILE_POLICIES: Record<UploadKind, { bucketEnv: string; fallbackBucket: string; maxBytes: number; mimeTypes: string[] }> = {
  image: {
    bucketEnv: "NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET",
    fallbackBucket: "crm-public",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  document: {
    bucketEnv: "NEXT_PUBLIC_SUPABASE_PRIVATE_BUCKET",
    fallbackBucket: "crm-private",
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: ["application/pdf", "text/plain"],
  },
};

export function parseUploadKind(value: FormDataEntryValue | null): UploadKind {
  if (value == null || value === "file" || value === "document") return "document";
  if (value === "image") return "image";
  throw badRequest("kind invalido");
}

export function detectMimeFromMagicBytes(buffer: Buffer, declaredType: string): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (declaredType === "text/plain" && buffer.subarray(0, Math.min(buffer.length, 512)).every((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126))) return "text/plain";
  return null;
}

export function validateFileAgainstPolicy(file: File, buffer: Buffer, kind: UploadKind) {
  const policy = FILE_POLICIES[kind];
  if (file.size <= 0) throw badRequest("Archivo vacio");
  if (file.size > policy.maxBytes) throw badRequest("El archivo supera el tamano maximo permitido");

  const detectedMime = detectMimeFromMagicBytes(buffer, file.type);
  if (!detectedMime || !policy.mimeTypes.includes(detectedMime)) throw badRequest("Tipo de archivo no permitido");
  if (file.type && file.type !== detectedMime) throw badRequest("El MIME declarado no coincide con el contenido");

  return detectedMime;
}
