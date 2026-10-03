"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ListView, ModalConfirm, getModuleColorVariables } from "@repo/ui";
import { emptyAdvancedFilter, type ReportDefinition, type ReportResult, type ReportSource } from "@repo/types";
import ReportDesigner from "./ReportDesigner";
import ReportResultView from "./ReportResultView";

async function request(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, {method, headers: {"Content-Type": "application/json"}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const json = await response.json();
  if (!response.ok) throw Error(json.error?.message || "No se pudo completar la operación");
  return json;
}
const empty = (): ReportDefinition => ({name: "", description: "", type: "list", sourceModule: "", config: {columns: []}, filters: emptyAdvancedFilter(), sort: []});
export default function ReportsClient() {
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [sources, setSources] = useState<ReportSource[]>([]);
  const [draft, setDraft] = useState<ReportDefinition | null>(null);
  const [view, setView] = useState<ReportDefinition | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [deleting, setDeleting] = useState<ReportDefinition | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    void Promise.all([request("/api/reports"), request("/api/reports?metadata=1")]).then(([list, metadata]) => {
      if (active) {setReports(list.reports); setSources(metadata.sources);}
    }).catch(error => {if (active) setError(error.message);}).finally(() => {if (active) setBusy(false);});
    return () => {active = false;};
  }, []);
  const change = (report: ReportDefinition) => {revision.current++; setDraft(report); setResult(null); setNotice("");};
  const edit = (report: ReportDefinition) => {change(structuredClone(report)); setView(null); setError("");};
  const run = async (report: ReportDefinition, preview: boolean) => {
    const current = ++revision.current; setBusy(true); setError(""); setResult(null);
    if (!preview) {setView(report); setDraft(null);}
    try {
      const response = await request("/api/reports", "POST", preview ? {action: "preview", report} : {action: "run", id: report.id});
      if (revision.current === current) setResult(response.result);
    } catch (error) {if (revision.current === current) setError(error instanceof Error ? error.message : "Error ejecutando informe");}
    finally {setBusy(false);}
  };
  const save = async () => {
    if (!draft) return;
    setBusy(true); setError("");
    const current = ++revision.current;
    try {
      const response = await request("/api/reports", "POST", {action: "save", report: draft, id: draft.id});
      setReports(items => [response.report, ...items.filter(item => item.id !== response.report.id)]);
      if (revision.current === current) {setDraft(response.report); setNotice("Informe guardado.");}
      else {
        // Keep edits made while saving, but attach the inserted ID so the next
        // save updates this definition instead of accidentally creating another.
        setDraft(latest => latest ? {...latest, id: response.report.id} : latest);
        setNotice("Versión guardada. Hay cambios posteriores pendientes de guardar.");
      }
    } catch (error) {setError(error instanceof Error ? error.message : "Error guardando informe");}
    finally {setBusy(false);}
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true); setError("");
    try {
      await request("/api/reports", "DELETE", {id: deleting.id});
      setReports(items => items.filter(item => item.id !== deleting.id)); setDeleting(null);
    } catch (error) {setError(error instanceof Error ? error.message : "Error eliminando informe"); setDeleting(null);}
    finally {setBusy(false);}
  };
  const selected = draft || view;
  const color = sources.find(source => source.slug === selected?.sourceModule)?.schema.ui?.color;
  return <div className="jiro-advanced-search bg-white text-dark p-3" style={getModuleColorVariables(color) as CSSProperties}>
    <header className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
      <h1 className="h4 mb-0">{draft ? draft.id ? "Editar informe" : "Nuevo informe" : view ? view.name : "Informes"}</h1>
      {!selected && <button type="button" className="btn jiro-form-primary" disabled={busy} onClick={() => edit(empty())}><i className="bi bi-plus-lg me-1" aria-hidden="true" />Nuevo informe</button>}
      {selected && <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => {revision.current++; setDraft(null); setView(null); setResult(null); setError(""); setNotice("");}}>Volver a informes</button>}
    </header>
    {error && <div role="alert" className="alert alert-danger">{error}</div>}
    {notice && <div role="status" className="alert alert-success">{notice}</div>}
    {busy && <p role="status">Cargando…</p>}
    {!selected && <>
      <p className="small text-muted">Tus definiciones de informes. Los resultados se calculan al ejecutar. Se muestran hasta 200 informes recientes.</p>
      <ListView title="Informes" schema={{db: {table: "report_definitions", name: "Informes"}, capabilities: {allowSearch: false, allowImport: false, allowExport: false}, fields: [
        {name: "name", label: "Nombre", type: "text"}, {name: "typeLabel", label: "Tipo", type: "text"},
        {name: "sourceName", label: "Módulo", type: "text"}, {name: "updated_at", label: "Actualizado", type: "datetime"},
      ]}} data={reports.map(report => ({...report, typeLabel: report.type === "list" ? "Lista" : "Matrix", sourceName: sources.find(source => source.slug === report.sourceModule)?.name || "Módulo no disponible"}))}
        onEditRow={busy ? undefined : row => edit(row as ReportDefinition)} onViewRow={busy ? undefined : row => void run(row as ReportDefinition, false)}
        onDeleteRow={busy ? undefined : row => setDeleting(row as ReportDefinition)} toolbar={{create: false, search: false, import: false, export: false}} />
    </>}
    {draft && <>
      <ReportDesigner report={draft} sources={sources} onChange={change} />
      <div className="d-flex gap-2 mt-3 mb-3">
        <button type="button" className="btn jiro-form-primary" disabled={busy} onClick={() => void save()}>Guardar informe</button>
        <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => void run(draft, true)}>Vista previa</button>
      </div>
    </>}
    {view && <><p>{view.description}</p><div className="d-flex gap-2 mb-3"><button type="button" className="btn jiro-form-primary" disabled={busy} onClick={() => void run(view, false)}>Ejecutar</button><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => edit(view)}>Editar informe</button></div></>}
    {result && <section aria-label="Resultado del informe"><h2 className="h5">{draft ? "Vista previa" : "Resultado"}</h2><ReportResultView result={result} color={color} name={selected?.name || "Informe"} /></section>}
    <ModalConfirm open={deleting !== null} title="Eliminar informe" message={`Se eliminará la definición de «${deleting?.name || ""}».`} danger confirmText="Eliminar" confirmDisabled={busy}
      onCancel={() => {if (!busy) setDeleting(null);}} onConfirm={() => void remove()} />
  </div>;
}
