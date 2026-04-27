import type Konva from "konva";
import type { PlanDocument, PlanEditorOptions } from "./planTypes";

export function exportPlanPng(stage: Konva.Stage | null, fileName = "plano.png", options?: { includeGrid?: boolean }) {
  if (!stage || typeof window === "undefined") return;
  const dataUrl = captureStage(stage, options?.includeGrid !== false);
  downloadDataUrl(dataUrl, fileName);
}

export async function exportPlanPdf(stage: Konva.Stage | null, document: PlanDocument, options?: PlanEditorOptions, subtitle = "") {
  if (!stage || typeof window === "undefined") return;
  const exportOptions = options?.export || {};
  const title = options?.exportTitle || "Plano";
  const dataUrl = captureStage(stage, exportOptions.includeGrid === true);
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: exportOptions.pageOrientation || "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const titleHeight = exportOptions.includeLayerLegend ? 26 : 20;
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
  pdf.addImage(dataUrl, "PNG", margin, margin + titleHeight, imageWidth, imageHeight, undefined, "FAST");
  pdf.save(`${sanitizeFileName(title || "plano")}.pdf`);
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
