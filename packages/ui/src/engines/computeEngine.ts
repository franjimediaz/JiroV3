import type { Field, ModuleSchema } from "@repo/types";
import { safeEval } from "./safeEval";

export type AggregateInput = {
  sourceTable: string;
  field: string;
  op: "sum" | "avg" | "min" | "max" | "count";
  where: Array<{ field: string; op: "=" | "in"; valueFrom?: "this" | "context"; path?: string; value?: any }>;
};

export type DataProvider = {
  aggregate: (
    input: AggregateInput,
    record: any,
    context?: Record<string, any>
  ) => Promise<number>;
};

/**
 * Aplica overrides y cálculos (formula / aggregate) sobre un registro.
 * No muta el original; devuelve una copia.
 */
export async function applyCompute({
  schema,
  record,
  dataProvider,
  context = {},
}: {
  schema: ModuleSchema | { fields: Field[] };
  record: any;
  dataProvider: DataProvider;
  context?: Record<string, any>;
}) {
  const fields = ("fields" in schema ? schema.fields : []) as Field[];
  const out = { ...record };

  for (const f of fields) {
    const name = f.name;
    const ov = record?.meta?.overrides?.[name];

    if (f.allowOverride && ov?.enabled) {
      out[name] = ov.value;
      continue;
    }

    if (!f.compute || f.compute.type === "none") continue;

    if (f.compute.type === "formula") {
      const { expr, deps } = f.compute;
      const scope = Object.create(null);
      for (const d of deps || []) scope[d] = out[d];
      out[name] = safeEval(expr, scope);
      continue;
    }

    if (f.compute.type === "aggregate") {
      out[name] = await dataProvider.aggregate(
        {
          sourceTable: f.compute.sourceTable,
          field: f.compute.field,
          op: f.compute.op,
          where: f.compute.where || [],
        },
        out,
        context
      );
      continue;
    }
  }

  return out;
}
