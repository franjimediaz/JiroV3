"use client";

import React from "react";
import { advancedFilterOperators, ADVANCED_FILTER_MAX_DEPTH, type AdvancedFilterCondition, type AdvancedFilterGroup,
  type AdvancedFilterOperator, type AdvancedSearchField } from "@repo/types";
import Selector from "./components/fields/Selector";

export const advancedFilterOperatorLabels: Record<AdvancedFilterOperator, string> = {
  "=": "Igual a", "!=": "Distinto de", contains: "Contiene", notContains: "No contiene", startsWith: "Empieza por",
  endsWith: "Termina en", ">": "Mayor que / después", ">=": "Mayor o igual", "<": "Menor que / antes", "<=": "Menor o igual",
  between: "Entre", in: "Incluido en", notIn: "No incluido en", isNull: "Vacío", isNotNull: "No vacío",
};
const keyOf = (option: AdvancedSearchField) => JSON.stringify([option.relation || "", option.field.name]);

export function AdvancedFilterBuilder({ value, onChange, fields, depth = 1 }: {
  value: AdvancedFilterGroup; onChange: (next: AdvancedFilterGroup) => void; fields: AdvancedSearchField[]; depth?: number;
}) {
  const update = (index: number, next: AdvancedFilterGroup | AdvancedFilterCondition) =>
    onChange({ ...value, items: value.items.map((item, i) => i === index ? next : item) });
  return <fieldset className="border rounded p-3 mb-2" style={{minWidth: 0}}>
    <legend className="float-none w-auto px-2 fs-6">{depth === 1 ? "Coincidir con" : "Grupo"}</legend>
    <select className="form-select form-select-sm mb-3" aria-label="Lógica del grupo" style={{maxWidth: 280}}
      value={value.logic} onChange={event => onChange({...value, logic: event.target.value as "AND" | "OR"})}>
      <option value="AND">Todas las condiciones (AND)</option><option value="OR">Cualquiera (OR)</option>
    </select>
    {value.items.map((item, index) => <div key={index} className="d-flex align-items-start gap-2 mb-2">
      <div className="flex-grow-1" style={{minWidth: 0}}>
        {item.kind === "group" ? <AdvancedFilterBuilder value={item} fields={fields} depth={depth + 1} onChange={next => update(index, next)} />
          : <Condition value={item} fields={fields} onChange={next => update(index, next)} />}
      </div>
      <button type="button" className="btn btn-sm btn-outline-danger" aria-label={item.kind === "group" ? "Eliminar grupo" : "Eliminar condición"}
        onClick={() => onChange({...value, items: value.items.filter((_, i) => i !== index)})}><i className="bi bi-trash" /></button>
    </div>)}
    <div className="d-flex gap-2 flex-wrap">
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!fields.length} onClick={() => {
        const first = fields[0]; if (!first) return;
        onChange({...value, items: [...value.items, {kind: "condition", field: first.field.name, relation: first.relation, op: "=", value: first.field.type === "boolean" ? true : ""}]});
      }}>+ Condición</button>
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={depth >= ADVANCED_FILTER_MAX_DEPTH - 1}
        onClick={() => onChange({...value, items: [...value.items, {kind: "group", logic: "AND", items: []}]})}>+ Grupo</button>
    </div>
  </fieldset>;
}

function Condition({value, fields, onChange}: {value: AdvancedFilterCondition; fields: AdvancedSearchField[]; onChange: (next: AdvancedFilterCondition) => void}) {
  const selected = fields.find(option => option.field.name === value.field && option.relation === value.relation);
  const field = selected?.field;
  const operators = field ? advancedFilterOperators(field) : [];
  const multiple = value.op === "in" || value.op === "notIn";
  const scalar = Array.isArray(value.value) ? "" : value.value;
  const numeric = ["number", "money", "percent"].includes(field?.type || "");
  const inputType = numeric ? "number" : field?.type === "date" ? "date" : field?.type === "datetime" ? "datetime-local" : "text";
  const convert = (raw: string) => numeric && raw !== "" ? Number(raw) : raw;
  return <div className="row g-2">
    <div className="col-12 col-lg-4">
      <select className="form-select form-select-sm" aria-label="Campo del filtro" value={JSON.stringify([value.relation || "", value.field])}
        onChange={event => { const next = fields.find(option => keyOf(option) === event.target.value); if (next) onChange({kind: "condition", field: next.field.name, relation: next.relation, op: "=", value: next.field.type === "boolean" ? true : ""}); }}>
        {!selected && <option value={JSON.stringify([value.relation || "", value.field])}>Campo no disponible</option>}
        {fields.map(option => <option key={keyOf(option)} value={keyOf(option)}>{option.label}</option>)}
      </select>
    </div>
    <div className="col-12 col-lg-3">
      <select className="form-select form-select-sm" aria-label="Operador del filtro" value={value.op} onChange={event => {
        const op = event.target.value as AdvancedFilterOperator;
        onChange({...value, op, value: op === "between" ? ["", ""] : op === "in" || op === "notIn" ? [] : field?.type === "boolean" ? true : ""});
      }}>{operators.map(op => <option key={op} value={op}>{advancedFilterOperatorLabels[op]}</option>)}</select>
    </div>
    <div className="col-12 col-lg-5">
      {value.op === "isNull" || value.op === "isNotNull" ? null : field?.type === "boolean" ?
        <select aria-label="Valor del filtro" className="form-select form-select-sm" value={String(scalar)} onChange={e => onChange({...value, value: e.target.value === "true"})}>
          <option value="true">Verdadero</option><option value="false">Falso</option>
        </select> : field?.type === "selectorTabla" ?
        <Selector {...field.ref} value={value.value ?? (multiple ? [] : "")} multiple={multiple}
          onChange={next => onChange({...value, value: next})} /> : value.op === "between" ?
        <div className="d-flex gap-2">{[0, 1].map(index => <input key={index} aria-label={index === 0 ? "Desde" : "Hasta"}
          className="form-control form-control-sm" type={inputType} step={numeric ? "any" : undefined}
          value={String((Array.isArray(value.value) ? value.value[index] : "") ?? "")}
          onChange={event => { const next = Array.isArray(value.value) ? [...value.value] : ["", ""]; next[index] = convert(event.target.value); onChange({...value, value: next}); }} />)}</div>
        : field?.options?.length ? <select className="form-select form-select-sm" aria-label="Valor del filtro" multiple={multiple}
            value={multiple ? (Array.isArray(value.value) ? value.value.map(String) : []) : String(scalar ?? "")}
            onChange={event => onChange({...value, value: multiple ? Array.from(event.target.selectedOptions).map(option => option.value) : event.target.value})}>
            {!multiple && <option value="">Seleccionar valor</option>}{field.options.map(option => <option key={option} value={option}>{option}</option>)}
          </select> : <input className="form-control form-control-sm" aria-label="Valor del filtro" type={inputType} step={numeric ? "any" : undefined}
            value={multiple ? (Array.isArray(value.value) ? value.value.join(",") : "") : String(scalar ?? "")}
            placeholder={multiple ? "Valores separados por comas" : "Valor"}
            onChange={event => onChange({...value, value: multiple ? event.target.value.split(",").map(entry => entry.trim()) : convert(event.target.value)})} />}
    </div>
  </div>;
}
