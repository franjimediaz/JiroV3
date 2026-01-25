// lib/workflows/runWorkflow.ts
import { budgetGenerateFromTasks } from "./budget.generateFromTasks";
import { deriveCreateFromParent } from "./derive.createFromParent";

export type WorkflowContext = {
  recordId: string;
  moduleSlug?: string;
  tableSlug?: string;
};

export async function runWorkflow({ workflowKey, context, input }: any) {
  switch (workflowKey) {
    case "derive.createFromParent":
      return deriveCreateFromParent({ context, input });

    // si quieres mantener el específico:
    // case "budget.generateFromTasks":
    //   return budgetGenerateFromTasks({ context, input });

    default:
      throw new Error(`Workflow no soportado: ${workflowKey}`);
  }
}
