import { chromium } from "playwright";

export async function htmlToPdfBuffer(html: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "24px", right: "24px", bottom: "24px", left: "24px" },
  });

  await browser.close();
  return pdf;
}
