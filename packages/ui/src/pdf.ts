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
  assertBrowser();
  const url = buildPdfUrl({
    endpoint,
    params: { ...params, template, id },
  });
  window.location.assign(url);
}

export function downloadPdf(
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

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function openPdfInNewTab(
  template: string,
  id: string,
  endpoint = DEFAULT_PDF_ENDPOINT,
  params: PdfActionParams = {},
) {
  assertBrowser();

  const previewWindow = window.open("", "_blank");
  if (!previewWindow) {
    throw new Error(
      "El navegador bloqueó la nueva pestaña del PDF. Permite ventanas emergentes para continuar.",
    );
  }

  try {
    previewWindow.opener = null;
    previewWindow.document.title = "Generando PDF...";
    previewWindow.document.body.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #111827;">
        <h1 style="font-size: 18px; margin: 0 0 12px;">Generando PDF...</h1>
        <p style="margin: 0; line-height: 1.5;">La vista se abrirá en esta pestaña en unos segundos.</p>
      </div>
    `;
  } catch {
    // Si el navegador no permite escribir el contenido temporal, seguimos con la redirección.
  }

  const url = buildPdfUrl({
    endpoint,
    params: { ...params, template, id },
  });

  previewWindow.location.replace(url);
}
