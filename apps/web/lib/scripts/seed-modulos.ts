// scripts/seed-modulos.ts
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type SeedNode = {
  nombre: string;
  slug: string;
  tipo: "carpeta" | "tabla" | "subtabla" | "vista";
  orden?: number;
  activo?: boolean;
  props?: any;
  children?: SeedNode[];
};

// --- CONFIG ---
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!; // ¡Service role!
const TABLE = "modulos";
// ---------------

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// Utilidad: obtiene (o crea) un módulo por (parent_id, slug)
async function upsertModulo(
  node: SeedNode,
  parentId: string | null
): Promise<string> {
  // 1) Buscar si ya existe por (parent_id, slug)
  const { data: existing, error: findError } = await supabase
    .from(TABLE)
    .select("id")
    .eq("slug", node.slug)
    .is("parent_id", parentId) // usa .is para null
    .maybeSingle();

  if (findError) throw findError;

  const payload = {
    parent_id: parentId,
    nombre: node.nombre,
    slug: node.slug,
    tipo: node.tipo,
    orden: node.orden ?? 0,
    activo: node.activo ?? true,
    props: node.props ?? {},
  };

  // 2) Insert o Update
  if (!existing) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  } else {
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }
}

async function walk(nodes: SeedNode[], parentId: string | null) {
  for (const node of nodes) {
    // Insert/Update nodo actual
    const id = await upsertModulo(node, parentId);

    // Recurse children
    if (node.children?.length) {
      await walk(node.children, id);
    }
  }
}

async function main() {
  const file = path.resolve(process.cwd(), "seed.modulos.json");
  const raw = fs.readFileSync(file, "utf-8");
  const nodes: SeedNode[] = JSON.parse(raw);

  await walk(nodes, null);

  console.log("✅ Seed de módulos completado.");
}

main().catch((e) => {
  console.error("❌ Error en seed:", e);
  process.exit(1);
});
