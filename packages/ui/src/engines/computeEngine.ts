import { fieldRefKey, getFieldRefValue, normalizeFieldRef, type AdvancedFilterGroup, type Field, type FieldRefInput, type FieldRefLike, type ModuleSchema, type QueryFilter, type QuerySort } from "@repo/types";
import { safeEval } from "./safeEval";

export type AggregateInput = {
  sourceTable?: string;
  sourceModuleSlug?: string;
  field: FieldRefLike;
  op: "sum" | "avg" | "min" | "max" | "count";
  where: Array<{
    field: FieldRefLike;
    op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "in";
    valueFrom?: "this" | "context";
    path?: FieldRefLike;
    value?: any;
  }>;
};
export type ListInput = {
  moduleSlug: string; // o table, pero tú trabajas con módulo
  q?: string;
  limit?: number;
  offset?: number;
  advancedFilters?: AdvancedFilterGroup;
  purpose?: "export";
  filters?: QueryFilter[];
  sort?: Array<QuerySort | { field: string; dir: "asc" | "desc" }>;
  fieldRefs?: FieldRefInput[];
  hasStyle?: boolean;
  styleIconField?: FieldRefLike;
  styleColorField?: FieldRefLike;
};
export type ListResult = { data: any[]; count?: number; error?: any };

export type DataProvider = {
  getSchema?: (moduleSlug: string) => Promise<ModuleSchema>;
  aggregate: (
    input: AggregateInput,
    record: any,
    context?: Record<string, any>
  ) => Promise<number>;
   list?: (
    input: ListInput,
    context?: Record<string, any>
  ) => Promise<ListResult>;
  getOne?: (moduleSlug: string, id: string) => Promise<any | null>;
};

function collectComputeReadRefs(fields: Field[]): FieldRefLike[] {
  const refs: FieldRefLike[] = [];
  for (const field of fields) {
    const compute = field.compute;
    if (!compute || compute.type === "none") continue;
    if (compute.type === "formula") refs.push(...(compute.dependencies || []).map(item => item.ref));
    if (compute.type === "aggregate") {
      refs.push(...(compute.where || []).filter(item => item.valueFrom === "this" && item.path).map(item => item.path!));
    }
  }
  return [...new Map(refs.map(ref => [fieldRefKey(ref), ref])).values()];
}

export async function hydrateComputeFieldRefs(
  fields: Field[],
  record: Record<string, any>,
  dataProvider: DataProvider,
) {
  if (!dataProvider.list) return record;
  const groups = new Map<string, FieldRefLike[]>();
  for (const input of collectComputeReadRefs(fields)) {
    const ref = normalizeFieldRef(input);
    if (!ref.relations.length) continue;
    const [relation, ...relations] = ref.relations;
    const tail = { field: ref.field, relations };
    const list = groups.get(relation!) || [];
    if (!list.some(item => fieldRefKey(item) === fieldRefKey(tail))) list.push(tail);
    groups.set(relation!, list);
  }
  if (!groups.size) return record;

  const hydrated = { ...record };
  await Promise.all([...groups].map(async ([relationName, fieldRefs]) => {
    const relation = fields.find(field => field.name === relationName);
    if (!relation || relation.type !== "selectorTabla" || relation.ref.multiple) return;
    const selected = record[relationName];
    const selectedId = selected && typeof selected === "object" ? selected[relation.ref.valueField || "id"] : selected;
    if (selectedId === null || selectedId === undefined || selectedId === "") return;
    const result = await dataProvider.list!({
      moduleSlug: relation.ref.moduleSlug,
      filters: [{ field: relation.ref.valueField || "id", op: "=", value: selectedId }],
      fieldRefs,
      limit: 1,
    });
    const related = result?.data?.[0];
    if (related) hydrated[relationName] = related;
  }));
  return hydrated;
}

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
  const out = { ...(await hydrateComputeFieldRefs(fields, record || {}, dataProvider)) };

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
      for (const dependency of f.compute.dependencies || []) {
        scope[dependency.token] = getFieldRefValue(out, dependency.ref);
      }
      out[name] = safeEval(expr, scope);
      continue;
    }

    if (f.compute.type === "aggregate") {
      out[name] = await dataProvider.aggregate(
        {
          sourceTable: f.compute.sourceTable,
          sourceModuleSlug: f.compute.sourceModuleSlug,
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
