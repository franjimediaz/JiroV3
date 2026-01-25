// lib/workflows/workflows/budget.generateFromTasks.ts
import { createClient } from "@/lib/supabase/server";
import { resolveDbTableFromSlug } from "./slugs";
import { normalizeDeriveInput, applyMapAndDefaults } from "./deriveHelpers";
import type { WorkflowContext } from "./runWorkflow";

export async function budgetGenerateFromTasks({
  context,
  input,
}: {
  context: WorkflowContext;
  input?: any;
}) {
  const cfg = normalizeDeriveInput(input);

  const supabase = await createClient();

  // 1) Resolver slugs → db.table
  const sourceParentTable = await resolveDbTableFromSlug(cfg.source.parentTable);
  const targetParentTable = await resolveDbTableFromSlug(cfg.target.parentTable);

  const sourceChildTable = cfg.source.children?.table
    ? await resolveDbTableFromSlug(cfg.source.children.table)
    : null;

  const targetChildTable = cfg.target.children?.table
    ? await resolveDbTableFromSlug(cfg.target.children.table)
    : null;

  // 2) Leer padre origen
  const { data: parent, error: eParent } = await supabase
    .from(sourceParentTable)
    .select("*")
    .eq("id", context.recordId)
    .maybeSingle();

  if (eParent) throw new Error(eParent.message);
  if (!parent) throw new Error(`Origen no encontrado: ${cfg.source.parentTable} id=${context.recordId}`);

  // 3) Leer hijos origen (opcional)
  let sourceChildren: any[] = [];
  if (sourceChildTable) {
    const fk = cfg.source.children?.fkToParent;
    if (!fk) throw new Error("source.children.fkToParent requerido si hay source.children.table");
    const qb = (supabase as any).from(sourceChildTable) as any;
    const { data, error } = await qb
        .select("*")
        .eq(fk, parent.id);

    if (error) throw new Error(error.message);
    sourceChildren = data || [];
  }

  // 4) Crear padre destino
  const parentData = applyMapAndDefaults({
    sourceRow: parent,
    map: cfg.maps?.parent,
    defaults: cfg.defaults?.parent,
  });

  const { data: createdParent, error: eCreateParent } = await supabase
    .from(targetParentTable)
    .insert(parentData)
    .select("*")
    .single();

  if (eCreateParent) throw new Error(eCreateParent.message);

  // 5) Crear hijos destino (snapshot) (opcional)
  let createdChildren = 0;

  if (targetChildTable && sourceChildTable) {
    const targetFk = cfg.target.children?.fkToParent;
    if (!targetFk) throw new Error("target.children.fkToParent requerido si hay target.children.table");

    const rows = (sourceChildren || []).map((ch) => {
      const base = applyMapAndDefaults({
        sourceRow: ch,
        map: cfg.maps?.child,
        defaults: cfg.defaults?.child,
      });

      // FK al padre destino siempre lo seteamos aquí
      base[targetFk] = createdParent.id;

      return base;
    });

    if (rows.length) {
      const { error: eInsertChildren } = await supabase
        .from(targetChildTable)
        .insert(rows);

      if (eInsertChildren) throw new Error(eInsertChildren.message);
      createdChildren = rows.length;
    }
  }

  return {
    result: { id: createdParent.id, tableSlug: cfg.target.parentTable },
    meta: { createdChildren },
  };
}
