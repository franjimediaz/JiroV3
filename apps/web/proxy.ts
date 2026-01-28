// app/proxy.ts (o src/proxy.ts según tu estructura)
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Rutas públicas (no requieren sesión)
const PUBLIC_PATHS = ["/login", "/register", "/reset-password", "/403"];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;

  // Assets y cosas que nunca queremos proteger
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname.startsWith("/public")) return true;
  if (pathname.startsWith("/login_background.png")) return true;

  return false;
}

export default async function proxy(request: NextRequest) {
  // Response base que usaremos para propagar las cookies actualizadas
  let res = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // 👈 aquí usamos NextRequest, que SÍ tiene cookies
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { nextUrl } = request;
  const pathname = nextUrl.pathname;

  // Si no hay sesión y la ruta NO es pública → mandamos a /login
  if (!session && !isPublicPath(pathname)) {
    const redirectUrl = nextUrl.clone();
    redirectUrl.pathname = "/login";

    // opcional: recuerdas a dónde quería ir el usuario
    redirectUrl.searchParams.set("redirectTo", pathname + nextUrl.search);

    return NextResponse.redirect(redirectUrl);
  }

  // Si hay sesión o la ruta es pública → dejamos pasar
  return res;
}

// Qué rutas pasan por el proxy
export const config = {
  matcher: [
    
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
