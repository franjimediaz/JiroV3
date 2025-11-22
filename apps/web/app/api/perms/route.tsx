import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Este GET *no cambia* ↓
export async function GET() {
  const supabase = await createClient();

  // 1) Usuario actual según Supabase Auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "No hay sesión activa" },
      { status: 401 }
    );
  }

  // 2) Leer TU TABLA PUBLICA users
  const { data: userDb, error: userDbError } = await supabase
    .from("users")             // 👈 tu tabla pública
    .select("role")            // 👈 campo role definido por ti
    .eq("uid", user.id)         // 👈 importante: coincide con auth.users.id
    .maybeSingle();

  if (userDbError) {
    console.error("Error leyendo public.users:", userDbError);
  }

  // 3) Rol final del usuario, prioridad a tu tabla
  const role =
    userDb?.role ||                            // 👈 tu tabla OWNERSHIP
    (user.app_metadata as any)?.role ||        // fallback
    (user.user_metadata as any)?.role ||       // fallback
    "user";                                    // default

  // 4) Permisos (de momento modo dios para seguir desarrollando)
  const permisos = [{ modulo: "*", accion: "*" }];

  return NextResponse.json(
    {
      userId: user.id,
      role,
      permisos,
    },
    { status: 200 }
  );
}
