// app/customers/page.tsx   (server)
import CustomersPageClient from "./PageClient";
import { fetchModuloBySlug } from "@/lib/modulos/modulos";
import { createClient } from "@/lib/supabase/server";

export default async function CustomersPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("py")
    .select("*");

  const modulo = await fetchModuloBySlug("py");

  return (
    <CustomersPageClient
      customers={customers ?? []}
      schema={modulo.props} // <- esto es tu ModuleSchema real
    />
  );
}
