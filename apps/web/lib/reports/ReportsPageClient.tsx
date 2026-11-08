"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ListView, ModalConfirm } from "@repo/ui";
import { isModuleActionAvailable, type ModuleSchema, type ReportDefinition, type ReportSource } from "@repo/types";
import { RequirePerms, usePerms } from "@/lib/perms";
import { reportListRow, reportRequest } from "./client";

export default function ReportsPageClient({ schema }: { schema: ModuleSchema }) {
  const router = useRouter();
  const { loading, hasPermiso } = usePerms();
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [sources, setSources] = useState<ReportSource[]>([]);
  const [deleting, setDeleting] = useState<ReportDefinition | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const canView = hasPermiso("reports", "ver");
  const canCreate = isModuleActionAvailable(schema, "crear", hasPermiso("reports", "crear"));
  const canEdit = isModuleActionAvailable(schema, "actualizar", hasPermiso("reports", "actualizar"));
  const canDelete = isModuleActionAvailable(schema, "eliminar", hasPermiso("reports", "eliminar"));
  const primaryKey = schema.db.primaryKey || "id";
  useEffect(() => {
    let active = true;
    void Promise.all([reportRequest("/api/reports"), reportRequest("/api/reports?metadata=1")])
      .then(([list, metadata]) => { if (active) { setReports(list.reports); setSources(metadata.sources); } })
      .catch(error => { if (active) setError(error.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  const remove = async () => {
    if (!deleting || busy || !canDelete) return;
    setBusy(true); setError("");
    try {
      await reportRequest("/api/reports", "DELETE", { id: deleting.id });
      setReports(items => items.filter(item => item.id !== deleting.id));
      setDeleting(null);
    } catch (error) { setError(error instanceof Error ? error.message : "Error eliminando informe"); }
    finally { setBusy(false); }
  };
  if (loading) return null;
  return <RequirePerms modulo="reports" accion="ver">
    {error && <div role="alert" className="alert alert-danger">{error}</div>}
    <ListView schema={schema} data={reports.map(report => reportListRow(report, schema, sources))} loading={busy}
      onCreate={canCreate && !busy ? () => router.push("/reports/new") : undefined}
      onViewRow={canView && !busy ? row => router.push(`/reports/${encodeURIComponent(row[primaryKey])}`) : undefined}
      onEditRow={canEdit && !busy ? row => router.push(`/reports/${encodeURIComponent(row[primaryKey])}?edit=true`) : undefined}
      onDeleteRow={canDelete && !busy ? row => setDeleting(reports.find(report => report.id === row[primaryKey]) || null) : undefined} />
    <ModalConfirm open={deleting !== null} title="Eliminar informe" message={`Se eliminará la definición de «${deleting?.name || ""}».`}
      danger confirmText="Eliminar" confirmDisabled={busy || !canDelete} onCancel={() => { if (!busy) setDeleting(null); }} onConfirm={() => void remove()} />
  </RequirePerms>;
}
