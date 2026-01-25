// lib/workflows/workflows/derive.createFromParent.ts
import { createClient } from "@/lib/supabase/server";
import { resolveDbTableFromSlug } from "./slugs";
import { normalizeDeriveInput, applyMapAndDefaults } from "./deriveHelpers";
import type { WorkflowContext } from "./runWorkflow";

function isProbablyDbTable(x: string) {
  // heurística simple: "schema.table" o "table" (sin espacios)
  return !!x && !x.includes("/") && !x.includes(" ") && !x.includes("-");
}

async function resolveTable(tableOrSlug: string) {
  const t = (tableOrSlug || "").trim();
  if (!t) throw new Error("Tabla vacía en derive input");
  // Si ya parece db.table o table, lo dejamos
  if (isProbablyDbTable(t)) return t;
  // Si no, tratamos como slug
  return resolveDbTableFromSlug(t);
}

// muy simple: reemplaza {{id}} por el recordId actual.
// Si luego quieres más templates, lo amplías.
function applyTemplate(tpl: string, ctx: { id: string }) {
  return String(tpl || "").replaceAll("{{id}}", ctx.id);
}

// Normaliza children: si vienen legacy source/target children, los convierte en children[0]
function normalizeChildren(cfg: any) {
  const arr = Array.isArray(cfg.children) ? cfg.children : [];

  if (arr.length > 0) return arr;

  const sc = cfg?.source?.children?.table;
  const tc = cfg?.target?.children?.table;
  if (!sc || !tc) return [];

  return [
    {
      sourceTable: sc,
      sourceFkToParent: cfg?.source?.children?.fkToParent,
      targetTable: tc,
      targetFkToParent: cfg?.target?.children?.fkToParent,
      map: cfg?.maps?.child,
      defaults: cfg?.defaults?.child,
    },
  ];
}

export async function deriveCreateFromParent({
  context,
  input,
}: {
  context: WorkflowContext;
  input?: any;
}) {
  const cfg = normalizeDeriveInput(input);
  const supabase = await createClient();
  const from = (table: string) => (supabase as any).from(table) as any;

  // 0) Resolver tablas (slug o db.table) para padre
  const sourceParentDb = await resolveTable(cfg.source.parentTable);
  const targetParentDb = await resolveTable(cfg.target.parentTable);

  // 1) Leer padre origen
  const sourceId = context.recordId; // hoy viene de runWorkflow
  const { data: parent, error: eParent } = await from(sourceParentDb)
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();

  if (eParent) throw new Error(eParent.message);
  if (!parent) {
    throw new Error(`Origen no encontrado (${cfg.source.parentTable}) id=${sourceId}`);
  }

  // 2) Construir payload padre destino (map + defaults)
  const parentData = applyMapAndDefaults({
    sourceRow: parent,
    map: cfg.maps?.parent,
    defaults: cfg.defaults?.parent,
  });

  // 2.1) Idempotencia opcional: busca si ya existe el destino
  // Recomendación: crea un índice unique en targetParentDb.(targetField)
  // y guarda ahí un valor determinista (ej: "{{id}}").
  let existingParent: any = null;
  let idempotencyMeta: any = null;

  if (cfg.idempotency?.targetField && cfg.idempotency?.valueTemplate) {
    const targetField = String(cfg.idempotency.targetField);
    const idempoValue = applyTemplate(String(cfg.idempotency.valueTemplate), { id: String(sourceId) });

    // inyecta campo en insert
    (parentData as any)[targetField] = idempoValue;

    // intenta encontrar existente
    const { data: already, error: eAlready } = await from(targetParentDb)
      .select("*")
      .eq(targetField, idempoValue)
      .maybeSingle();

    if (eAlready) throw new Error(eAlready.message);

    if (already) {
      existingParent = already;
      idempotencyMeta = { reused: true, targetField, value: idempoValue };
    } else {
      idempotencyMeta = { reused: false, targetField, value: idempoValue };
    }
  }

  // 3) Crear (o reutilizar) padre destino
  let createdParent = existingParent;

  if (!createdParent) {
    const { data: inserted, error: eCreateParent } = await from(targetParentDb)
      .insert(parentData)
      .select("*")
      .single();

    if (eCreateParent) throw new Error(eCreateParent.message);
    createdParent = inserted;
  }

  // 4) Derivaciones de hijos (multi)
  const childrenCfg = normalizeChildren(cfg);

  // leer y crear cada “grupo de hijos”
  const childrenMeta: Array<{
    sourceTable: string;
    targetTable: string;
    created: number;
  }> = [];

  for (const chSpec of childrenCfg) {
    if (!chSpec?.sourceTable || !chSpec?.targetTable) continue;

    const sourceChildDb = await resolveTable(chSpec.sourceTable);
    const targetChildDb = await resolveTable(chSpec.targetTable);

    const sourceFk = String(chSpec.sourceFkToParent || "").trim();
    const targetFk = String(chSpec.targetFkToParent || "").trim();

    if (!sourceFk) {
      throw new Error(
        `sourceFkToParent requerido para children[].sourceTable=${chSpec.sourceTable}`
      );
    }
    if (!targetFk) {
      throw new Error(
        `targetFkToParent requerido para children[].targetTable=${chSpec.targetTable}`
      );
    }

    // 4.1) Leer hijos origen
    const { data: srcChildren, error: eReadChildren } = await from(sourceChildDb)
      .select("*")
      .eq(sourceFk, parent.id);

    if (eReadChildren) throw new Error(eReadChildren.message);

    const list = srcChildren || [];
    if (!list.length) {
      childrenMeta.push({ sourceTable: chSpec.sourceTable, targetTable: chSpec.targetTable, created: 0 });
      continue;
    }

    // 4.2) Mapear + defaults + set FK al padre destino
    const rows = list.map((row: any) => {
      const base = applyMapAndDefaults({
        sourceRow: row,
        map: chSpec.map,
        defaults: chSpec.defaults,
      });

      base[targetFk] = createdParent.id;
      return base;
    });

    // 4.3) Insert (en lote)
    const { error: eInsert } = await from(targetChildDb).insert(rows);
    if (eInsert) throw new Error(eInsert.message);

    childrenMeta.push({
      sourceTable: chSpec.sourceTable,
      targetTable: chSpec.targetTable,
      created: rows.length,
    });
  }

  // 5) Return coherente
  return {
    result: {
      id: createdParent.id,
      targetParentSlug: cfg.target.parentTable, // conserva slug si venía slug
      parent: {
        id: createdParent.id,
        table: cfg.target.parentTable,
      },
    },
    meta: {
      idempotency: idempotencyMeta,
      sourceParent: { table: cfg.source.parentTable, id: parent.id },
      targetParent: { table: cfg.target.parentTable, id: createdParent.id },
      children: childrenMeta,
    },
  };
}
