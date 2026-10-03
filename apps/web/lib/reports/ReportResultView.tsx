"use client";

import { ListView, getModuleColorVariables } from "@repo/ui";
import type { ReportResult, ReportScalar } from "@repo/types";
import type { CSSProperties } from "react";

const display = (value: ReportScalar) => value === null ? "—" : typeof value === "number" ? new Intl.NumberFormat("es-ES", {maximumFractionDigits: 4}).format(value) : typeof value === "boolean" ? value ? "Sí" : "No" : value;
export default function ReportResultView({result, color, name}: {result: ReportResult; color?: string; name: string}) {
  if (result.type === "list") return <div>
    {result.truncated && <p role="status">Mostrando {result.rows.length} de {result.total} resultados. Añade filtros para reducirlos.</p>}
    <ListView title={name} schema={{db: {table: "report_result", name}, ui: {color}, capabilities: {allowSearch: false, allowCreate: false, allowImport: false, allowExport: false},
      fields: result.columns.map((column, index) => ({name: `v${index}`, label: column.label, type: "text", list: true}))}}
      data={result.rows.map((row, index) => ({id: index, ...Object.fromEntries(result.columns.map((column, index) => [`v${index}`, display(row[column.id] ?? null)]))}))}
      toolbar={{create: false, search: false, import: false, export: false}} />
    <p className="small text-muted mt-2">{result.scanned} registros de origen.</p>
  </div>;
  return <div className="jiro-report-matrix" style={getModuleColorVariables(color) as CSSProperties}>
    <div className="table-responsive">
      <table className="table table-bordered table-sm align-middle mb-0">
        <caption>{name} · {result.scanned} registros de origen. Totales calculados sobre los valores originales.</caption>
        <thead>
          <tr><th rowSpan={2} scope="col">Filas</th>{result.columnLabels.map((labels, index) => <th key={index} scope="colgroup" colSpan={result.valueLabels.length}>{labels.join(" / ")}</th>)}<th scope="colgroup" colSpan={result.valueLabels.length}>Total</th></tr>
          <tr>{[...result.columnLabels, ["Total"]].flatMap((_, index) => result.valueLabels.map((label, value) => <th key={`${index}-${value}`} scope="col">{label}</th>))}</tr>
        </thead>
        <tbody>{result.rowLabels.map((labels, row) => <tr key={row}>
          <th scope="row">{labels.join(" / ")}</th>
          {result.cells[row]!.flatMap((values, column) => values.map((value, measure) => <td key={`${column}-${measure}`}>{display(value)}</td>))}
          {result.rowTotals[row]!.map((value, index) => <td className="fw-semibold" key={index}>{display(value)}</td>)}
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">Total</th>{result.columnTotals.flatMap((values, column) => values.map((value, measure) => <td key={`${column}-${measure}`}>{display(value)}</td>))}{result.totals.map((value, index) => <td key={index}>{display(value)}</td>)}</tr></tfoot>
      </table>
    </div>
    {!result.rowLabels.length && <p className="p-3">No hay resultados para estos filtros.</p>}
  </div>;
}
