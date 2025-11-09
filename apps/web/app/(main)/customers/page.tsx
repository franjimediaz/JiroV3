import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Customer = {
  id: string;
  name: string | null;
  surname: string | null;
  email: string | null;
  phone: number | null;
  direction: string | null;
  dni: string | null;
  created_at: string | null;
};

export const dynamic = "force-dynamic"; // para ver cambios tras mutaciones

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = Array.isArray(sp.q) ? sp.q[0] : (sp.q ?? "");
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase
    .from("customers")
    .select("id,name,email,phone,created_at,direction,dni,surname")
    //.order("created_at", { ascending: false })
    .limit(50);

  if (q) {
    // Filtrado simple por nombre o email
    query = query.ilike("name", `%${q}%`) as any;
  }

  const { data, error } = await query;
    

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Clientes</h1>
        <p style={{ color: "crimson" }}>Error: {error.message}</p>
      </main>
    );
  }

  const customers = (data || []) as Customer[];

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <h1>Clientes</h1>
        <h2>{user?.email}</h2>
        <h2>{user?.aud}</h2>
        <Link href="/customers/new" style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8 }}>
          + Nuevo
        </Link>
      </div>

      <form style={{ marginTop: 16, marginBottom: 16 }}>
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre…"
          style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8, width: 280 }}
        />
        <button style={{ marginLeft: 8, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8 }}>
          Buscar
        </button>
      </form>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: 12 }}>Nombre</th>
              <th style={{ padding: 12 }}>Email</th>
              <th style={{ padding: 12 }}>Teléfono</th>
              <th style={{ padding: 12 }}></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                <td style={{ padding: 12 }}>{c.name}</td>
                <td style={{ padding: 12 }}>{c.email}</td>
                <td style={{ padding: 12 }}>{c.phone}</td>
                <td style={{ padding: 12 }}>
                  <Link href={`/customers/${c.id}`} style={{ textDecoration: "underline" }}>
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 16, color: "#888" }}>
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
