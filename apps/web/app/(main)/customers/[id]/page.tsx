import Link from "next/link";
import { notFound } from "next/navigation";
import type { ModuleSchema } from "@repo/types";
import CustomerFormClient from "./CustomerFormClient";

export const dynamic = "force-dynamic";

// ── STUBS: reemplaza por tus llamadas reales ─────────────────────────────
async function fetchModuloSchema(): Promise<ModuleSchema> {
  // Ejemplo: busca el módulo por slug "customers" en tu tabla modulos y parsea props
  // const modulo = await db.modulos.findUnique({ where: { slug: "customers" }});
  // return JSON.parse(modulo.props) as ModuleSchema;

  // Mínimo para probar:
  return {
    db: { table: "customer" },
    ui: { icon: "bi-person", color: "#2b2b2b" },
    fields: [
      { name: "id", label: "ID", type: "text", readOnly: true },
      { name: "name", label: "Nombre", type: "text", required: true, ui: { width: "1/2" } },
      { name: "email", label: "Email", type: "text", ui: { width: "1/2" } },
      { name: "phone", label: "Teléfono", type: "text", ui: { width: "1/3" } },
      { name: "createdAt", label: "Creado", type: "datetime", readOnly: true, ui: { width: "1/3" } },
      { name: "updatedAt", label: "Actualizado", type: "datetime", readOnly: true, ui: { width: "1/3" } },
      // ejemplo con formula (editable sólo si allowOverride)
      {
        name: "score",
        label: "Score",
        type: "formula",
        allowOverride: true,
        compute: { type: "formula", expr: "(pedidos || 0) * 10", deps: ["pedidos"], persist: "none" },
      },
      { name: "pedidos", label: "Nº Pedidos", type: "number", defaultValue: 0, ui: { width: "1/3" } },
    ],
  };
}

async function fetchCustomer(id: string): Promise<any | null> {
  // Reemplaza por tu acceso (Supabase/Prisma/REST). Debe devolver un objeto plano.
  // const row = await prisma.customer.findUnique({ where: { id }});
  // return row ?? null;

  // Mock para probar UI:
  if (id === "demo") {
    return {
      id: "demo",
      name: "Cliente Demo",
      email: "demo@ejemplo.com",
      phone: "666 111 222",
      pedidos: 3,
      createdAt: "2025-10-01T09:15:00Z",
      updatedAt: "2025-11-01T18:22:00Z",
      meta: { overrides: {} },
    };
  }
  return null;
}
// ─────────────────────────────────────────────────────────────────────────

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;                  // 🔴 Importante: en tu setup vienen como Promise
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const isEdit = sp?.edit === "true";

  const [schema, customer] = await Promise.all([
    fetchModuloSchema(),
    fetchCustomer(id),
  ]);

  if (!customer) {
    notFound();
  }

  // Utilidad para togglear ?edit=true/false
  const editToggleHref = (next: boolean) => {
    const q = new URLSearchParams(sp || {});
    if (next) q.set("edit", "true");
    else q.delete("edit");
    return `/customers/${id}?${q.toString()}`;
  };

  return (
    <main style={{ padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Customer: {customer.name || id}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/customers">← Volver</Link>
          {isEdit ? (
            <Link href={editToggleHref(false)}>Ver</Link>
          ) : (
            <Link href={editToggleHref(true)}>Editar</Link>
          )}
        </div>
      </header>

      <CustomerFormClient
        schema={schema}
        initialData={customer}
        readOnly={!isEdit}
        id={id}
      />
    </main>
  );
}
