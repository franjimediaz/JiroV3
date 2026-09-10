import { asRecord, requiredString } from "./common";

export function parseRunWorkflowBody(value: unknown) {
  const body = asRecord(value);
  const context = asRecord(body.context, "context invalido");
  return {
    workflowKey: requiredString(body.workflowKey, "workflowKey", 100),
    context: {
      ...context,
      recordId: requiredString(context.recordId, "context.recordId", 120),
    },
    input: body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : {},
  };
}
