import { budgetGenerateFromTasks } from "./budget.generateFromTasks";
import { deriveCreateFromParent } from "./derive.createFromParent";
import { recordsCopyRelated } from "./records.copyRelated";
import { WORKFLOW_KEYS, type WorkflowKey } from "@repo/types";

export { WORKFLOW_KEYS } from "@repo/types";
export type { WorkflowKey } from "@repo/types";

export type WorkflowContext = {
  recordId: string;
  moduleSlug?: string;
  table?: string;
  tableSlug?: string;
};

export type RunWorkflowArgs = {
  workflowKey: string;
  context: WorkflowContext;
  input?: any;
};

type WorkflowHandler = (args: { context: WorkflowContext; input?: any }) => Promise<any>;

export const workflowRegistry: Record<WorkflowKey, WorkflowHandler> = {
  [WORKFLOW_KEYS.deriveCreateFromParent]: deriveCreateFromParent,
  [WORKFLOW_KEYS.budgetGenerateFromTasks]: budgetGenerateFromTasks,
  [WORKFLOW_KEYS.recordsCopyRelated]: recordsCopyRelated,
};

function assertWorkflowArgs(args: RunWorkflowArgs) {
  if (!args?.workflowKey || typeof args.workflowKey !== "string") {
    throw new Error("workflowKey requerido");
  }
  if (!args?.context || typeof args.context !== "object") {
    throw new Error("context requerido");
  }
  if (!args.context.recordId || typeof args.context.recordId !== "string") {
    throw new Error("context.recordId requerido");
  }
}

export async function runWorkflow(args: RunWorkflowArgs) {
  assertWorkflowArgs(args);
  const handler = Object.prototype.hasOwnProperty.call(workflowRegistry, args.workflowKey)
    ? workflowRegistry[args.workflowKey as WorkflowKey]
    : undefined;
  if (!handler) {
    throw new Error(`Workflow no soportado: ${args.workflowKey}`);
  }
  return handler({ context: args.context, input: args.input });
}
