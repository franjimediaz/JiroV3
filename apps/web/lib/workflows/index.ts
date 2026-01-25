// lib/workflows/index.ts
import { budgetGenerateFromTasks } from "./budget.generateFromTasks";

export type WorkflowContext = {
  moduleSlug?: string;
  table?: string;
  recordId: string;
};

export type RunWorkflowArgs = {
  workflowKey: string;
  context: WorkflowContext;
  input?: any;
};

const registry: Record<string, (args: { context: WorkflowContext; input?: any }) => Promise<any>> = {
  "budget.generateFromTasks": budgetGenerateFromTasks,
  // "invoice.generateFromBudget": ...
};

export async function runWorkflow({ workflowKey, context, input }: RunWorkflowArgs) {
  const handler = registry[workflowKey];
  if (!handler) {
    throw new Error(`Workflow no soportado: ${workflowKey}`);
  }
  return handler({ context, input });
}
