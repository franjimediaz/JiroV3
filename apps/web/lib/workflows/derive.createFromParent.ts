// lib/workflows/workflows/derive.createFromParent.ts
import { createClient } from "@/lib/supabase/server";
import { resolveDbTableFromSlug } from "./slugs";
import { normalizeDeriveInput, applyMapAndDefaults } from "./deriveHelpers";
import type { WorkflowContext } from "./runWorkflow";

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

  // 1) slugs -> db.table
  const sourceParentDb = cfg.source.parentTable;
  const targetParentDb = cfg.target.parentTable;

  const sourceChildDb = cfg.source.children?.table
    ? await resolveDbTableFromSlug(cfg.source.children.table)
    : null;

  const targetChildDb = cfg.target.children?.table
    ? await resolveDbTableFromSlug(cfg.target.children.table)
    : null;

  // 2) leer padre origen
  const { data: parent, error: eParent } = await from(sourceParentDb)
    .select("*")
    .eq("id", context.recordId)
    .maybeSingle();

  if (eParent) throw new Error(eParent.message);
  if (!parent) throw new Error(`Origen no encontrado (${cfg.source.parentTable}) id=${context.recordId}`);

  // 3) leer hijos origen (opcional)
  let children: any[] = [];
  if (sourceChildDb) {
    const fk = cfg.source.children?.fkToParent;
    if (!fk) throw new Error("source.children.fkToParent requerido si hay source.children.table");

    const { data, error } = await from(sourceChildDb).select("*").eq(fk, parent.id);
    if (error) throw new Error(error.message);
    children = data || [];
  }

  // 4) crear padre destino
  const parentData = applyMapAndDefaults({
    sourceRow: parent,
    map: cfg.maps?.parent,
    defaults: cfg.defaults?.parent,
  });

  const { data: createdParent, error: eCreateParent } = await from(targetParentDb)
    .insert(parentData)
    .select("*")
    .single();

  if (eCreateParent) throw new Error(eCreateParent.message);

  // 5) crear hijos destino (snapshot) opcional
  let createdChildren = 0;

  if (sourceChildDb && targetChildDb) {
    const targetFk = cfg.target.children?.fkToParent;
    if (!targetFk) throw new Error("target.children.fkToParent requerido si hay target.children.table");

    const rows = (children || []).map((ch) => {
      const base = applyMapAndDefaults({
        sourceRow: ch,
        map: cfg.maps?.child,
        defaults: cfg.defaults?.child,
      });

      base[targetFk] = createdParent.id;
      return base;
    });

    if (rows.length) {
      const { error: eInsert } = await from(targetChildDb).insert(rows);
      if (eInsert) throw new Error(eInsert.message);
      createdChildren = rows.length;
    }
  }

  return {
    result: {
      id: createdParent.id,
      targetParentSlug: cfg.target.parentTable,
    },
    meta: {
      createdChildren,
      sourceParentSlug: cfg.source.parentTable,
      sourceChildSlug: cfg.source.children?.table || null,
      targetChildSlug: cfg.target.children?.table || null,
    },
  };
}
