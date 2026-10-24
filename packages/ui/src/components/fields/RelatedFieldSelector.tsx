"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  MAX_FIELD_REF_DEPTH,
  formatFieldRefPath,
  normalizeFieldRef,
  serializeFieldRef,
  type Field,
  type FieldRef,
  type FieldRefInput,
  type ModuleSchema,
} from "@repo/types";
import { dataProvider as defaultDataProvider } from "../../providers/DataProvider";
import type { DataProvider } from "../../engines/computeEngine";

const schemaPromises = new Map<string, Promise<ModuleSchema>>();

export type RelatedFieldSelectorProps = {
  sourceModuleSlug: string;
  value?: FieldRefInput;
  onChange: (value: FieldRef) => void;
  allowedField?: (field: Field, schema: ModuleSchema) => boolean;
  allowRelations?: boolean;
  maxDepth?: number;
  disabled?: boolean;
  allowClear?: boolean;
  dataProvider?: Pick<DataProvider, "getSchema">;
  className?: string;
};

function loadSchema(provider: Pick<DataProvider, "getSchema">, moduleSlug: string) {
  if (!provider.getSchema) return Promise.reject(new Error("dataProvider.getSchema no está implementado"));
  const cacheKey = moduleSlug.trim();
  let pending = schemaPromises.get(cacheKey);
  if (!pending) {
    pending = provider.getSchema(cacheKey).catch((error) => {
      schemaPromises.delete(cacheKey);
      throw error;
    });
    schemaPromises.set(cacheKey, pending);
  }
  return pending;
}

export function clearRelatedFieldSchemaCache() {
  schemaPromises.clear();
}

export function listRelatedFieldOptions({
  schema,
  allowedField,
  allowRelations = true,
  depth = 0,
  maxDepth = MAX_FIELD_REF_DEPTH,
}: {
  schema?: ModuleSchema;
  allowedField?: RelatedFieldSelectorProps["allowedField"];
  allowRelations?: boolean;
  depth?: number;
  maxDepth?: number;
}) {
  const fields = (schema?.fields || []).filter((field) => field.visible !== false && !field.virtual);
  return {
    selectable: fields.filter((field) => field.type !== "ReverseLink" && field.type !== "selectorTabla" &&
      (!allowedField || allowedField(field, schema!))),
    relationFields: allowRelations && depth < maxDepth
      ? fields.filter((field) => field.type === "selectorTabla" && !(field as any).ref?.multiple && (field as any).ref?.moduleSlug)
      : [],
  };
}

export async function describeRelatedFieldPath({
  dataProvider,
  sourceModuleSlug,
  value,
}: {
  dataProvider: Pick<DataProvider, "getSchema">;
  sourceModuleSlug: string;
  value?: FieldRefInput;
}) {
  const normalized = normalizeFieldRef(value);
  if (!sourceModuleSlug || !normalized.field) return { label: "", valid: true };
  try {
    let current = await loadSchema(dataProvider, sourceModuleSlug);
    const labels: string[] = [];
    for (const relationName of normalized.relations) {
      const relation = current.fields.find(field => field.name === relationName);
      if (!relation || relation.type !== "selectorTabla" || !(relation as any).ref?.moduleSlug) throw new Error("invalid");
      labels.push(relation.label || relation.name);
      current = await loadSchema(dataProvider, (relation as any).ref.moduleSlug);
    }
    const target = current.fields.find(field => field.name === normalized.field);
    if (!target) throw new Error("invalid");
    labels.push(target.label || target.name);
    return { label: labels.join(" › "), valid: true };
  } catch {
    return { label: formatFieldRefPath(normalized), valid: false };
  }
}

