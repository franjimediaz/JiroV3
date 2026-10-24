import { resolveDbTableFromSlug } from "./slugs";
import { executeDeriveWorkflow } from "./executeDeriveWorkflow";
import type { WorkflowContext } from "./runWorkflow";

/** Legacy budget adapter over the shared derive executor. */
export async function budgetGenerateFromTasks({
  context,
  input,
}: {
  context: WorkflowContext;
  input?: unknown;
}) {
  const execution = await executeDeriveWorkflow({
    context,
    input,
    resolveTable: resolveDbTableFromSlug,
  });
  const createdChildren = execution.children.reduce((total, child) => total + child.created, 0);

  return {
    result: {
      id: execution.createdParent.id,
      tableSlug: execution.cfg.target.parentTable,
    },
    meta: {
      // Retained for callers that consume the historical aggregate counter.
      createdChildren,
      createdParent: {
        id: execution.createdParent.id,
        table: execution.cfg.target.parentTable,
      },
      children: execution.children,
    },
  };
}
