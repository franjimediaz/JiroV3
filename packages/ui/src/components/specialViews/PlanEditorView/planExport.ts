import type Konva from "konva";
import type { PlanDocument, PlanEditorOptions } from "./planTypes";

export const PLAN_EXPORT_OVERLAY_NAMES = [
  "plan-editor-handles",
  "plan-editor-transformer",
  "plan-editor-selection",
  "plan-editor-guides",
  "plan-editor-measurements",
] as const;

export function isPlanExportOverlayName(name: string) {
  return PLAN_EXPORT_OVERLAY_NAMES.includes(name as (typeof PLAN_EXPORT_OVERLAY_NAMES)[number]);
}

export function exportPlanPng(stage: Konva.Stage | null, fileName = "plano.png", options?: { includeGrid?: boolean }) {
  if (!stage || typeof window === "undefined") return;
  const dataUrl = captureStage(stage, options?.includeGrid !== false);
  downloadDataUrl(dataUrl, fileName);
}

export async function exportPlanPdf(stage: Konva.Stage | null, document: PlanDocument, options?: PlanEditorOptions, subtitle = "", record?: Record<string, unknown>) {
  if (!stage || typeof window === "undefined") return;
  const exportOptions = options?.export || {};
  const title = options?.exportTitle || "Plano";
  const dataUrl = captureStage(stage, exportOptions.includeGrid === true);
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: exportOptions.pageOrientation || "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const metadataLines = getMetadataLines(exportOptions.metadataFields, record);
  const titleHeight = (exportOptions.includeLayerLegend ? 26 : 20) + metadataLines.length * 5;
  const imageWidth = pageWidth - margin * 2;
  const imageHeight = pageHeight - margin * 2 - titleHeight;

  pdf.setFontSize(14);
  pdf.text(title || "Plano", margin, margin);
  pdf.setFontSize(9);
  pdf.text(`Fecha: ${new Date().toLocaleString("es-ES")}`, pageWidth - margin, margin, { align: "right" });
  if (subtitle) pdf.text(subtitle, margin, margin + 6);
  if (document.canvas.scale) {
    pdf.text(`Escala: ${Math.round(document.canvas.scale.pixels * 100) / 100}px = ${document.canvas.scale.realValue}${document.canvas.scale.unit}${document.canvas.scale.calibratedFrom ? " (Escala calibrada)" : ""}`, margin, margin + 12);
  }
  if (exportOptions.includeLayerLegend !== false) {
    const visibleLayers = document.layers.filter((layer) => layer.visible !== false).map((layer) => layer.name).join(", ");
    pdf.text(`Capas visibles: ${visibleLayers || "-"}`, margin, margin + 18);
  }
  metadataLines.forEach((line, index) => {
    pdf.text(line, margin, margin + 24 + index * 5);
  });
  pdf.addImage(dataUrl, "PNG", margin, margin + titleHeight, imageWidth, imageHeight, undefined, "FAST");
  pdf.save(`${sanitizeFileName(title || "plano")}.pdf`);
}

export function getMetadataLines(fields: PlanEditorOptions["export"] extends infer T ? T extends { metadataFields?: infer M } ? M | undefined : never : never, record?: Record<string, unknown>) {
  if (!Array.isArray(fields) || !fields.length || !record) return [];
  return fields
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const label = "label" in item ? String(item.label || "").trim() : "";
      const field = "field" in item ? String(item.field || "").trim() : "";
      if (!label || !field) return "";
      const value = record[field];
      return `${label}: ${value === null || value === undefined ? "" : String(value)}`;
    })
    .filter(Boolean);
}

function captureStage(stage: Konva.Stage, includeGrid: boolean) {
  const gridLayer = stage.findOne(".plan-grid");
  const handlesLayer = stage.findOne(".plan-editor-handles");
  const transformer = stage.findOne(".plan-editor-transformer");
  const selection = stage.find(".plan-editor-selection");
  const guides = stage.find(".plan-editor-guides");
  const measurements = stage.find(".plan-editor-measurements");
  const wasVisible = gridLayer?.visible();
  const handlesWereVisible = handlesLayer?.visible();
  const transformerWasVisible = transformer?.visible();
  if (gridLayer && !includeGrid) gridLayer.visible(false);
  if (handlesLayer) handlesLayer.visible(false);
  if (transformer) transformer.visible(false);
  selection.forEach((node) => node.visible(false));
  guides.forEach((node) => node.visible(false));
  measurements.forEach((node) => node.visible(false));
  const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
  if (gridLayer && wasVisible !== undefined) gridLayer.visible(wasVisible);
  if (handlesLayer && handlesWereVisible !== undefined) handlesLayer.visible(handlesWereVisible);
  if (transformer && transformerWasVisible !== undefined) transformer.visible(transformerWasVisible);
  selection.forEach((node) => node.visible(true));
  guides.forEach((node) => node.visible(true));
  measurements.forEach((node) => node.visible(true));
  return dataUrl;
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function sanitizeFileName(value: string) {
  return value.trim().replace(/[^\w.-]+/g, "_") || "plano";
}
