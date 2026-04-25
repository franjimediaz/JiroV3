
import PageClient from "./PageClient";
import { fetchModuloBySlug } from "@/lib/modules/modulos";
import { createClient } from "@/lib/supabase/server";

export default async function CustomersPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("pdf_templates")
    .select("*");

  const modulo = await fetchModuloBySlug("pdf_templates");

  return (
    <PageClient
      customers={customers ?? []}
      schema={modulo.props} // <- esto es tu ModuleSchema real
    />
  );
}
