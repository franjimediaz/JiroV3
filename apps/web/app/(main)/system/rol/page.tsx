// app/Rol/page.tsx   (server)
import PageClient from "./PageClient";
import { fetchModuloBySlug } from "@/lib/modulos/modulos";
import { createClient } from "@/lib/supabase/server";

export default async function RolPage() {
  const supabase = await createClient();

  const { data: Rol } = await supabase
    .from("rol")
    .select("*");

  const modulo = await fetchModuloBySlug("rol");

  return (
    <PageClient
      Rol={Rol ?? []}
      schema={modulo.props} // <- esto es tu ModuleSchema real
    />
  );
}
