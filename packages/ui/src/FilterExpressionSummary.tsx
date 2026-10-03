"use client";

import React from "react";
import type { AdvancedFilterGroup, AdvancedSearchField } from "@repo/types";
import { advancedFilterOperatorLabels } from "./AdvancedFilterBuilder";

export function FilterExpressionSummary({ filter, fields }: {
  filter: AdvancedFilterGroup; fields: AdvancedSearchField[];
}) {
  if (!filter.items.length) return <p className="mb-0">No hay condiciones configuradas.</p>;
  const format = (value: unknown): string => {
    if (typeof value === "boolean") return value ? "Verdadero" : "Falso";
    if (typeof value === "number") return new Intl.NumberFormat("es-ES").format(value);
    return typeof value === "string" ? `“${value}”` : "Sin valor";
  };
  return <div className="jiro-filter-group" role="group" aria-label={filter.logic === "AND" ? "Todas las condiciones" : "Cualquiera de las condiciones"}>
    <span className="jiro-filter-logic">{filter.logic === "AND" ? "TODAS · AND" : "CUALQUIERA · OR"}</span>
    {filter.items.map((item, index) => <React.Fragment key={index}>
      {index > 0 && <div className="jiro-filter-connector">{filter.logic === "AND" ? "Y" : "O"}</div>}
      {item.kind === "group" ? <FilterExpressionSummary filter={item} fields={fields} /> : (() => {
        const field = fields.find(option => option.field.name === item.field && option.relation === item.relation);
        return <div className="jiro-filter-condition">
          <strong>{field?.label || "Campo no disponible"}</strong>{" "}
          <span>{advancedFilterOperatorLabels[item.op] || "Operador no disponible"}</span>{" "}
          {item.op !== "isNull" && item.op !== "isNotNull" && <span className="jiro-filter-value">
            {Array.isArray(item.value) ? item.value.map(format).join(item.op === "between" ? " y " : ", ") : format(item.value)}
          </span>}
        </div>;
      })()}
    </React.Fragment>)}
  </div>;
}
