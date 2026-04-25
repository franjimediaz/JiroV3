import { budgetGenerateFromTasks } from "./budget.generateFromTasks";
import { deriveCreateFromParent } from "./derive.createFromParent";

export const WORKFLOW_KEYS = {
  deriveCreateFromParent: "derive.createFromParent",
  budgetGenerateFromTasks: "budget.generateFromTasks",
} as const;

export type WorkflowKey = (typeof WORKFLOW_KEYS)[keyof typeof WORKFLOW_KEYS];

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
  const handler = workflowRegistry[args.workflowKey as WorkflowKey];
  if (!handler) {
    throw new Error(`Workflow no soportado: ${args.workflowKey}`);
  }
  return handler({ context: args.context, input: args.input });
}
