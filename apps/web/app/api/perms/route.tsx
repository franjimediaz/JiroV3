import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ROLE_PERMS: Record<string, { modulo: string; accion: string }[]> = {
  systemadmin: [{ modulo: "*", accion: "*" }],
  admin: [
    { modulo: "customers", accion: "*" },
    { modulo: "users", accion: "ver" },
  ],
  user: [{ modulo: "customers", accion: "ver" }],
};

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "No hay sesión activa" }, { status: 401 });
  }

  // OJO: revisa tu columna real. Si tu tabla guarda uid, ok.
  // Si tu tabla usa id=uid, entonces usa .eq("id", user.id)
  const { data: userDb } = await supabase
    .from("users")
    .select("role_id")
    .eq("uid", user.id)
    .maybeSingle();

  const role =
    userDb?.role_id ||
    (user.app_metadata as any)?.role ||
    (user.user_metadata as any)?.role ||
    "user";

  const permisos = ROLE_PERMS[role] ?? ROLE_PERMS.user;

  return NextResponse.json({ userId: user.id, role, permisos }, { status: 200 });
}



