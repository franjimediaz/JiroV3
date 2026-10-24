import {
  fieldRefKey,
  normalizeFieldRef,
  type FieldRefLike,
} from "@repo/types";
import { createClient } from "@/lib/supabase/server";
import { buildFieldRefSelect } from "@/lib/fields/fieldRefQuery";
import { resolveFieldRefs } from "@/lib/fields/resolveFieldRef";
import {
  applyMapAndDefaults,
  normalizeChildren,
  normalizeDeriveInput,
  rowMatchesFilters,
  type DeriveChildSpec,
  type DeriveFilterCondition,
  type DeriveInput,
} from "./deriveHelpers";
import type { WorkflowContext } from "./runWorkflow";

type Row = Record<string, any>;
type From = (table: string) => any;

export type DeriveChildResult = {
  sourceTable: string;
  targetTable: string;
  matched: number;
  created: number;
  updatedSource: number;
};

export type DeriveExecutionResult = {
  cfg: DeriveInput;
  parent: Row;
  createdParent: Row;
  idempotency: { reused: boolean; targetField: string; value: string } | null;
  updatedSourceParent: number;
  children: DeriveChildResult[];
};

function uniqueRefs(values: readonly (FieldRefLike | undefined)[]) {
  return [...new Map(values.filter(Boolean).map(value => [fieldRefKey(value!), value!])).values()];
}

function filterRefs(filters: DeriveChildSpec["filters"]): FieldRefLike[] {
  return (filters?.conditions || []).map((condition: DeriveFilterCondition) => condition.field);
}

async function sourceSelect(moduleRef: string, refs: readonly FieldRefLike[]) {
  const related = uniqueRefs(refs).filter(ref => normalizeFieldRef(ref).relations.length > 0);
  if (!related.length) return "*";
  const resolved = await resolveFieldRefs(moduleRef, related);
  return ["*", ...buildFieldRefSelect(resolved)].join(",");
}

async function bulkUpdate(
  from: From,
  table: string,
  ids: string[],
  patch?: Record<string, any>,
) {
  const cleanIds = [...new Set(ids.map(String).filter(Boolean))];
  const updatePatch = patch && typeof patch === "object" ? patch : {};
  if (!cleanIds.length || !Object.keys(updatePatch).length) return 0;
  const { error } = await from(table).update(updatePatch).in("id", cleanIds);
  if (error) throw new Error(error.message);
  return cleanIds.length;
}

function applyTemplate(template: string, context: { id: string }) {
  return String(template || "").replaceAll("{{id}}", context.id);
}

export async function executeDeriveWorkflow({
  context,
  input,
  resolveTable,
}: {
  context: WorkflowContext;
  input?: unknown;
  resolveTable: (tableOrSlug: string) => Promise<string>;
}): Promise<DeriveExecutionResult> {
  const cfg = normalizeDeriveInput(input);
  const children = normalizeChildren(cfg);
  const supabase = await createClient();
  const from: From = table => (supabase as any).from(table) as any;

  // Resolve every configured table before the first write. This preserves the
  // existing failure behavior and prevents a later child group from producing
  // an avoidable partial workflow.
  const sourceParentTable = await resolveTable(cfg.source.parentTable);
  const targetParentTable = await resolveTable(cfg.target.parentTable);
  const preparedChildren = await Promise.all(children.map(async child => ({
    child,
    sourceTable: await resolveTable(child.sourceTable),
    targetTable: await resolveTable(child.targetTable),
  })));

  const parentSelect = await sourceSelect(
    cfg.source.parentTable,
    Object.values(cfg.maps?.parent || {}),
  );
  const { data: parent, error: parentError } = await from(sourceParentTable)
    .select(parentSelect)
    .eq("id", context.recordId)
    .maybeSingle();
  if (parentError) throw new Error(parentError.message);
  if (!parent) throw new Error(`Origen no encontrado (${cfg.source.parentTable}) id=${context.recordId}`);

  const parentData = applyMapAndDefaults({
    sourceRow: parent,
    map: cfg.maps?.parent,
    defaults: cfg.defaults?.parent,
  });

  let createdParent: Row | null = null;
  let idempotency: DeriveExecutionResult["idempotency"] = null;
  if (cfg.idempotency?.targetField && cfg.idempotency?.valueTemplate) {
    const targetField = String(cfg.idempotency.targetField);
    const value = applyTemplate(cfg.idempotency.valueTemplate, { id: String(context.recordId) });
    parentData[targetField] = value;
    const { data, error } = await from(targetParentTable).select("*").eq(targetField, value).maybeSingle();
    if (error) throw new Error(error.message);
    createdParent = data;
    idempotency = { reused: Boolean(data), targetField, value };
  }

  if (!createdParent) {
    const { data, error } = await from(targetParentTable).insert(parentData).select("*").single();
    if (error) throw new Error(error.message);
    createdParent = data;
  }
  if (!createdParent) throw new Error(`No se pudo recuperar el padre creado en ${cfg.target.parentTable}`);
  const targetParent = createdParent;

  const childrenMeta: DeriveChildResult[] = [];
  for (const [index, prepared] of preparedChildren.entries()) {
    const { child, sourceTable, targetTable } = prepared;
    const label = `children[${index}] ${child.sourceTable} -> ${child.targetTable}`;
    try {
      const select = await sourceSelect(child.sourceTable, [
        ...Object.values(child.map || {}),
        ...filterRefs(child.filters),
      ]);
      const { data, error } = await from(sourceTable)
        .select(select)
        .eq(child.sourceFkToParent, parent.id);
      if (error) throw new Error(error.message);
      const matched = ((data || []) as Row[]).filter(row => rowMatchesFilters(row, child.filters));
      const rows = matched.map(row => ({
        ...applyMapAndDefaults({ sourceRow: row, map: child.map, defaults: child.defaults }),
        [child.targetFkToParent]: targetParent.id,
      }));
      if (rows.length) {
        const { error: insertError } = await from(targetTable).insert(rows);
        if (insertError) throw new Error(insertError.message);
      }
      const updatedSource = await bulkUpdate(
        from,
        sourceTable,
        matched.map(row => row.id).filter(Boolean),
        child.sourceUpdates,
      );
      childrenMeta.push({
        sourceTable: child.sourceTable,
        targetTable: child.targetTable,
        matched: matched.length,
        created: rows.length,
        updatedSource,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${label}: ${message}`);
    }
  }

  const updatedSourceParent = await bulkUpdate(
    from,
    sourceParentTable,
    [String(parent.id)],
    cfg.sourceUpdates?.parent,
  );

  return {
    cfg,
    parent,
    createdParent: targetParent,
    idempotency,
    updatedSourceParent,
    children: childrenMeta,
  };
}
