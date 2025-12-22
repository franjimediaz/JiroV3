import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const email = (body?.email || "").trim();
    const password = body?.password || "";
    const name = body?.name ?? null;

    const roleId = body?.role_id; // 👈 viene del form

    if (!email || !password) {
      return NextResponse.json({ ok: false, detail: "email y password son obligatorios" }, { status: 400 });
    }
    if (!roleId) {
      return NextResponse.json({ ok: false, detail: "role_id es obligatorio" }, { status: 400 });
    }

    // 1) Resolver role (string) a partir de role_id
    // AJUSTA nombres de tabla/campos si no son exactamente así
    const { data: roleRow, error: er } = await supabaseAdmin
      .from("rol")
      .select("slug")
      .eq("id", roleId)
      .maybeSingle();

    if (er || !roleRow?.slug) {
      return NextResponse.json(
        { ok: false, detail: "role_id inválido o no encontrado en roles" },
        { status: 400 }
      );
    }

    const roleSlug = roleRow.slug; // p.ej. "operario"

    // 2) Crear usuario en auth
    const { data: created, error: e1 } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: { role: roleSlug }, // opcional
    });

    if (e1 || !created?.user?.id) {
      return NextResponse.json({ ok: false, detail: e1?.message || "Error creando usuario en auth" }, { status: 400 });
    }

    const uid = created.user.id;

    // 3) Insertar en public.users cumpliendo constraint role_check
    const { error: e2 } = await supabaseAdmin.from("users").insert({
      uid,
      email,
      name,
      role_id: roleId,
      role: roleSlug, // 👈 CLAVE para que pase users_role_check
    });

    if (e2) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      return NextResponse.json({ ok: false, detail: `Falló public.users: ${e2.message}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, uid });
  } catch (err: any) {
    return NextResponse.json({ ok: false, detail: err?.message || "Error inesperado" }, { status: 500 });
  }
}
