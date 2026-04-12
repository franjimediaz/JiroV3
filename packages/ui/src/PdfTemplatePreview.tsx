"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ModuleSchema } from "@repo/types";

type Props = {
  templateId?: string | null;
  recordId?: string | null;
  recordData?: Record<string, any>;
  schema?: ModuleSchema;
  active?: boolean;
  debounceMs?: number;
  emptyMessage?: string;
};

type PreviewState =
  | { status: "idle"; html: string | null; error: string | null }
  | { status: "loading"; html: string | null; error: string | null }
  | { status: "ready"; html: string; error: null }
  | { status: "error"; html: string | null; error: string };

export default function PdfTemplatePreview({
  templateId,
  recordId,
  recordData = {},
  schema,
  active = true,
  debounceMs = 250,
  emptyMessage = "Selecciona una plantilla PDF para ver la previsualización.",
}: Props) {
  const [state, setState] = useState<PreviewState>({
    status: "idle",
    html: null,
    error: null,
  });

  const normalizedTemplateId = (templateId || "").trim();
  const normalizedRecordId = String(recordId || "").trim();
  const safeRecordData = useMemo(() => recordData || {}, [recordData]);
  const payloadKey = useMemo(
    () => JSON.stringify({ templateId: normalizedTemplateId, recordId: normalizedRecordId, recordData: safeRecordData }),
    [normalizedTemplateId, normalizedRecordId, safeRecordData]
  );

  useEffect(() => {
    if (!active) return;

    if (!normalizedTemplateId) {
      setState({ status: "idle", html: null, error: null });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setState((prev) => ({ status: "loading", html: prev.html, error: null }));

        const res = await fetch("/api/pdf/template-preview", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            templateId: normalizedTemplateId,
            recordId: normalizedRecordId || undefined,
            recordData: safeRecordData,
            schema,
          }),
        });

        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "No se pudo cargar la previsualización");
        }

        setState({
          status: "ready",
          html: String(json?.html || ""),
          error: null,
        });
      } catch (error: any) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          html: null,
          error: error?.message || "No se pudo cargar la previsualización",
        });
      }
    }, debounceMs);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [active, debounceMs, normalizedTemplateId, payloadKey, schema]);

  if (!normalizedTemplateId) {
    return <div className="alert alert-secondary mb-0">{emptyMessage}</div>;
  }

  if (state.status === "error") {
    const lowerError = (state.error || "").toLowerCase();
    const message = lowerError.includes("no encontrado")
      ? "La plantilla PDF seleccionada no existe o ya no está disponible."
      : state.error;

    return <div className="alert alert-warning mb-0">{message}</div>;
  }

  if (state.status === "loading" && !state.html) {
    return <div className="alert alert-info mb-0">Cargando previsualización...</div>;
  }

  if (state.status !== "ready" && !state.html) {
    if (!normalizedRecordId && !Object.keys(safeRecordData || {}).length) {
      return (
        <div className="alert alert-secondary mb-0">
          No hay un registro guardado todavía. Guarda primero o rellena datos para generar una preview útil.
        </div>
      );
    }

    return <div className="alert alert-secondary mb-0">Preparando previsualización...</div>;
  }

  return (
    <div className="card overflow-hidden">
      <div className="card-body p-0 position-relative" style={{ minHeight: 720 }}>
        {state.status === "loading" && (
          <div
            className="position-absolute top-0 end-0 m-3 badge text-bg-light border"
            style={{ zIndex: 1 }}
          >
            Actualizando preview...
          </div>
        )}

        <iframe
          title="Pdf template preview"
          srcDoc={state.html || ""}
          style={{ width: "100%", minHeight: 720, border: 0, background: "#fff" }}
        />
      </div>
    </div>
  );
}
