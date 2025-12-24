import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ModuleSchema } from "@repo/types";
import FormClient from "./FormClient";

export const dynamic = "force-dynamic";

const CFG = {
  moduleSlug: "customers",
  titleSingular: "Clientes",
  displayField: "name",
} as const;

async function fetchSchemaBySlug(slug: string): Promise<ModuleSchema> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("modulos")
    .select("props")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error(`Error cargando schema de ${slug}:`, error);
    throw new Error(`No se pudo cargar el schema de ${slug}`);
  }
  if (!data) throw new Error(`Módulo '${slug}' no encontrado en modulos`);

  const raw = (data as any).props;
  return typeof raw === "string"
    ? (JSON.parse(raw) as ModuleSchema)
    : (raw as ModuleSchema);
}

async function fetchRowById(table: string, primaryKey: string, id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq(primaryKey, id)
    .maybeSingle();

  if (error) {
    console.error(`Error cargando ${table}(${id}):`, {
      message: (error as any)?.message,
      code: (error as any)?.code,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
    });
    throw new Error(`No se pudo cargar el registro de ${table}`);
  }
  if (!data) return null;

  return {
    ...data,
    meta: (data as any).meta || { overrides: {} },
  };
}

async function resolveMaybePromise<T>(
  v: Promise<T> | T | undefined
): Promise<T | undefined> {
  if (!v) return undefined;
  return typeof (v as any).then === "function" ? await (v as any) : (v as any);
}

export default async function EntityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<Record<string, string>> | Record<string, string>;
}) {
  const p = await resolveMaybePromise(params);
  const sp = (await resolveMaybePromise(searchParams)) ?? {};

  const id = p?.id;
  if (!id) notFound();

  const isEdit = sp?.edit === "true";

  const schema = await fetchSchemaBySlug(CFG.moduleSlug);

  // ✅ tabla y PK salen del schema (no hardcode)
  const table = CFG.moduleSlug;
  const primaryKey = schema.db.primaryKey ?? "id";

  const row = await fetchRowById(table, primaryKey, id);
  if (!row) notFound();

  const display = (row as any)?.[CFG.displayField] ?? id;
console.log("FormClient props:", { schema, isEdit, table, primaryKey, id });
  return (
    <main className="container py-4 bg-secondary bg-opacity-10 rounded">
      <header className="d-flex align-items-center mb-4">
        <h1 className="me-auto">
          {CFG.titleSingular}: {String(display)}
        </h1>
      </header>
      
      <FormClient
        schema={schema}
        initialData={row}
        mode={isEdit ? "edit" : "view"}
        table={table}
        primaryKey={primaryKey}
        id={id}
      />
    </main>
  );
}
