import type Konva from "konva";

export function exportPlanPng(stage: Konva.Stage | null, fileName = "plano.png") {
  if (!stage || typeof window === "undefined") return;
  const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
  downloadDataUrl(dataUrl, fileName);
}

export async function exportPlanPdf(stage: Konva.Stage | null, title = "Plano") {
  if (!stage || typeof window === "undefined") return;
  const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const titleHeight = 12;
  const imageWidth = pageWidth - margin * 2;
  const imageHeight = pageHeight - margin * 2 - titleHeight;

  pdf.setFontSize(14);
  pdf.text(title || "Plano", margin, margin);
  pdf.setFontSize(9);
  pdf.text(new Date().toLocaleString("es-ES"), pageWidth - margin, margin, { align: "right" });
  pdf.addImage(dataUrl, "PNG", margin, margin + titleHeight, imageWidth, imageHeight, undefined, "FAST");
  pdf.save(`${sanitizeFileName(title || "plano")}.pdf`);
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
