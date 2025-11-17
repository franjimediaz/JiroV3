import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ModuleSchema } from "@repo/types";
import {Form} from "@repo/ui"; // ⬅️ tu componente Form.tsx

export const dynamic = "force-dynamic";

// ---------------------------
// 1. Schema del módulo customer desde Supabase
//    Tabla de ejemplo: "modulos", columna "props" (jsonb) y "slug"
// ---------------------------
async function fetchCustomerSchema(): Promise<ModuleSchema> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("modulos")
    .select("props")
    .eq("slug", "clientes") // 👈 aquí usas el slug que hayas definido para el módulo
    .maybeSingle();

  if (error) {
    console.error("Error cargando schema de customers:", error);
    throw new Error("No se pudo cargar el schema de customers");
  }

  if (!data) {
    throw new Error("Módulo 'clientes' no encontrado en modulos");
  }

  // props puede venir ya como objeto (jsonb) o como string
  const raw = (data as any).props;
  const schema = typeof raw === "string" ? (JSON.parse(raw) as ModuleSchema) : (raw as ModuleSchema);

  return schema;
}

// ---------------------------
// 2. Fetch del registro customer desde Supabase
//    Tabla: "customer" (o la que tengas)
// ---------------------------
async function fetchCustomer(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")          // 👈 nombre real de tu tabla
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Error cargando customer:", error);
    throw new Error("No se pudo cargar el customer");
  }

  if (!data) return null;

  // Si quieres añadir meta.overrides por defecto:
  return {
    ...data,
    meta: (data as any).meta || { overrides: {} },
  };
}

// ---------------------------
// 3. Page que usa Form directamente
// ---------------------------
export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<Record<string, string>> | Record<string, string>;
}) {
  // Soporta tu caso de params/searchParams como Promise
  const p =
    params && typeof (params as any).then === "function"
      ? await (params as any)
      : (params as any);
  const sp =
    searchParams && typeof (searchParams as any).then === "function"
      ? await (searchParams as any)
      : (searchParams ?? {});

  const id = p?.id;
  if (!id) notFound();

  const [schema, customer] = await Promise.all([
    fetchCustomerSchema(),
    fetchCustomer(id),
  ]);

  if (!customer) {
    notFound();
  }

  const isEdit = sp?.edit === "true";

  const buildHref = (nextEdit: boolean) => {
    const qs = new URLSearchParams(sp || {});
    if (nextEdit) qs.set("edit", "true");
    else qs.delete("edit");
    const query = qs.toString();
    return query ? `/customers/${id}?${query}` : `/customers/${id}`;
  };

  return (
    <main style={{ padding: 24 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Cliente: {customer.name ?? id}</h1>
          <p style={{ margin: 0, opacity: 0.7 }}>ID: {id}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/customers" style={{ textDecoration: "underline" }}>
            ← Volver
          </a>
          {isEdit ? (
            <a href={buildHref(false)} style={{ textDecoration: "underline" }}>
              Ver
            </a>
          ) : (
            <a href={buildHref(true)} style={{ textDecoration: "underline" }}>
              Editar
            </a>
          )}
        </div>
      </header>

      <Form
        schema={schema}
        initialData={customer}
        readOnly={!isEdit}
        // si tu Form admite onChange, puedes engancharlo luego para guardar
        // onChange={(vals) => console.log("vals", vals)}
      />
    </main>
  );
}