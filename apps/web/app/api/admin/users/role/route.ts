import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const { userId, roleId } = await req.json();

    if (!userId || !roleId) {
      return NextResponse.json(
        { error: "Faltan userId o roleId" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("users")
      .update({ role_id: roleId })
      .eq("id", userId);

    if (error) {
      console.error("Error actualizando role_id en users:", error);
      return NextResponse.json(
        { error: "No se pudo actualizar el rol del usuario" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("Error en /api/admin/users/role:", err);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
