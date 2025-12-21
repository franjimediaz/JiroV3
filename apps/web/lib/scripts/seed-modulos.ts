// scripts/seed-modulos.ts
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { SeedNode } from "@repo/types";

/* ----------------------------------
   CONFIG
---------------------------------- */
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!; // Service role
const TABLE = "modulos";
const SEED_FILE = "seed.modulos.json";
/* ---------------------------------- */

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

/* ----------------------------------
   Utils
---------------------------------- */

function parseJsonSafe(str: string) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function parseProps(props: any) {
  if (!props) return null;
  if (typeof props === "string") return parseJsonSafe(props);
  if (typeof props === "object") return props;
  return null;
}

function getChildren(node: any): SeedNode[] {
  return node.children ?? node.hijos ?? [];
}

/**
 * Acepta:
 * - SeedNode[]
 * - { MODULOS_SEED: SeedNode[] }
 * - { SYSTEM_SEED: SeedNode[], CLIENTES_SEED: SeedNode[], ... }
 */
function normalizeSeed(raw: any): SeedNode[] {
  if (Array.isArray(raw)) return raw;

  if (raw && typeof raw === "object" && Array.isArray(raw.MODULOS_SEED)) {
    return raw.MODULOS_SEED;
  }

  if (raw && typeof raw === "object") {
    const arrays = Object.values(raw).filter(Array.isArray) as SeedNode[][];
    if (arrays.length) return arrays.flat();
  }

  throw new Error(
    "Formato de seed no reconocido. Esperaba SeedNode[] o { MODULOS_SEED: SeedNode[] }"
  );
}

/**
 * Si el seed ya trae `props`, lo usa.
 * Si el seed viene “plano” (db/ui/fields/formSections), construye props como:
 * props = { db, fields, ui: { ...ui, formSections } }
 */
function buildPropsFromNode(node: any) {
  const propsFromSeed = parseProps(node.props);
  if (propsFromSeed) return propsFromSeed;

  const fields = Array.isArray(node.fields) ? node.fields : [];
  const formSectionsRaw = Array.isArray(node.formSections) ? node.formSections : [];

  // Limpieza: si formSections referencia fields inexistentes, los filtramos
  const fieldNames = new Set(fields.map((f: any) => f?.name).filter(Boolean));
  const safeFormSections = formSectionsRaw.map((s: any) => ({
    ...s,
    fields: Array.isArray(s?.fields)
      ? s.fields.filter((fname: string) => fieldNames.has(fname))
      : [],
  }));

  return {
    db: node.db ?? {},
    fields,
    ui: {
      ...(node.ui ?? {}),
      formSections: safeFormSections,
    },
  };
}

/* ----------------------------------
   DB ops
---------------------------------- */

// Inserta o actualiza un módulo por (parent_id, slug)
async function upsertModulo(node: SeedNode, parentId: string | null): Promise<string> {
  const n: any = node;

  // 1) Buscar si ya existe por (parent_id, slug)
  const { data: existing, error: findError } = await supabase
    .from(TABLE)
    .select("id")
    .eq("slug", n.slug)
    .is("parent_id", parentId)
    .maybeSingle();

  if (findError) throw findError;

  const payload: any = {
    parent_id: parentId,
    nombre: n.nombre,
    slug: n.slug,
    tipo: n.tipo,
    orden: n.orden ?? 0,
    activo: n.activo ?? true,

    // ✅ aquí está la clave: props correcto
    props: buildPropsFromNode(n),
  };

  // ✅ si el seed trae route, lo guardamos en columna route
  if (n.route) payload.route = n.route;

  // 2) Insert o Update
  if (!existing) {
    const { data, error } = await supabase.from(TABLE).insert(payload).select("id").single();
    if (error) {
      console.error("SUPABASE ERROR (insert):", error);
      console.error("PAYLOAD:", payload);
      throw error;
    }
    return data.id as string;
  } else {
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) {
      console.error("SUPABASE ERROR (update):", error);
      console.error("PAYLOAD:", payload);
      throw error;
    }
    return data.id as string;
  }
}

/* ----------------------------------
   Tree walk
---------------------------------- */

async function walk(nodes: SeedNode[], parentId: string | null) {
  for (const node of nodes) {
    const id = await upsertModulo(node, parentId);

    const children = getChildren(node);
    if (children.length) {
      await walk(children, id);
    }
  }
}

/* ----------------------------------
   Main
---------------------------------- */

async function main() {
  const filePath = path.resolve(process.cwd(), SEED_FILE);
  const rawText = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(rawText);

  const nodes = normalizeSeed(parsed);

  console.log(`🌱 Importando ${nodes.length} módulos raíz desde ${SEED_FILE}...`);
  await walk(nodes, null);
  console.log("✅ Seed de módulos completado correctamente.");
}

main().catch((err) => {
  console.error("❌ Error en seed:", err);
  process.exit(1);
});
