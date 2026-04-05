import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

type UploadKind = "file" | "image";

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
    console.log("content-type:", req.headers.get("content-type"));
    const formData = await req.formData();

    const file = formData.get("file");
    const kind = (formData.get("kind") as UploadKind | null) ?? "file";
    const folder = (formData.get("folder") as string | null) ?? "general";
     console.log({
      hasFile: file instanceof File,
      kind,
      folder,
    });

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No se recibió ningún archivo válido" },
        { status: 400 }
      );
    }

    const isImage = kind === "image";

    if (isImage && !file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "El archivo debe ser una imagen" },
        { status: 400 }
      );
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
    console.log({
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      publicBucket: process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET,
      privateBucket: process.env.NEXT_PUBLIC_SUPABASE_PRIVATE_BUCKET,
    });

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
    console.error("UPLOAD ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno al subir archivo" },
      { status: 500 }
      
    );
  }
}