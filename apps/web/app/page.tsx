// apps/web/app/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

// Desactiva caché estática (útil con auth)
export const dynamic = "force-dynamic";
// o bien: export const revalidate = 0;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  // Si hay error “duro” al leer sesión (raro), trátalo como no logueado
  if (error || !session?.user) {
    redirect("/login");
  }

  const user = session.user;

  return (
    <main style={{ padding: 24 }}>
      <h1>Dashboard</h1>
      <p>Hola {user.email}</p>
      <p>{user.role}</p>
      <p>{JSON.stringify(user.user_metadata)}</p>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <Link href="/customers">
          <button style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Ir a Customers</button>
        </Link>
      </div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <Link href="/system/modulos">
          <button style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Ir a Módulos</button>
        </Link>
      </div>
      <form action="/auth/signout" method="post">
        <button>Salir</button>
      </form>
    </main>
  );
}
