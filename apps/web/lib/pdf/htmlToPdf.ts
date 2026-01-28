import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export async function htmlToPdfBuffer(html: string) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true, // ← usa boolean normal
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "load",
      timeout: 30_000,
    });

    await new Promise((r) => setTimeout(r, 50));

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "24px",
        right: "24px",
        bottom: "24px",
        left: "24px",
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
