
import PageClient from "./PageClient";
import { fetchModuloBySlug } from "@/lib/modulos/modulos";
import { createClient } from "@/lib/supabase/server";

export default async function CustomersPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("users")
    .select("*");

  const modulo = await fetchModuloBySlug("users");

  return (
    <PageClient
      customers={customers ?? []}
      schema={modulo.props} // <- esto es tu ModuleSchema real
    />
  );
}
