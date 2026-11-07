"use client";
import { getFractalConfig, validateFractalConfig } from "@repo/types";
import type { FractalConfig, ModuleSchema } from "@repo/types";

export function FractalConfigEditor({ schema, readOnly, onChange }: {
  schema: ModuleSchema; readOnly?: boolean; onChange: (config: FractalConfig) => void;
}) {
  const config = getFractalConfig(schema);
  const primaryKey = schema.db.primaryKey || "id";
  const fields = schema.fields.some(field => field.name === primaryKey) ? schema.fields : [{ name: primaryKey, label: primaryKey }, ...schema.fields];
  const patch = (next: Partial<FractalConfig>) => onChange({ ...config, ...next });
  const error = validateFractalConfig(schema);
  return <fieldset disabled={readOnly} className="border rounded p-3" style={{ gridColumn: "1 / -1", minWidth: 0 }}>
    <legend className="fs-6">Vista de registros</legend>
    <label className="d-block">Vista
      <select className="form-select" value={config.enabled ? "fractal" : "list"} onChange={event => patch({ enabled: event.target.value === "fractal" })}>
        <option value="list">Lista</option><option value="fractal">Fractal</option>
      </select>
    </label>
    {config.enabled && <div className="row g-3 mt-1">
      <label className="col-12 col-md-6">Campo de relación padre-hijo
        <select className="form-select" value={config.parentField} onChange={event => patch({ parentField: event.target.value })}>
          <option value="">Seleccionar…</option>{fields.filter(field => field.name !== primaryKey).map(field => <option key={field.name} value={field.name}>{field.label || field.name}</option>)}
        </select>
        <small>Debe guardar la clave {primaryKey} del padre en este mismo módulo. Vacío significa raíz.</small>
      </label>
      <label className="col-12 col-md-6">Campo principal del nodo
        <select className="form-select" value={config.titleField} onChange={event => patch({ titleField: event.target.value })}>
          <option value="">Seleccionar…</option>{fields.map(field => <option key={field.name} value={field.name}>{field.label || field.name}</option>)}
        </select>
      </label>
      <fieldset className="col-12"><legend className="fs-6">Campos visibles en los nodos</legend>
        {fields.map(field => <label key={field.name} className="d-flex align-items-center gap-2 py-2">
          <input type="checkbox" checked={config.visibleFields?.includes(field.name) || false} onChange={event => patch({ visibleFields: event.target.checked ? [...(config.visibleFields || []), field.name] : config.visibleFields?.filter(name => name !== field.name) })} />{field.label || field.name}
        </label>)}
      </fieldset>
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>}
  </fieldset>;
}
