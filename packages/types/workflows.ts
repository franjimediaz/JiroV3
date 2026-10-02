/** Client-safe metadata. Executable handlers live only in the backend registry. */
export const WORKFLOW_KEYS = {
  deriveCreateFromParent: "derive.createFromParent",
  budgetGenerateFromTasks: "budget.generateFromTasks",
  recordsCopyRelated: "records.copyRelated",
} as const;

export type WorkflowKey = (typeof WORKFLOW_KEYS)[keyof typeof WORKFLOW_KEYS];

const WORKFLOW_LABELS: Record<WorkflowKey, string> = {
  "derive.createFromParent": "Crear desde un registro padre",
  "budget.generateFromTasks": "Generar presupuesto desde tareas",
  "records.copyRelated": "Copiar registros relacionados",
};

export const WORKFLOW_CATALOG = Object.values(WORKFLOW_KEYS).map((key) => ({
  key,
  label: WORKFLOW_LABELS[key],
}));

export type CopyRelatedInput = {
  source: { table: string; match: { field: string; valueFromRecord: string } };
  target: { table: string; parentField: string };
  map?: Record<string, string>;
  defaults?: Record<string, unknown>;
  dedupe?: {
    enabled: boolean;
    sourceIdField?: string;
    targetSourceIdField?: string;
  };
};
