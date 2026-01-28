import chromium from "@sparticuz/chromium";
import { chromium as pwChromium } from "playwright-core";

export async function htmlToPdfBuffer(html: string) {
  const browser = await pwChromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    await page.waitForTimeout(50);

    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "24px", right: "24px", bottom: "24px", left: "24px" },
    });
  } finally {
    await browser.close();
  }
}
