import type { ReportAggregation, ReportDefinition, ReportResult, ReportScalar } from "@repo/types";

type Row = Record<string, ReportScalar>;
const key = (values: ReportScalar[]) => JSON.stringify(values);
const label = (value: ReportScalar) => value === null ? "(Vacío)" : typeof value === "boolean" ? value ? "Sí" : "No" : String(value);
export function aggregate(values: ReportScalar[], operation: ReportAggregation): ReportScalar {
  const present = values.filter(value => value !== null);
  if (operation === "count") return present.length;
  if (operation === "countDistinct") return new Set(present.map(value => key([value]))).size;
  if (!present.length) return null;
  if (operation === "sum" || operation === "avg") {
    const numbers = present.map(Number);
    if (numbers.some(value => !Number.isFinite(value))) throw Error("La agregación encontró un valor no numérico");
    const sum = numbers.reduce((total, value) => total + value, 0);
    if (!Number.isFinite(sum)) throw Error("La agregación supera el rango numérico permitido");
    return operation === "avg" ? sum / present.length : sum;
  }
  return present.reduce((result, value) => operation === "min" ? value < result ? value : result : value > result ? value : result);
}

/** Runs on the server; totals aggregate source values, never sums of averages/distinct counts. */
export function transformReport(report: ReportDefinition, data: Row[], preview: boolean): ReportResult {
  if (report.type === "list") {
    const dimensions = report.config.columns.filter(column => column.aggregation === "none");
    const measures = report.config.columns.filter(column => column.aggregation !== "none");
    let rows = data;
    if (measures.length) {
      const groups = new Map<string, Row[]>();
      if (!dimensions.length) groups.set("[]", []);
      for (const row of data) {
        const groupKey = key(dimensions.map(column => row[column.id] ?? null));
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey)!.push(row);
        if (groups.size > 1000) throw Error("El informe supera 1.000 grupos. Añade filtros.");
      }
      rows = [...groups.values()].map(group => Object.fromEntries(report.config.columns.map(column => [column.id,
        column.aggregation === "none" ? group[0]?.[column.id] ?? null : aggregate(group.map(row => row[column.id] ?? null), column.aggregation)])));
    }
    rows = [...rows].sort((a, b) => {
      for (const sort of report.sort) {
        const av = a[sort.columnId] ?? null, bv = b[sort.columnId] ?? null;
        const comparison = av === bv ? 0 : av === null ? 1 : bv === null ? -1 : av < bv ? -1 : 1;
        if (comparison) return comparison * (sort.direction === "asc" ? 1 : -1);
      }
      return 0;
    });
    const limit = preview ? 100 : 1000;
    return {type: "list", columns: report.config.columns.map(({id, label}) => ({id, label})), rows: rows.slice(0, limit), total: rows.length, truncated: rows.length > limit, scanned: data.length};
  }
  const rowKeys = new Map<string, ReportScalar[]>(), columnKeys = new Map<string, ReportScalar[]>();
  const groups = new Map<string, Row[]>();
  for (const row of data) {
    const rv = report.config.rows.map(column => row[column.id] ?? null), cv = report.config.columns.map(column => row[column.id] ?? null);
    const rk = key(rv), ck = key(cv), cellKey = JSON.stringify([rk, ck]);
    rowKeys.set(rk, rv); columnKeys.set(ck, cv);
    if (rowKeys.size > 100 || columnKeys.size > 50 || rowKeys.size * columnKeys.size * report.config.values.length > 10000)
      throw Error("La matriz supera 100 filas, 50 columnas o 10.000 celdas. Añade filtros.");
    if (!groups.has(cellKey)) groups.set(cellKey, []);
    groups.get(cellKey)!.push(row);
  }
  const rks = [...rowKeys.keys()].sort(), cks = [...columnKeys.keys()].sort();
  const values = (rows: Row[]) => report.config.values.map(column => aggregate(rows.map(row => row[column.id] ?? null), column.aggregation));
  const cell = (rk: string, ck: string) => groups.get(JSON.stringify([rk, ck])) || [];
  return {
    type: "matrix", rowLabels: rks.map(rk => rowKeys.get(rk)!.map(label)), columnLabels: cks.map(ck => columnKeys.get(ck)!.map(label)),
    valueLabels: report.config.values.map(column => column.label), cells: rks.map(rk => cks.map(ck => values(cell(rk, ck)))),
    rowTotals: rks.map(rk => values(cks.flatMap(ck => cell(rk, ck)))), columnTotals: cks.map(ck => values(rks.flatMap(rk => cell(rk, ck)))),
    totals: values(data), scanned: data.length,
  };
}
