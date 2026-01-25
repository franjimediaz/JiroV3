import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const res = NextResponse.redirect(
    new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
  );

  // Borra cookies típicas de Supabase (sb-*)
  for (const c of res.cookies.getAll()) {
    if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { maxAge: 0, path: "/" });
  }

  // Por si tu setup usa otros nombres (opcional)
  res.cookies.set("supabase-auth-token", "", { maxAge: 0, path: "/" });

  return res;
}
