import { resolveDbTableFromSlug } from "./slugs";
import { executeDeriveWorkflow } from "./executeDeriveWorkflow";
import type { WorkflowContext } from "./runWorkflow";

function isProbablyDbTable(value: string) {
  return Boolean(value) && !value.includes("/") && !value.includes(" ") && !value.includes("-");
}

async function resolveTable(tableOrSlug: string) {
  const value = String(tableOrSlug || "").trim();
  if (!value) throw new Error("Tabla vacia en derive input");
  return isProbablyDbTable(value) ? value : resolveDbTableFromSlug(value);
}

export async function deriveCreateFromParent({
  context,
  input,
}: {
  context: WorkflowContext;
  input?: unknown;
}) {
  const execution = await executeDeriveWorkflow({ context, input, resolveTable });
  return {
    result: {
      id: execution.createdParent.id,
      targetParentSlug: execution.cfg.target.parentTable,
      parent: {
        id: execution.createdParent.id,
        table: execution.cfg.target.parentTable,
      },
    },
    meta: {
      idempotency: execution.idempotency,
      sourceParent: {
        table: execution.cfg.source.parentTable,
        id: execution.parent.id,
        updated: execution.updatedSourceParent > 0,
      },
      targetParent: {
        table: execution.cfg.target.parentTable,
        id: execution.createdParent.id,
      },
      children: execution.children,
    },
  };
}
