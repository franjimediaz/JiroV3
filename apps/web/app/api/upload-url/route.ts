import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const bucket = body?.bucket;
    const path = body?.path;
    const expiresIn = Number(body?.expiresIn || 60);

    if (!bucket || !path) {
      return NextResponse.json(
        { error: "bucket y path son obligatorios" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      signedUrl: data.signedUrl,
      expiresIn,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error al generar signed URL" },
      { status: 500 }
    );
  }
}