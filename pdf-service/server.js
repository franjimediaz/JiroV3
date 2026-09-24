import express from "express";
import { chromium } from "playwright";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import net from "node:net";

const app = express();
app.use(express.json({ limit: process.env.PDF_MAX_BODY_SIZE || "1mb" }));

const SERVICE_SECRET = process.env.PDF_SERVICE_SECRET;
const require = createRequire(import.meta.url);
const { version: playwrightVersion } = require("playwright/package.json");
const MAX_HTML_BYTES = Number(process.env.PDF_MAX_HTML_BYTES || 750_000);
const JOB_TIMEOUT_MS = Number(process.env.PDF_JOB_TIMEOUT_MS || 30_000);
const MAX_CONCURRENT_JOBS = Number(process.env.PDF_MAX_CONCURRENT_JOBS || 2);
const ALLOWED_RESOURCE_HOSTS = (process.env.PDF_ALLOWED_RESOURCE_HOSTS || "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);
let activeJobs = 0;

function buildLaunchOptions() {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined;
  const options = {
    headless: true,
    args: process.env.PDF_DISABLE_CHROMIUM_SANDBOX === "1" ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
  };

  if (executablePath) {
    return { ...options, executablePath };
  }

  return options;
}

function timingSafeBearer(authHeader) {
  if (!SERVICE_SECRET || typeof authHeader !== "string") return false;
  const expected = `Bearer ${SERVICE_SECRET}`;
  const actualBuffer = Buffer.from(authHeader);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function sanitizeFilename(filename) {
  const safe = String(filename || "documento.pdf")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}

function sanitizeDisposition(disposition) {
  return disposition === "attachment" ? "attachment" : "inline";
}

function isPrivateIp(hostname) {
  const ipVersion = net.isIP(hostname);
  if (!ipVersion) return false;
  if (hostname === "::1" || hostname === "0.0.0.0") return true;
  if (ipVersion === 4) {
    const [a, b] = hostname.split(".").map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return hostname.toLowerCase().startsWith("fc") || hostname.toLowerCase().startsWith("fd") || hostname.toLowerCase().startsWith("fe80");
}

function isAllowedResourceUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "data:" || parsed.protocol === "blob:") return true;
    if (!["https:"].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (["localhost", "0.0.0.0"].includes(hostname) || isPrivateIp(hostname)) return false;
    return ALLOWED_RESOURCE_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

async function withTimeout(work, ms) {
  let timeout;
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("PDF job timed out")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
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
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    res.setHeader("Retry-After", "10");
    return res.status(429).json({ ok: false, error: "Too many requests" });
  }
  activeJobs += 1;

  try {
    const auth = req.headers["authorization"] || "";
    if (!timingSafeBearer(auth)) {
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
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      return res.status(413).json({ ok: false, error: "html demasiado grande" });
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
      const context = await browser.newContext({
        javaScriptEnabled: process.env.PDF_ENABLE_JAVASCRIPT === "1",
      });
      await context.route("**/*", async (route) => {
        const url = route.request().url();
        if (isAllowedResourceUrl(url)) return route.continue();
        return route.abort();
      });
      const page = await context.newPage();
      const pdf = await withTimeout(async () => {
        await page.setContent(html, { waitUntil: "load", timeout: JOB_TIMEOUT_MS });
        await page.waitForTimeout(50);
        return page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: "24px", right: "24px", bottom: "24px", left: "24px" },
        });
      }, JOB_TIMEOUT_MS + 2_000);
      await context.close();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `${sanitizeDisposition(disposition)}; filename="${sanitizeFilename(filename)}"`,
      );
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(pdf);
    } finally {
      await browser?.close();
    }
  } catch (e) {
    console.error("PDF SERVICE ERROR:", {
      message: e?.message || String(e),
      environment: process.env.NODE_ENV || "development",
      platform: process.platform,
      playwrightVersion,
    });
    return res.status(500).json({
      ok: false,
      error: "Error generando PDF",
    });
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`PDF service listening on ${port}`));
