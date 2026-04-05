import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";


type UploadKind = "file" | "image";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

function sanitizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");
    const kind = (formData.get("kind") as UploadKind | null) ?? "file";
    const folder = (formData.get("folder") as string | null) ?? "general";

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No se recibió ningún archivo válido" },
        { status: 400 }
      );
    }

    const isImage = kind === "image";

    if (isImage) {
      if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: "Formato de imagen no permitido" },
          { status: 400 }
        );
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        return NextResponse.json(
          { error: "La imagen supera el tamaño máximo permitido" },
          { status: 400 }
        );
      }
    } else {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: "El archivo supera el tamaño máximo permitido" },
          { status: 400 }
        );
      }
    }

    const bucket = isImage
      ? process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET || "crm-public"
      : process.env.NEXT_PUBLIC_SUPABASE_PRIVATE_BUCKET || "crm-private";

    const ext = file.name.includes(".")
      ? file.name.split(".").pop()
      : "";
    const safeName = sanitizeFileName(file.name.replace(/\.[^/.]+$/, ""));
    const finalName = ext
      ? `${Date.now()}-${randomUUID()}-${safeName}.${ext}`
      : `${Date.now()}-${randomUUID()}-${safeName}`;

    const path = `${folder}/${finalName}`;

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, fileBuffer, {
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      );
    }

    let url: string | null = null;

    if (isImage) {
      const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
      url = data.publicUrl;
    }

    return NextResponse.json({
      ok: true,
      bucket,
      path,
      url,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      kind,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error interno al subir archivo" },
      { status: 500 }
    );
  }
}
export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const bucket = body?.bucket;
    const path = body?.path;

    if (!bucket || !path) {
      return Response.json(
        { error: "bucket y path son obligatorios" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Error al eliminar archivo" },
      { status: 500 }
    );
  }
}