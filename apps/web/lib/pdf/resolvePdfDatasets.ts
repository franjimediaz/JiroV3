import type { PdfDatasetAggregate, PdfDatasetDefinition, PdfDatasetFilter, PdfDatasetSort } from "./templateExtensions";

type AnyObj = Record<string, any>;

function getByPath(source: AnyObj, path?: string) {
  if (!path) return undefined;
  return String(path)
    .split(".")
    .filter(Boolean)
    .reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), source);
}

function toNumber(value: any) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function compareValues(left: any, right: any) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function applyFilter(row: AnyObj, filter: PdfDatasetFilter, ctx: AnyObj) {
  const left = row?.[filter.field];
  const right = filter.valueFromPath ? getByPath(ctx, filter.valueFromPath) : filter.value;
  const op = filter.op || "eq";

  switch (op) {
    case "neq":
      return left !== right;
    case "gt":
      return compareValues(left, right) > 0;
    case "gte":
      return compareValues(left, right) >= 0;
    case "lt":
      return compareValues(left, right) < 0;
    case "lte":
      return compareValues(left, right) <= 0;
    case "contains":
      return String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase());
    case "in": {
      const values = Array.isArray(right) ? right : String(right ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      return values.includes(left);
    }
    case "eq":
    default:
      return left === right;
  }
}

function applySort(rows: AnyObj[], sort?: PdfDatasetSort[]) {
  if (!Array.isArray(sort) || !sort.length) return rows;
  const cloned = [...rows];
  cloned.sort((left, right) => {
    for (const rule of sort) {
      const result = compareValues(left?.[rule.field], right?.[rule.field]);
      if (result !== 0) return rule.direction === "desc" ? -result : result;
    }
    return 0;
  });
  return cloned;
}

function computeAggregate(rows: AnyObj[], aggregate: PdfDatasetAggregate) {
  const field = aggregate.field;
  const values = field ? rows.map((row) => toNumber(row?.[field])) : [];

  switch (aggregate.op) {
    case "count":
      return rows.length;
    case "sum":
      return values.reduce((acc, value) => acc + value, 0);
    case "avg":
      return values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0;
    case "min":
      return values.length ? Math.min(...values) : 0;
    case "max":
      return values.length ? Math.max(...values) : 0;
    default:
      return 0;
  }
}

function buildGroupedRows(rows: AnyObj[], groupBy?: string) {
  if (!groupBy) return [];
  const grouped = new Map<string, AnyObj[]>();

  for (const row of rows) {
    const key = String(row?.[groupBy] ?? "");
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.entries()).map(([key, items]) => ({
    key,
    label: key,
    count: items.length,
    items,
  }));
}

export async function resolvePdfDatasets(args: {
  supabase: any;
  template: any;
  ctx: AnyObj;
}) {
  const definitions = Array.isArray(args.template?.datasets) ? (args.template.datasets as PdfDatasetDefinition[]) : [];
  const datasets: Record<string, AnyObj> = {};

  for (const definition of definitions) {
    if (!definition?.id) continue;

    let rows: AnyObj[] = [];

    if (definition.source === "related" && definition.relatedKey) {
      rows = Array.isArray(args.ctx.related?.[definition.relatedKey]) ? [...args.ctx.related[definition.relatedKey]] : [];
    } else if (definition.source === "record") {
      const resolved = definition.path ? getByPath(args.ctx, definition.path) : args.ctx.record;
      rows = Array.isArray(resolved) ? [...resolved] : resolved && typeof resolved === "object" ? [resolved] : [];
    } else if (definition.source === "table" && definition.table) {
      let query = args.supabase.from(definition.table).select("*");
      if (Array.isArray(definition.filters)) {
        for (const filter of definition.filters) {
          const value = filter.valueFromPath ? getByPath(args.ctx, filter.valueFromPath) : filter.value;
          if (value === undefined || value === null || value === "") continue;

          switch (filter.op || "eq") {
            case "neq":
              query = query.neq(filter.field, value);
              break;
            case "gt":
              query = query.gt(filter.field, value);
              break;
            case "gte":
              query = query.gte(filter.field, value);
              break;
            case "lt":
              query = query.lt(filter.field, value);
              break;
            case "lte":
              query = query.lte(filter.field, value);
              break;
            case "contains":
              query = query.ilike(filter.field, `%${value}%`);
              break;
            case "in": {
              const values = Array.isArray(value) ? value : String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
              query = query.in(filter.field, values);
              break;
            }
            case "eq":
            default:
              query = query.eq(filter.field, value);
              break;
          }
        }
      }
      if (Array.isArray(definition.sort)) {
        for (const sort of definition.sort) {
          query = query.order(sort.field, { ascending: sort.direction !== "desc" });
        }
      }
      if (definition.limit && definition.limit > 0) {
        query = query.limit(definition.limit);
      }
      const { data } = await query;
      rows = Array.isArray(data) ? data : [];
    }

    if (Array.isArray(definition.filters) && definition.source !== "table") {
      rows = rows.filter((row) => definition.filters?.every((filter) => applyFilter(row, filter, args.ctx)));
    }

    rows = applySort(rows, definition.sort);
    if (definition.limit && definition.limit > 0) rows = rows.slice(0, definition.limit);

    const grouped = buildGroupedRows(rows, definition.groupBy);
    const summary = Object.fromEntries(
      (definition.aggregates || []).map((aggregate) => [aggregate.as, computeAggregate(rows, aggregate)])
    );

    datasets[definition.id] = {
      id: definition.id,
      label: definition.label || definition.id,
      rows,
      grouped,
      summary,
      first: rows[0] ?? null,
      count: rows.length,
    };
  }

  return datasets;
}
