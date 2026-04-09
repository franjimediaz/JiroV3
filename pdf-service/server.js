import express from "express";
import { chromium } from "playwright";
import { createRequire } from "node:module";

const app = express();
app.use(express.json({ limit: "5mb" }));

const SERVICE_SECRET = process.env.PDF_SERVICE_SECRET;
const require = createRequire(import.meta.url);
const { version: playwrightVersion } = require("playwright/package.json");

function buildLaunchOptions() {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined;
  const options = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };

  if (executablePath) {
    return { ...options, executablePath };
  }

  return options;
}

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    environment: process.env.NODE_ENV || "development",
    platform: process.platform,
    playwrightVersion,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() ||
      "playwright-managed",
  }),
);

app.post("/generate", async (req, res) => {
  try {
    const auth = req.headers["authorization"] || "";
    if (!SERVICE_SECRET || auth !== `Bearer ${SERVICE_SECRET}`) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const {
      html,
      filename = "documento.pdf",
      disposition = "inline",
    } = req.body || {};
    if (!html || typeof html !== "string") {
      return res.status(400).json({ ok: false, error: "html requerido" });
    }

    const launchOptions = buildLaunchOptions();
    console.info("PDF service launch config", {
      environment: process.env.NODE_ENV || "development",
      platform: process.platform,
      playwrightVersion,
      executablePath: launchOptions.executablePath || "playwright-managed",
      hasServiceSecret: Boolean(SERVICE_SECRET),
    });

    let browser;
    try {
      browser = await chromium.launch(launchOptions);
    } catch (error) {
      console.error("PDF service browser launch failed", {
        environment: process.env.NODE_ENV || "development",
        platform: process.platform,
        playwrightVersion,
        executablePath: launchOptions.executablePath || "playwright-managed",
        errorMessage: error?.message || String(error),
        errorStack: error?.stack || null,
      });
      throw error;
    }

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
      await page.waitForTimeout(50);

      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "24px", right: "24px", bottom: "24px", left: "24px" },
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${filename}"`,
      );
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(pdf);
    } finally {
      await browser?.close();
    }
  } catch (e) {
    console.error("PDF SERVICE ERROR:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Error",
      details: {
        environment: process.env.NODE_ENV || "development",
        platform: process.platform,
        playwrightVersion,
        executablePath:
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() ||
          "playwright-managed",
      },
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`PDF service listening on ${port}`));
