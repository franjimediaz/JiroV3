// lib/workflows/workflows/derive.createFromParent.ts
import { createClient } from "@/lib/supabase/server";
import { resolveDbTableFromSlug } from "./slugs";
import { normalizeDeriveInput, applyMapAndDefaults, normalizeChildren, rowMatchesFilters } from "./deriveHelpers";
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

async function applyBulkUpdate({
  from,
  table,
  ids,
  patch,
}: {
  from: (table: string) => any;
  table: string;
  ids: string[];
  patch?: Record<string, any>;
}) {
  const cleanIds = Array.from(new Set((ids || []).map((id) => String(id)).filter(Boolean)));
  const updatePatch = patch && typeof patch === "object" ? patch : {};

  if (!cleanIds.length || !Object.keys(updatePatch).length) {
    return 0;
  }

  const { error } = await from(table).update(updatePatch).in("id", cleanIds);
  if (error) throw new Error(error.message);
  return cleanIds.length;
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
    matched: number;
    created: number;
    updatedSource: number;
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

    const list = (srcChildren || []).filter((row: any) => rowMatchesFilters(row, chSpec.filters));
    if (!list.length) {
      childrenMeta.push({
        sourceTable: chSpec.sourceTable,
        targetTable: chSpec.targetTable,
        matched: 0,
        created: 0,
        updatedSource: 0,
      });
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

    const updatedSource = await applyBulkUpdate({
      from,
      table: sourceChildDb,
      ids: list.map((row: any) => row?.id).filter(Boolean),
      patch: chSpec.sourceUpdates,
    });

    childrenMeta.push({
      sourceTable: chSpec.sourceTable,
      targetTable: chSpec.targetTable,
      matched: list.length,
      created: rows.length,
      updatedSource,
    });
  }

  const updatedSourceParent = await applyBulkUpdate({
    from,
    table: sourceParentDb,
    ids: [String(parent.id)],
    patch: cfg.sourceUpdates?.parent,
  });

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
      sourceParent: { table: cfg.source.parentTable, id: parent.id, updated: updatedSourceParent > 0 },
      targetParent: { table: cfg.target.parentTable, id: createdParent.id },
      children: childrenMeta,
    },
  };
}
