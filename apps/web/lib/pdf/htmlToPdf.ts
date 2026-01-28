import { chromium } from "playwright";
import fs from "node:fs";

export async function htmlToPdfBuffer(html: string) {
  const browser = await chromium.launch({

    args: ["--no-sandbox", "--disable-setuid-sandbox"],

    headless: true,
  });

  try {
    const page = await browser.newPage();
    console.log(
    "Local browsers exists?",
    fs.existsSync(
      "node_modules/.pnpm/playwright-core@1.58.0/node_modules/playwright-core/.local-browsers"
    )
  );

    await page.setContent(html, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    await page.waitForTimeout(50);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true, 
      margin: { top: "24px", right: "24px", bottom: "24px", left: "24px" },
    });

    return pdf; // Buffer
  } finally {
    await browser.close();
  }
}
