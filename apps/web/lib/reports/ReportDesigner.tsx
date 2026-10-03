"use client";

import { useMemo, useState } from "react";
import { AdvancedFilterBuilder, FilterExpressionSummary, ModalConfirm } from "@repo/ui";
import { advancedSearchFields, emptyAdvancedFilter, getEffectiveModuleCapabilities, reportAggregations, reportFieldKey, reportFieldOptions,
  type AdvancedFilterGroup, type ReportColumn, type ReportDefinition, type ReportFieldOption, type ReportSource } from "@repo/types";

const aggregationLabels = {none: "Sin agregación", count: "Recuento", countDistinct: "Recuento distinto", sum: "Suma", avg: "Media", min: "Mínimo", max: "Máximo"};
type Zone = "rows" | "columns" | "values";
export default function ReportDesigner({report, sources, onChange}: {
  report: ReportDefinition; sources: ReportSource[]; onChange: (report: ReportDefinition) => void;
}) {
  const source = sources.find(item => item.slug === report.sourceModule);
  const options = useMemo(() => source ? reportFieldOptions(source, sources) : [], [source, sources]);
  const filters = useMemo(() => source ? advancedSearchFields(source.schema, Object.fromEntries(sources.map(item => [item.slug, item.schema]))) : [], [source, sources]);
  const [filterDraft, setFilterDraft] = useState<AdvancedFilterGroup | null>(null);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const filterOption = (key: string) => filters.find(option => reportFieldKey({field: option.field.name, relation: option.relation}) === key);
  const addFilter = (key: string) => {
    const option = filterOption(key);
    if (!option) return;
    const next = structuredClone(report.filters);
    next.items.push({kind: "condition", field: option.field.name, relation: option.relation, op: "=", value: option.field.type === "boolean" ? true : ""});
    setFilterDraft(next);
  };
  const zones: Zone[] = report.type === "list" ? ["columns"] : ["rows", "columns", "values"];
  const inZone = (zone: Zone): ReportColumn[] => report.type === "list" ? report.config.columns : report.config[zone];
  const update = (zone: Zone, columns: ReportColumn[]) => {
    const next = {...report, config: {...report.config, [zone]: columns}} as ReportDefinition;
    if (next.type === "list") next.sort = next.sort.filter(sort => columns.some(column => column.id === sort.columnId));
    onChange(next);
  };
  const add = (zone: Zone, option?: ReportFieldOption) => {
    if (!option) return;
    const current = inZone(zone), max = report.type === "list" ? 20 : zone === "values" ? 5 : 2;
    if (current.length >= max) return;
    const aggregation = zone === "values" ? reportAggregations(option.field).includes("sum") ? "sum" : "count" : "none";
    update(zone, [...current, {id: crypto.randomUUID(), ref: option.ref, label: option.label, aggregation}]);
  };
  const move = (zone: Zone, from: number, to: number) => {
    const current = [...inZone(zone)];
    if (from < 0 || to < 0 || from >= current.length || to >= current.length) return;
    const [column] = current.splice(from, 1); current.splice(to, 0, column!); update(zone, current);
  };
  return <>
    <div className="row g-3 mb-3">
      <label className="col-md-6 form-label">Nombre<input className="form-control" value={report.name} maxLength={120} onChange={event => onChange({...report, name: event.target.value})} /></label>
      <label className="col-md-3 form-label">Tipo<select aria-label="Tipo de informe" className="form-select" value={report.type} onChange={event => onChange(event.target.value === "list"
        ? {...report, type: "list", config: {columns: []}, sort: []} : {...report, type: "matrix", config: {rows: [], columns: [], values: []}, sort: []})}>
        <option value="list">Lista</option><option value="matrix">Matrix</option>
      </select></label>
      <label className="col-md-3 form-label">Módulo principal<select aria-label="Módulo principal" className="form-select" value={report.sourceModule} onChange={event => {
        setSelected(""); onChange({...report, sourceModule: event.target.value, filters: emptyAdvancedFilter(), sort: [],
          config: report.type === "list" ? {columns: []} : {rows: [], columns: [], values: []}} as ReportDefinition);
      }}>
        <option value="">Selecciona un módulo</option>{sources.filter(item => getEffectiveModuleCapabilities(item.schema).allowSearch).map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}
      </select></label>
      <label className="col-12 form-label">Descripción<textarea className="form-control" rows={2} maxLength={2000} value={report.description} onChange={event => onChange({...report, description: event.target.value})} /></label>
    </div>
    <p className="small text-muted">Arrastra un campo a una zona o selecciónalo y pulsa Añadir. Cambiar el módulo o tipo vacía el diseño. Máximo 5.000 registros de origen.</p>
    <div className="row g-3">
      <aside className="col-lg-4">
        <div className="jiro-query-card">
          <h2 className="jiro-query-header h6">Campos disponibles</h2>
          <div className="p-3">
            <input className="form-control mb-2" aria-label="Buscar campo" placeholder="Buscar campo…" value={search} onChange={event => setSearch(event.target.value)} />
            <div className="jiro-report-fields" role="list" aria-label="Campos disponibles">
              {options.filter(option => option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(option => <button key={reportFieldKey(option.ref)} type="button"
                className={`btn text-start w-100 mb-1 ${selected === reportFieldKey(option.ref) ? "jiro-form-primary" : "btn-light"}`}
                draggable onDragStart={event => {event.dataTransfer.setData("application/jiro-field", reportFieldKey(option.ref)); event.dataTransfer.effectAllowed = "copy";}}
                onClick={() => setSelected(reportFieldKey(option.ref))} aria-pressed={selected === reportFieldKey(option.ref)}>
                <i className="bi bi-grip-vertical me-1" aria-hidden="true" />{option.label}
              </button>)}
              {!options.length && <p>Selecciona un módulo con campos disponibles.</p>}
            </div>
          </div>
        </div>
      </aside>
      <div className="col-lg-8">
        {zones.map(zone => <section key={zone} className="jiro-query-card mb-3" aria-label={`Zona ${zone === "rows" ? "Filas" : zone === "values" ? "Valores" : "Columnas"}`}
          onDragOver={event => event.preventDefault()} onDrop={event => {
            event.preventDefault(); const key = event.dataTransfer.getData("application/jiro-field");
            add(zone, options.find(option => reportFieldKey(option.ref) === key));
          }}>
          <h2 className="jiro-query-header h6">{zone === "rows" ? "Filas" : zone === "values" ? "Valores" : "Columnas"}</h2>
          <div className="p-3">
            {inZone(zone).map((column, index) => {
              const option = options.find(option => reportFieldKey(option.ref) === reportFieldKey(column.ref));
              const aggregations = option ? reportAggregations(option.field).filter(aggregation => report.type === "list" || (zone === "values" ? aggregation !== "none" : aggregation === "none")) : [];
              return <div key={column.id} className="border rounded p-2 mb-2" draggable
                onDragStart={event => {event.stopPropagation(); event.dataTransfer.setData("application/jiro-column", JSON.stringify({zone, index}));}}
                onDragOver={event => event.preventDefault()} onDrop={event => {
                  const raw = event.dataTransfer.getData("application/jiro-column"); if (!raw) return;
                  event.preventDefault(); event.stopPropagation();
                  try { const from = JSON.parse(raw); if (from.zone === zone && Number.isInteger(from.index)) move(zone, from.index, index); } catch { /* Ignore unrelated drags. */ }
                }}>
                <select className="form-select form-select-sm mb-2" aria-label={`Campo origen ${index + 1} de ${zone}`} value={reportFieldKey(column.ref)} onChange={event => {
                  const next = options.find(item => reportFieldKey(item.ref) === event.target.value); if (!next) return;
                  const allowed = reportAggregations(next.field);
                  const aggregation = allowed.includes(column.aggregation) ? column.aggregation : zone === "values" ? "count" : "none";
                  update(zone, inZone(zone).map(item => item.id === column.id ? {...item, ref: next.ref, aggregation, label: item.label === option?.label ? next.label : item.label} : item));
                }}>
                  {!option && <option value={reportFieldKey(column.ref)}>Campo no disponible</option>}
                  {options.map(item => <option key={reportFieldKey(item.ref)} value={reportFieldKey(item.ref)}>{item.label}</option>)}
                </select>
                <div className="d-flex gap-2 flex-wrap align-items-center">
                  <input className="form-control form-control-sm jiro-report-label" aria-label={`Etiqueta ${index + 1} de ${zone}`} maxLength={120} value={column.label}
                    onChange={event => update(zone, inZone(zone).map(item => item.id === column.id ? {...item, label: event.target.value} : item))} />
                  <select className="form-select form-select-sm jiro-report-aggregate" aria-label={`Agregación ${index + 1} de ${zone}`} value={column.aggregation}
                    onChange={event => update(zone, inZone(zone).map(item => item.id === column.id ? {...item, aggregation: event.target.value as ReportColumn["aggregation"]} : item))}>
                    {aggregations.map(aggregation => <option key={aggregation} value={aggregation}>{aggregationLabels[aggregation]}</option>)}
                  </select>
                  <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={`Subir ${column.label}`} disabled={index === 0} onClick={() => move(zone, index, index - 1)}>↑</button>
                  <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={`Bajar ${column.label}`} disabled={index === inZone(zone).length - 1} onClick={() => move(zone, index, index + 1)}>↓</button>
                  <button type="button" className="btn btn-sm btn-outline-danger" aria-label={`Eliminar ${column.label}`} onClick={() => update(zone, inZone(zone).filter(item => item.id !== column.id))}><i className="bi bi-trash" /></button>
                </div>
              </div>;
            })}
            {!inZone(zone).length && <p className="text-muted">Arrastra campos aquí.</p>}
            <button type="button" className="btn btn-sm jiro-form-primary" disabled={!options.some(option => reportFieldKey(option.ref) === selected) || inZone(zone).length >= (report.type === "list" ? 20 : zone === "values" ? 5 : 2)}
              onClick={() => add(zone, options.find(option => reportFieldKey(option.ref) === selected))}>Añadir campo seleccionado</button>
          </div>
        </section>)}
        {report.type === "list" && <section className="jiro-query-card mb-3">
          <h2 className="jiro-query-header h6">Orden</h2>
          <div className="p-3">
            {report.sort.map((sort, index) => <div key={index} className="d-flex gap-2 mb-2">
              <select aria-label="Columna de ordenación" className="form-select" value={sort.columnId} onChange={event => onChange({...report, sort: report.sort.map((item, i) => i === index ? {...item, columnId: event.target.value} : item)})}>
                {report.config.columns.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}
              </select>
              <select aria-label="Dirección de ordenación" className="form-select" value={sort.direction} onChange={event => onChange({...report, sort: report.sort.map((item, i) => i === index ? {...item, direction: event.target.value as "asc" | "desc"} : item)})}>
                <option value="asc">ASC</option><option value="desc">DESC</option>
              </select>
              <button type="button" className="btn btn-outline-danger" aria-label="Eliminar orden" onClick={() => onChange({...report, sort: report.sort.filter((_, i) => i !== index)})}>×</button>
            </div>)}
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!report.config.columns.length || report.sort.length >= 3} onClick={() => onChange({...report, sort: [...report.sort, {columnId: report.config.columns[0]!.id, direction: "asc"}]})}>Añadir orden</button>
          </div>
        </section>}
      </div>
    </div>
    <section className="jiro-query-card mt-3" aria-label="Zona Filtros" onDragOver={event => event.preventDefault()}
      onDrop={event => {event.preventDefault(); addFilter(event.dataTransfer.getData("application/jiro-field"));}}>
      <h2 className="jiro-query-header h6">Filtros</h2>
      <div className="p-3"><FilterExpressionSummary filter={report.filters} fields={filters} />
        <button type="button" className="btn jiro-form-primary mt-3" disabled={!source} onClick={() => setFilterDraft(structuredClone(report.filters))}>Editar consulta</button>
        <button type="button" className="btn btn-outline-secondary mt-3 ms-2" disabled={!filterOption(selected)} onClick={() => addFilter(selected)}>Añadir campo seleccionado al filtro</button>
        <p className="small text-muted mt-2 mb-0">También puedes arrastrar aquí un campo con filtro habilitado para configurar su condición.</p>
      </div>
    </section>
    <ModalConfirm open={filterDraft !== null} configuration title="Construir consulta" confirmText="Aplicar" moduleColor={source?.schema.ui?.color || "#e2e8f0"}
      onCancel={() => setFilterDraft(null)} onConfirm={() => {if (filterDraft) onChange({...report, filters: filterDraft}); setFilterDraft(null);}}>
      <div className="jiro-advanced-search">{filterDraft && <AdvancedFilterBuilder value={filterDraft} fields={filters} onChange={setFilterDraft} />}</div>
    </ModalConfirm>
  </>;
}
