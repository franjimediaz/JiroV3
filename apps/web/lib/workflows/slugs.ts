
import { createClient } from "@/lib/supabase/server";

export async function resolveDbTableFromSlug(slug: string): Promise<string> {
  const s = (slug || "").trim();
  if (!s) throw new Error("Slug vacío");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modulos")
    .select("props")
    .eq("slug", s)
    .maybeSingle();

  if (error) throw new Error(`Error resolviendo slug=${s}: ${error.message}`);
  if (!data) throw new Error(`No existe módulo slug=${s}`);

  const props = typeof data.props === "string" ? JSON.parse(data.props) : (data.props || {});
  const table = props?.db?.table;

  if (!table || typeof table !== "string") {
    throw new Error(`El módulo slug=${s} no tiene props.db.table`);
  }
  return table;
}
