"use client";

export type PdfQueryValue = unknown;
export type PdfActionParams = Record<string, PdfQueryValue>;

type PdfNavigationOptions = {
  endpoint?: string;
  params: PdfActionParams;
};

const DEFAULT_PDF_ENDPOINT = "/api/pdf/generate";

function assertBrowser() {
  if (typeof window === "undefined") {
    throw new Error("Las acciones PDF solo se pueden usar en el navegador.");
  }
}

function setPdfSearchParams(url: URL, params: PdfActionParams) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  if (!url.searchParams.has("t")) {
    url.searchParams.set("t", String(Date.now()));
  }
}

export function buildPdfUrl({ endpoint = DEFAULT_PDF_ENDPOINT, params }: PdfNavigationOptions) {
  assertBrowser();
  const url = new URL(endpoint, window.location.origin);
  setPdfSearchParams(url, params);
  return url.toString();
}

export function openPdfInSameTab(
  template: string,
  id: string,
  endpoint = DEFAULT_PDF_ENDPOINT,
  params: PdfActionParams = {},
) {
  return downloadPdf(template, id, endpoint, params);
}

export async function downloadPdf(
  template: string,
  id: string,
  endpoint = DEFAULT_PDF_ENDPOINT,
  params: PdfActionParams = {},
) {
  assertBrowser();
  const url = buildPdfUrl({
    endpoint,
    params: { ...params, template, id, download: 1 },
  });

  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || payload?.message || "No se pudo generar el PDF");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `${template}-${id}.pdf`;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function openPdfInNewTab(
  template: string,
  id: string,
  endpoint = DEFAULT_PDF_ENDPOINT,
  params: PdfActionParams = {},
) {
  return downloadPdf(template, id, endpoint, params);
}
