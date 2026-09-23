import type { Field } from "@repo/types";

export type UploadedFileValue = {
  bucket: string;
  path: string;
  url: string | null;
  name: string;
  size?: number;
  mimeType?: string;
  kind?: "file" | "image";
  isPublic?: boolean;
};

export const MAX_IMAGE_SIZE_MB = 5;
export const MAX_FILE_SIZE_MB = 10;

export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const ALLOWED_FILE_MIME_TYPES = ["application/pdf", "text/plain"];

export function validateSelectedFile(
  file: File,
  _field: Pick<Field, "allowedMimeTypes">,
  kind: "file" | "image"
) {
  const allowedMimeTypes = kind === "image" ? ALLOWED_IMAGE_MIME_TYPES : ALLOWED_FILE_MIME_TYPES;

  if (!allowedMimeTypes.includes(file.type)) {
    return `Tipo de archivo no permitido: ${file.type || "desconocido"}`;
  }

  if (kind === "image" && file.size > MAX_IMAGE_SIZE_BYTES) {
    return `La imagen supera el maximo de ${MAX_IMAGE_SIZE_MB} MB.`;
  }

  if (kind === "file" && file.size > MAX_FILE_SIZE_BYTES) {
    return `El archivo supera el maximo de ${MAX_FILE_SIZE_MB} MB.`;
  }

  return null;
}

export function buildPublicSupabaseUrl(bucket: string, path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !bucket || !path) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export async function deleteStoredFile(fileValue?: UploadedFileValue | null, endpoint = "/api/upload") {
  if (!fileValue?.bucket || !fileValue?.path) return { ok: true };

  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucket: fileValue.bucket,
      path: fileValue.path,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || "No se pudo eliminar el archivo anterior");
  }

  return data;
}

export async function getSignedFileUrl(bucket: string, path: string, expiresIn = 60) {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucket,
      path,
      expiresIn,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "No se pudo obtener la URL firmada");
  }

  return data.signedUrl as string;
}

export function getAllowedTypesHint(_field: Pick<Field, "allowedMimeTypes">, isImage: boolean) {
  if (isImage) {
    return "Formatos: JPG, PNG, WEBP.";
  }

  return "Formatos: PDF, TXT.";
}

export function getAcceptValue(_field: Pick<Field, "allowedMimeTypes">, isImage: boolean) {
  if (isImage) {
    return ALLOWED_IMAGE_MIME_TYPES.join(",");
  }

  return ALLOWED_FILE_MIME_TYPES.join(",");
}

export async function uploadSingleFile(
  file: File,
  kind: "file" | "image",
  folder = "general",
  _allowedMimeTypes: string[] = [],
  endpoint = "/api/upload"
): Promise<UploadedFileValue> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);
  formData.append("folder", folder);

  const res = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text();

  let data: Record<string, unknown> | null = null;
  if (contentType.includes("application/json")) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    throw new Error(String(data?.error || rawText || "No se pudo subir el archivo"));
  }

  return {
    bucket: String(data?.bucket || ""),
    path: String(data?.path || ""),
    url: typeof data?.url === "string" ? data.url : null,
    name: String(data?.name || file.name),
    size: typeof data?.size === "number" ? data.size : file.size,
    mimeType: typeof data?.mimeType === "string" ? data.mimeType : file.type,
    kind,
  };
}
