import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getCurrentUser();
  if (!ctx)
    return NextResponse.json(
      { error: "No hay sesión activa" },
      { status: 401 },
    );
  return NextResponse.json(
    {
      userId: ctx.user.id,
      roleId: ctx.role?.id ?? null,
      roleSlug: ctx.role?.slug ?? null,
      permisos: ctx.permissions ?? [],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