export default function RelatedFieldSelector({
  sourceModuleSlug,
  value,
  onChange,
  allowedField,
  allowRelations = true,
  maxDepth = MAX_FIELD_REF_DEPTH,
  disabled,
  allowClear = false,
  dataProvider = defaultDataProvider,
  className,
}: RelatedFieldSelectorProps) {
  const normalizedValue = useMemo(() => normalizeFieldRef(value), [value]);
  const [relations, setRelations] = useState<string[]>([]);
  const [modulePath, setModulePath] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<ModuleSchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configuredDisplay, setConfiguredDisplay] = useState<{ label: string; valid: boolean }>({ label: "", valid: true });

  useEffect(() => {
    let active = true;
    setRelations([]);
    setModulePath(sourceModuleSlug ? [sourceModuleSlug] : []);
    setSchemas([]);
    setError(null);
    if (!sourceModuleSlug) return () => { active = false; };
    setLoading(true);
    loadSchema(dataProvider, sourceModuleSlug)
      .then((schema) => { if (active) setSchemas([schema]); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "No se pudo cargar el schema"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sourceModuleSlug, dataProvider]);

  useEffect(() => {
    let active = true;
    if (!sourceModuleSlug || !normalizedValue.field) {
      setConfiguredDisplay({ label: "", valid: true });
      return () => { active = false; };
    }
    void describeRelatedFieldPath({ dataProvider, sourceModuleSlug, value: normalizedValue })
      .then((result) => { if (active) setConfiguredDisplay(result); });
    return () => { active = false; };
  }, [sourceModuleSlug, normalizedValue.field, normalizedValue.relations.join("\u0000"), dataProvider]);

  const schema = schemas[schemas.length - 1];
  const fields = (schema?.fields || []).filter((field) => field.visible !== false && !field.virtual);
  const { selectable, relationFields } = listRelatedFieldOptions({
    schema,
    allowedField,
    allowRelations,
    depth: relations.length,
    maxDepth,
  });

  const configuredPath = configuredDisplay.label || formatFieldRefPath(normalizedValue);
  const configuredValidHere = normalizedValue.field && normalizedValue.relations.length === relations.length &&
    normalizedValue.relations.every((part, index) => part === relations[index]) &&
    fields.some((field) => field.name === normalizedValue.field && field.type !== "ReverseLink" && (!allowedField || allowedField(field, schema!)));

  async function enterRelation(field: Field) {
    const moduleSlug = (field as any).ref?.moduleSlug as string | undefined;
    if (!moduleSlug || disabled) return;
    if (modulePath.includes(moduleSlug)) {
      setError("La ruta contiene un ciclo de módulos");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await loadSchema(dataProvider, moduleSlug);
      setRelations((current) => [...current, field.name]);
      setModulePath((current) => [...current, moduleSlug]);
      setSchemas((current) => [...current, next]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo abrir la relación");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <div className="border rounded p-2 bg-body">
        <div className="d-flex align-items-center gap-2 mb-2">
          {relations.length ? (
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={disabled || loading}
              onClick={() => { setRelations((current) => current.slice(0, -1)); setSchemas((current) => current.slice(0, -1)); setModulePath((current) => current.slice(0, -1)); }}>
              <i className="bi bi-chevron-left" aria-hidden="true" />
              <span className="visually-hidden">Volver</span>
            </button>
          ) : null}
          <span className="small fw-semibold text-truncate">{relations.length ? relations.join(" › ") : "Campos"}</span>
          {allowClear && normalizedValue.field ? <button type="button" className="btn btn-sm btn-link ms-auto p-0"
            disabled={disabled} onClick={() => onChange({ field: "" })}>Quitar</button> : null}
          {loading ? <span className="spinner-border spinner-border-sm ms-auto" aria-label="Cargando" /> : null}
        </div>

        {configuredPath ? (
          <div className={`small mb-2 ${configuredDisplay.valid ? "text-body-secondary" : "text-danger"}`}>
            Seleccionado: {configuredPath}{!configuredDisplay.valid ? " (ruta no válida)" : ""}
          </div>
        ) : null}
        {error ? <div className="small text-danger mb-2">{error}</div> : null}

        <div className="list-group list-group-flush" style={{ maxHeight: 240, overflowY: "auto" }}>
          {selectable.map((field) => (
            <button key={field.name} type="button" className={`list-group-item list-group-item-action py-1 px-2 ${configuredValidHere && normalizedValue.field === field.name ? "active" : ""}`}
              disabled={disabled} onClick={() => onChange(serializeFieldRef({ relations, field: field.name }))}>
              {field.label || field.name}
            </button>
          ))}
          {relationFields.map((field) => {
            const canSelectRelation = !allowedField || allowedField(field, schema!);
            return (
              <div key={field.name} className="list-group-item py-0 px-0 d-flex align-items-stretch">
                <button type="button" className="btn btn-link text-start text-body text-decoration-none flex-grow-1 py-1 px-2"
                  disabled={disabled || !canSelectRelation} onClick={() => onChange(serializeFieldRef({ relations, field: field.name }))}>
                  {field.label || field.name}
                </button>
                <button type="button" className="btn btn-link text-body py-1 px-2" title={`Abrir ${field.label || field.name}`}
                  disabled={disabled || loading} onClick={() => void enterRelation(field)}>
                  <i className="bi bi-chevron-right" aria-hidden="true" />
                  <span className="visually-hidden">Abrir relación</span>
                </button>
              </div>
            );
          })}
          {!loading && !selectable.length && !relationFields.length ? <div className="small text-body-secondary px-2 py-1">No hay campos compatibles.</div> : null}
        </div>
      </div>
    </div>
  );
}
