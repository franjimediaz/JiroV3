import { chromium } from "playwright";

export async function htmlToPdfBuffer(html: string) {
  const browser = await chromium.launch({
    // En muchos entornos (Docker/CI) esto evita errores de sandbox
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    // headless por defecto; puedes forzarlo:
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // Si tu HTML pudiera cargar recursos externos, networkidle puede “colgarse”.
    // "load" es más predecible.
    await page.setContent(html, {
      waitUntil: "load",
      timeout: 30_000,
    });

    // Extra: espera un frame para que el layout se asiente
    await page.waitForTimeout(50);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true, // si más adelante metes @page size/margins, lo respeta
      margin: { top: "24px", right: "24px", bottom: "24px", left: "24px" },
    });

    return pdf; // Buffer
  } finally {
    await browser.close();
  }
}
