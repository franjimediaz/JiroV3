import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createCustomer, updateCustomer, deleteCustomer } from "../actions";

const inputStyle: React.CSSProperties = { width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 };
const btnPrimary: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd" };
const btnGhost: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid #eee" };

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ color: "#666", fontSize: 12 }}>{label}</div>
      <div>{value || "—"}</div>
    </div>
  );
}

export default async function CustomerRoute({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { edit?: string };
}) {
  const isNew = params.id === "new";
  const editMode = isNew || searchParams?.edit === "1";

  const supabase = await createClient();

  const customer = isNew
    ? null
    : (await supabase
        .from("customers")
        .select("id,name,email,phone,created_at")
        .eq("id", params.id)
        .single()
      ).data;

  if (!isNew && !customer) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Cliente</h1>
        <p style={{ color: "crimson" }}>No encontrado</p>
        <Link href="/customers" style={{ textDecoration: "underline" }}>Volver</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{isNew ? "Crear cliente" : "Cliente"}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {!isNew && !editMode && (
            <Link href={`/customers/${params.id}?edit=1`} style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8 }}>
              Editar
            </Link>
          )}
          <Link href="/customers" style={{ padding: "8px 12px", border: "1px solid #eee", borderRadius: 8 }}>
            Volver
          </Link>
        </div>
      </div>

      {/* VIEW */}
      {!editMode && customer && (
        <section style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <Field label="Nombre" value={customer.name} />
          <Field label="Email" value={customer.email} />
          <Field label="Teléfono" value={customer.phone} />

          <form
            action={async () => {
              "use server";
              await deleteCustomer(customer.id);
            }}
          >
            <button
              style={{ marginTop: 12, padding: "8px 12px", border: "1px solid #f2c4c4", borderRadius: 8, background: "#fdecec" }}
            >
              Eliminar
            </button>
          </form>
        </section>
      )}

      {/* EDIT / CREATE (mismo formulario) */}
      {editMode && (
        <form
          action={
            isNew
              ? (createCustomer as any) // submit directo al create
              : (async (formData: FormData) => {
                  "use server";
                  const res = await updateCustomer(params.id, formData);
                  if (!res.ok) throw new Error(res.error);
                }) as any
          }
          style={{ marginTop: 16, display: "grid", gap: 12 }}
        >
          <label>
            <div>Nombre *</div>
            <input
              name="name"
              defaultValue={customer?.name || ""}
              required
              placeholder="Nombre completo"
              style={inputStyle}
            />
          </label>
          <label>
            <div>Email</div>
            <input
              name="email"
              type="email"
              defaultValue={customer?.email || ""}
              placeholder="correo@dominio.com"
              style={inputStyle}
            />
          </label>
          <label>
            <div>Teléfono</div>
            <input
              name="phone"
              defaultValue={customer?.phone || ""}
              placeholder="+34 ..."
              style={inputStyle}
            />
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={btnPrimary}>{isNew ? "Crear" : "Guardar"}</button>
            <Link href={isNew ? "/customers" : `/customers/${params.id}`} style={btnGhost}>
              Cancelar
            </Link>
          </div>
        </form>
      )}
    </main>
  );
}
