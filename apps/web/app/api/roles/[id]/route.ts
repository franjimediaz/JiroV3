import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PermisosPorModulo } from "@repo/types";

// Helper: sacar el id del pathname directamente
function getIdFromUrl(req: Request): string | null {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    // .../api/roles/[id] -> ["api", "roles", "<id>"]
    const last = segments[segments.length - 1];
    return last || null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const supabase = await createClient();

  const id = getIdFromUrl(req);
  console.log("🔎 GET /api/roles/[id] id from url =", id);

  if (!id) {
    return NextResponse.json(
      { ok: false, detail: "Falta id en la URL" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("rol")
    .select("id, title, slug, perms")
    .eq("id", id)
    .single();

  if (error) {
    console.error("❌ GET /api/roles/[id] supabase error", error);
    return NextResponse.json(
      {
        ok: false,
        detail: "Error al consultar Supabase",
        code: (error as any).code,
        message: error.message,
      },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { ok: false, detail: "Role no encontrado" },
      { status: 404 }
    );
  }

  const permisos: PermisosPorModulo = (data.perms as any) ?? {};

  return NextResponse.json({
    ok: true,
    data: {
      id: data.id,
      title: data.title,
      slug: data.slug,
      perms: permisos,
    },
  });
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  const id = getIdFromUrl(req);
  

  if (!id) {
    return NextResponse.json(
      { ok: false, detail: "Falta id en la URL" },
      { status: 400 }
    );
  }

  const { title, slug, perms } = body as {
    title: string;
    slug: string;
    perms: PermisosPorModulo;
  };

  const { data, error } = await supabase
    .from("rol")
    .update({
      title,
      slug,
      perms: perms,
    })
    .eq("id", id)
    .select("id, title, slug, perms")
    .single();

  if (error) {
    console.error("❌ PUT /api/roles/[id] supabase error", error);
    return NextResponse.json(
      {
        ok: false,
        detail: "Error actualizando role",
        code: (error as any).code,
        message: error.message,
      },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { ok: false, detail: "Role no encontrado tras actualizar" },
      { status: 404 }
    );
  }

  const permisosOut: PermisosPorModulo = (data.perms as any) ?? {};

  return NextResponse.json({
    ok: true,
    data: {
      id: data.id,
      title: data.title,
      slug: data.slug,
      perms: permisosOut,
    },
  });
}
