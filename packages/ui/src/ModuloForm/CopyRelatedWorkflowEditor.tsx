"use client";

import React, { useEffect, useRef, useState } from "react";
import Selector from "../components/fields/Selector";
import { COPY_RELATED_MAX_DEPTH } from "@repo/types";

type Field = { name: string; label?: string };
type Styles = Record<string, string>;
type Input = Record<string, unknown>;
const asObject = (value: unknown): Input => value && typeof value === "object" && !Array.isArray(value) ? value as Input : {};
const asString = (value: unknown) => typeof value === "string" ? value : "";

function normalizeRows(serialized: string, literals?: boolean) {
  return Object.entries(asObject(JSON.parse(serialized))).map(([dest, val]) => ({
    dest, val: literals ? JSON.stringify(val) ?? "" : String(val),
  }));
}

export function WorkflowJsonEditor({ value, onChange, readOnly, styles }: {
  value?: Input;
  onChange: (value: Input) => void;
  readOnly?: boolean;
  styles: Styles;
}) {
  const serialized = JSON.stringify(value || {}, null, 2);
  const [text, setText] = useState(serialized);
  const [error, setError] = useState("");
  useEffect(() => { setText(serialized); setError(""); }, [serialized]);
  return <details style={{ gridColumn: "1 / -1" }}>
    <summary>Input JSON / raw</summary>
    <textarea aria-label="Input JSON" className={styles.input} rows={12} value={text} disabled={readOnly}
      onChange={(event) => setText(event.target.value)} onBlur={() => {
        try {
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("El input debe ser un objeto JSON");
          onChange(parsed);
          setError("");
        } catch (error) { setError(error instanceof Error ? error.message : "JSON invalido"); }
      }} />
    {error && <div role="alert">{error}. Se conserva el último input válido.</div>}
  </details>;
}

function FieldSelect({ label, value: rawValue, fields, onChange, readOnly, styles, allowCustom }: {
  label: string; value?: unknown; fields: Field[]; onChange: (value: string) => void; readOnly?: boolean; styles: Styles; allowCustom?: boolean;
}) {
  const value = asString(rawValue);
  return <div><label className={styles.label}>{label}
    <select className={styles.input} value={value || ""} disabled={readOnly} onChange={(event) => onChange(event.target.value)}>
      <option value="">Selecciona campo</option>
      {value && !fields.some((field) => field.name === value) && <option value={value}>{value}</option>}
      {fields.map((field) => <option key={field.name} value={field.name}>{field.label ? `${field.label} (${field.name})` : field.name}</option>)}
    </select>
  </label>
    {allowCustom && <label className={styles.label}>Nombre del campo (si no aparece en la lista)
      <input className={styles.input} value={value} disabled={readOnly} onChange={(event) => onChange(event.target.value)} />
    </label>}
  </div>;
}

function PairsEditor({ value, onChange, sourceFields, targetFields, literals, readOnly, styles }: {
  value?: Input; onChange: (value: Input) => void;
  sourceFields: Field[]; targetFields: Field[]; literals?: boolean; readOnly?: boolean; styles: Styles;
}) {
  const signature = JSON.stringify(value || {});
  const lastEmitted = useRef(signature);
  const [rows, setRows] = useState(() => normalizeRows(signature, literals));
  useEffect(() => {
    if (signature !== lastEmitted.current) {
      setRows(normalizeRows(signature, literals));
      lastEmitted.current = signature;
    }
  }, [signature, literals]);
  const commit = (next: typeof rows) => {
    setRows(next);
    const result = Object.fromEntries(next.filter((row) => row.dest && (literals || row.val)).map((row) => {
      let val: unknown = row.val;
      if (literals) { try { val = JSON.parse(row.val); } catch { /* Plain text is a string literal. */ } }
      return [row.dest, val];
    }));
    lastEmitted.current = JSON.stringify(result);
    onChange(result);
  };
  return <div className={styles.card}>
    <h4>{literals ? "Valores literales (defaults)" : "Mapeo destino → origen"}</h4>
    {rows.map((row, index) => <div key={index} className={styles.actionsRow}>
      <FieldSelect label="Campo destino" value={row.dest} fields={targetFields} readOnly={readOnly} styles={styles}
        onChange={(dest) => commit(rows.map((item, i) => i === index ? { ...item, dest } : item))} />
      {literals ? <label className={styles.label}>Valor literal
        <input className={styles.input} value={row.val} disabled={readOnly} placeholder='Texto o JSON: true, 42, null, "42"'
          onChange={(event) => commit(rows.map((item, i) => i === index ? { ...item, val: event.target.value } : item))} />
      </label> : <FieldSelect label="Campo origen" value={row.val} fields={sourceFields} readOnly={readOnly} styles={styles}
        onChange={(val) => commit(rows.map((item, i) => i === index ? { ...item, val } : item))} />}
      <button type="button" className={styles.btn} disabled={readOnly} onClick={() => commit(rows.filter((_, i) => i !== index))}>Eliminar</button>
    </div>)}
    <button type="button" className={styles.btnAdd} disabled={readOnly} onClick={() => commit([...rows, { dest: "", val: "" }])}>
      {literals ? "+ Añadir default" : "+ Añadir mapeo"}
    </button>
  </div>;
}

