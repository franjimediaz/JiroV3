"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { getModuleColorVariables } from "@repo/ui";
import { emptyAdvancedFilter, isModuleActionAvailable, type ModuleSchema, type ReportDefinition, type ReportResult, type ReportSource } from "@repo/types";
import { RequirePerms, usePerms } from "@/lib/perms";
import ReportDesigner from "./ReportDesigner";
import ReportResultView from "./ReportResultView";
import { reportRequest } from "./client";

const empty = (): ReportDefinition => ({ name: "", description: "", type: "list", sourceModule: "", config: { columns: [] }, filters: emptyAdvancedFilter(), sort: [] });

export default function ReportFormClient({ mode, id, schema }: { mode: "create" | "view" | "edit"; id?: string; schema: ModuleSchema }) {
  const router = useRouter();
  const { loading, hasPermiso } = usePerms();
  const [report, setReport] = useState<ReportDefinition | null>(mode === "create" ? empty() : null);
  const [sources, setSources] = useState<ReportSource[]>([]);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const canEdit = isModuleActionAvailable(schema, "actualizar", hasPermiso("report_definitions", "actualizar"));
  const canWrite = mode === "create" ? isModuleActionAvailable(schema, "crear", hasPermiso("report_definitions", "crear")) : canEdit;
  useEffect(() => {
    let active = true;
    void Promise.all([mode === "view" ? Promise.resolve({ sources: [] }) : reportRequest("/api/reports?metadata=1"),
      id ? reportRequest(`/api/reports?id=${encodeURIComponent(id)}`) : Promise.resolve({ report: empty() })])
      .then(([metadata, definition]) => { if (active) { setSources(metadata.sources); setReport(definition.report); } })
      .catch(error => { if (active) setError(error.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; revision.current++; };
  }, [id, mode]);
  const run = async () => {
    if (!report || busy || (mode !== "view" && !canWrite)) return;
    const current = ++revision.current;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await reportRequest("/api/reports", "POST", mode === "view" ? { action: "run", id } : { action: "preview", report, id });
      if (current === revision.current) setResult(response.result);
    } catch (error) { if (current === revision.current) setError(error instanceof Error ? error.message : "Error ejecutando informe"); }
    finally { if (current === revision.current) setBusy(false); }
  };
  const save = async () => {
    if (!report || busy || !canWrite) return;
    const current = ++revision.current;
    setBusy(true); setError("");
    try {
      const response = await reportRequest("/api/reports", "POST", { action: "save", report, id });
      if (current === revision.current) router.replace(`/report_definitions/${encodeURIComponent(response.report.id)}`);
    } catch (error) { if (current === revision.current) setError(error instanceof Error ? error.message : "Error guardando informe"); }
    finally { if (current === revision.current) setBusy(false); }
  };
  if (loading) return null;
  return <RequirePerms modulo="report_definitions" accion="ver"><div className="Orymexa-advanced-search bg-white text-dark p-3" style={getModuleColorVariables(schema.ui?.color) as CSSProperties}>
    <header className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
      <h1 className="h4 mb-0">{mode === "create" ? "Nuevo informe" : mode === "edit" ? "Editar informe" : report?.name || "Informe"}</h1>
      <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => router.push(mode === "edit" ? `/report_definitions/${encodeURIComponent(id!)}` : "/report_definitions")}>{mode === "view" ? "Volver a informes" : "Cancelar"}</button>
    </header>
    {error && <div role="alert" className="alert alert-danger">{error}</div>}
    {busy && <p role="status">Cargando…</p>}
    {report && mode !== "view" && canWrite && <>
      <fieldset disabled={busy} style={{ minWidth: 0 }}><ReportDesigner report={report} sources={sources} onChange={next => { revision.current++; setReport(next); setResult(null); }} /></fieldset>
      <div className="d-flex gap-2 mt-3 mb-3">
        <button type="button" className="btn Orymexa-form-primary" disabled={busy} onClick={() => void save()}>Guardar informe</button>
        <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => void run()}>Vista previa</button>
      </div>
    </>}
    {mode !== "view" && !canWrite && <p role="alert">No tienes permiso para modificar informes.</p>}
    {report && mode === "view" && <><p>{report.description}</p><div className="d-flex gap-2 mb-3">
      <button type="button" className="btn Orymexa-form-primary" disabled={busy} onClick={() => void run()}>Ejecutar</button>
      {canEdit && <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => router.push(`/report_definitions/${encodeURIComponent(id!)}?edit=true`)}>Editar informe</button>}
    </div></>}
    {result && <section aria-label="Resultado del informe"><h2 className="h5">{mode === "view" ? "Resultado" : "Vista previa"}</h2><ReportResultView result={result} color={schema.ui?.color} name={report?.name || "Informe"} /></section>}
  </div></RequirePerms>;
}
