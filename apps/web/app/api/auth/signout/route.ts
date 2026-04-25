import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // 303 = POST -> GET (lo que quieres para ir a /login)
  const url = new URL("/login", req.url);
  const res = NextResponse.redirect(url, { status: 303 });

  // Borra cookies típicas (ajusta nombres si los tuyos difieren)
  res.cookies.set("sb-access-token", "", { maxAge: 0, path: "/" });
  res.cookies.set("sb-refresh-token", "", { maxAge: 0, path: "/" });

  return res;
}