export default function CopyRelatedWorkflowEditor({ value = {}, onChange, sourceFields: currentFields, getTableFields, ensureTableFields, readOnly, styles, depth = 1 }: {
  value?: Input; onChange: (value: Input) => void;
  sourceFields: Field[]; getTableFields: (table: string) => Field[]; ensureTableFields?: (table: string) => void;
  readOnly?: boolean; styles: Styles;
  depth?: number;
}) {
  const source = asObject(value.source);
  const target = asObject(value.target);
  const match = asObject(source.match);
  const dedupe = asObject(value.dedupe);
  const sourceTable = asString(source.table);
  const targetTable = asString(target.table);
  useEffect(() => {
    if (sourceTable) ensureTableFields?.(sourceTable);
    if (targetTable) ensureTableFields?.(targetTable);
  }, [sourceTable, targetTable, ensureTableFields]);
  const sourceFields = sourceTable ? getTableFields(sourceTable) : [];
  const targetFields = targetTable ? getTableFields(targetTable) : [];
  const patch = (change: Input) => onChange({ ...value, ...change });
  const selectProps = { readOnly, styles };
  const tableSelector = (kind: "source" | "target", label: string) => <Selector
    moduleSlug="modulos" displayField="nombre" valueField="slug" label={label}
    value={kind === "source" ? sourceTable : targetTable} readOnly={readOnly}
    filters={[{ field: "activo", op: "=", value: true }, { field: "tipo", op: "in", value: ["tabla", "subtabla", "vista"] }]}
    sort={[{ field: "orden", direction: "asc" }]}
    onChange={(table: string) => patch({ [kind]: { ...asObject(value[kind]), table } })} />;
  return <div style={{ gridColumn: "1 / -1" }} className={styles.card}>
    <h4>Origen</h4>
    {tableSelector("source", "Módulo origen")}
    {depth === 1 ? <><FieldSelect {...selectProps} label="Campo del origen a comparar" fields={sourceFields} value={match.field}
      onChange={(field) => patch({ source: { ...source, match: { ...match, field } } })} />
    <FieldSelect {...selectProps} label="Valor desde el registro actual" fields={currentFields} value={match.valueFromRecord}
      onChange={(valueFromRecord) => patch({ source: { ...source, match: { ...match, valueFromRecord } } })} /></> :
      <FieldSelect {...selectProps} label="Campo origen que enlaza con el padre origen" fields={sourceFields} value={source.parentField}
        onChange={(parentField) => patch({ source: { ...source, parentField } })} />}
    <h4>Destino</h4>
    {tableSelector("target", "Módulo destino")}
    <FieldSelect {...selectProps} label={depth === 1 ? "Campo que recibe el ID del registro actual" : "Campo que recibe el ID del padre destino creado o reutilizado"} fields={targetFields} value={target.parentField}
      onChange={(parentField) => patch({ target: { ...target, parentField } })} />
    <PairsEditor {...selectProps} sourceFields={sourceFields} targetFields={targetFields} value={asObject(value.map)} onChange={(map) => patch({ map })} />
    <PairsEditor {...selectProps} literals sourceFields={sourceFields} targetFields={targetFields} value={asObject(value.defaults)} onChange={(defaults) => patch({ defaults })} />
    <h4>Deduplicación</h4>
    <label><input type="checkbox" checked={dedupe.enabled === true} disabled={readOnly}
      onChange={(event) => patch({ dedupe: { ...dedupe, enabled: event.target.checked } })} /> Omitir registros ya copiados para este padre</label>
    {dedupe.enabled === true && <>
      <FieldSelect {...selectProps} allowCustom label="Identificador del origen" fields={sourceFields} value={dedupe.sourceIdField}
        onChange={(sourceIdField) => patch({ dedupe: { ...dedupe, sourceIdField } })} />
      <FieldSelect {...selectProps} label="Campo destino que guarda el identificador del origen" fields={targetFields} value={dedupe.targetSourceIdField}
        onChange={(targetSourceIdField) => patch({ dedupe: { ...dedupe, targetSourceIdField } })} />
    </>}
    <h4>Hijos relacionados · nivel {depth}</h4>
    {depth < COPY_RELATED_MAX_DEPTH && <button type="button" className={styles.btnAdd} disabled={readOnly}
      onClick={() => patch({ children: [...(Array.isArray(value.children) ? value.children : []), {
        source: { table: "", parentField: "" }, target: { table: "", parentField: "" }, map: {}, defaults: {},
      }] })}>+ Añadir hijo</button>}
    {depth >= COPY_RELATED_MAX_DEPTH && <div className={styles.hint}>Máximo de {COPY_RELATED_MAX_DEPTH} niveles, incluida la raíz.</div>}
    {Array.isArray(value.children) && value.children.map((child, index) => <div key={index} className={styles.card}>
      <div className={styles.actionsRow}>Hijo {index + 1}
        <button type="button" className={styles.btn} disabled={readOnly}
          onClick={() => patch({ children: (value.children as unknown[]).filter((_, i) => i !== index) })}>Eliminar hijo</button>
      </div>
      {depth < COPY_RELATED_MAX_DEPTH ? <CopyRelatedWorkflowEditor value={asObject(child)}
        onChange={(next) => patch({ children: (value.children as unknown[]).map((item, i) => i === index ? next : item) })}
        sourceFields={sourceFields} getTableFields={getTableFields} ensureTableFields={ensureTableFields}
        readOnly={readOnly} styles={styles} depth={depth + 1} /> :
        <div role="alert">Este hijo supera la profundidad máxima. Elimina el hijo o corrige el JSON; su configuración se conserva.</div>}
    </div>)}
  </div>;
}
