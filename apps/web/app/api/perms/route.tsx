import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Accion = "ver" | "crear" | "actualizar" | "eliminar" |"exportar" |"importar" | "*" | string;

function parsePerms(perms: any): Array<{ modulo: string; accion: Accion }> {
  if (!perms) return [];

  // Supabase a veces devuelve jsonb como objeto; pero por si viniese string:
  let obj: any = perms;
  if (typeof perms === "string") {
    try {
      obj = JSON.parse(perms);
    } catch {
      return [];
    }
  }

  if (typeof obj !== "object" || Array.isArray(obj)) return [];

  const out: Array<{ modulo: string; accion: Accion }> = [];

  for (const [modulo, acciones] of Object.entries(obj)) {
    // ignora keys “basura” si existen (en tu CSV aparece "permisos": {})
    if (!modulo || modulo === "permisos") continue;

    // Soporte wildcard a nivel módulo:
    if (modulo === "*" && typeof acciones === "object" && acciones) {
      out.push({ modulo: "*", accion: "*" });
      continue;
    }

    if (!acciones || typeof acciones !== "object" || Array.isArray(acciones)) continue;

    for (const [accion, enabled] of Object.entries(acciones)) {
      if (enabled === true) {
        out.push({ modulo: String(modulo), accion: String(accion) });
      }
    }
  }

  return out;
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No hay sesión activa" }, { status: 401 });
  }

  // 1) role_id del usuario
  const { data: userDb, error: userDbError } = await supabase
    .from("users")
    .select("role_id")
    .eq("uid", user.id) // si tu PK es id=auth.uid -> cambia a .eq("id", user.id)
    .maybeSingle();

  if (userDbError || !userDb?.role_id) {
    return NextResponse.json(
      { userId: user.id, roleId: null, permisos: [] },
      { status: 200 }
    );
  }

  // 2) traer rol + perms
  const { data: rolDb, error: rolError } = await supabase
    .from("rol")
    .select("id, slug, perms")
    .eq("id", userDb.role_id)
    .maybeSingle();

  if (rolError || !rolDb) {
    return NextResponse.json(
      { userId: user.id, roleId: userDb.role_id, permisos: [] },
      { status: 200 }
    );
  }

  // 3) aplanar perms del rol a array {modulo, accion}
  const permisos = parsePerms(rolDb.perms);

  return NextResponse.json(
    { userId: user.id, roleId: rolDb.id, roleSlug: rolDb.slug, permisos },
    { status: 200 }
  );
}
