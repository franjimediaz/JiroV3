
import {Form} from "@repo/ui";
import type { ModuleSchema } from "@repo/types";
import { createClient } from "@/lib/supabase/server";



async function fetchCustomerSchema(): Promise<ModuleSchema> {
      const supabase = await createClient();
    
      const { data, error } = await supabase
        .from("modulos")
        .select("props")
        .eq("slug", "py") // 👈 aquí usas el slug que hayas definido para el módulo
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


export default async function NewModuloPage() {
    
    const [schema] = await Promise.all([
    fetchCustomerSchema(),
    
  ]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1 style={{ margin: "12px 0 4px" }}>Nuevo py</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Define lo mínimo (nombre, slug, tipo) y luego ajusta los campos y props.
      </p>

      <Form schema={schema} mode="create" initialData={null}  />
    </div>
  );
}