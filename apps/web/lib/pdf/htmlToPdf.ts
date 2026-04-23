import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser, type PDFOptions } from "puppeteer-core";
import fs from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";

type LaunchConfig = {
  args: string[];
  executablePath: string;
  headless: true;
  strategy: "sparticuz" | "system-browser";
};

const PDF_PAGE_TIMEOUT_MS = 30_000;
const PDF_RENDER_DELAY_MS = 50;
const PDF_OPTIONS: PDFOptions = {
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  margin: {
    top: "24px",
    right: "24px",
    bottom: "24px",
    left: "24px",
  },
};

function fileExists(path?: string | null) {
  return !!path && fs.existsSync(path);
}

function findLocalBrowserExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    process.env.CHROMIUM_PATH,
    process.env.EDGE_BIN,
    process.platform === "win32"
      ? `${process.env.PROGRAMFILES || "C:\\Program Files"}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
    process.platform === "win32"
      ? `${process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)"}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
    process.platform === "win32"
      ? `${process.env.PROGRAMFILES || "C:\\Program Files"}\\Microsoft\\Edge\\Application\\msedge.exe`
      : null,
    process.platform === "win32"
      ? `${process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)"}\\Microsoft\\Edge\\Application\\msedge.exe`
      : null,
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : null,
    process.platform === "darwin"
      ? "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
      : null,
  ];

  return candidates.find((candidate) => fileExists(candidate)) || null;
}

function shouldLogPdfTimings() {
  return process.env.PDF_TIMING_LOGS === "1";
}

function logPdfTiming(label: string, startedAt: number) {
  if (!shouldLogPdfTimings()) return;
  console.info(`[pdf] ${label}: ${Math.round(performance.now() - startedAt)}ms`);
}

async function resolveLaunchConfig(): Promise<LaunchConfig> {
  const platform = process.platform;
  const envExecutablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || null;
  const localExecutablePath = findLocalBrowserExecutable();
  const useSparticuz =
    platform === "linux" && !envExecutablePath && !localExecutablePath;

  if (useSparticuz) {
    const executablePath = await chromium.executablePath();
    return {
      args: chromium.args,
      executablePath,
      headless: true,
      strategy: "sparticuz",
    };
  }

  const executablePath = envExecutablePath || localExecutablePath;
  if (!executablePath) {
    throw new Error(
      `No local browser executable found for PDF fallback on ${platform}. ` +
        "Set PUPPETEER_EXECUTABLE_PATH or install Chrome/Edge.",
    );
  }

  return {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath,
    headless: true,
    strategy: "system-browser",
  };
}

type PdfGlobals = typeof globalThis & {
  __pdfBrowserPromise?: Promise<Browser> | null;
  __pdfLaunchConfigPromise?: Promise<LaunchConfig> | null;
};

const pdfGlobals = globalThis as PdfGlobals;

function resetSharedBrowser() {
  pdfGlobals.__pdfBrowserPromise = null;
}

async function getLaunchConfigCached() {
  if (!pdfGlobals.__pdfLaunchConfigPromise) {
    pdfGlobals.__pdfLaunchConfigPromise = resolveLaunchConfig();
  }
  return pdfGlobals.__pdfLaunchConfigPromise;
}

async function launchBrowserFresh() {
  const launchConfig = await getLaunchConfigCached();

  console.info("PDF local fallback launch config", {
    environment: process.env.NODE_ENV || "development",
    platform: process.platform,
    hostname: os.hostname(),
    strategy: launchConfig.strategy,
    executablePath: launchConfig.executablePath,
  });

  try {
    const browser = await puppeteer.launch({
      args: launchConfig.args,
      executablePath: launchConfig.executablePath,
      headless: launchConfig.headless,
    });

    browser.on("disconnected", () => {
      resetSharedBrowser();
    });

    return browser;
  } catch (error: any) {
    console.error("PDF local fallback launch failed", {
      environment: process.env.NODE_ENV || "development",
      platform: process.platform,
      strategy: launchConfig.strategy,
      executablePath: launchConfig.executablePath,
      errorMessage: error?.message || String(error),
      errorStack: error?.stack || null,
    });
    resetSharedBrowser();
    throw error;
  }
}

async function getBrowser(forceFresh = false) {
  if (forceFresh) {
    resetSharedBrowser();
  }

  if (!pdfGlobals.__pdfBrowserPromise) {
    pdfGlobals.__pdfBrowserPromise = launchBrowserFresh();
  }

  try {
    const browser = await pdfGlobals.__pdfBrowserPromise;
    if (!browser.connected) {
      resetSharedBrowser();
      if (!forceFresh) {
        return getBrowser(true);
      }
      throw new Error("No se pudo mantener una instancia activa de Chromium.");
    }
    return browser;
  } catch (error) {
    resetSharedBrowser();
    throw error;
  }
}

async function renderPdfWithBrowser(html: string, forceFreshBrowser = false) {
  const browser = await getBrowser(forceFreshBrowser);
  const page = await browser.newPage();

  try {
    page.setDefaultNavigationTimeout(PDF_PAGE_TIMEOUT_MS);
    page.setDefaultTimeout(PDF_PAGE_TIMEOUT_MS);

    await page.setContent(html, {
      waitUntil: "load",
      timeout: PDF_PAGE_TIMEOUT_MS,
    });

    await new Promise((resolve) => setTimeout(resolve, PDF_RENDER_DELAY_MS));

    const pdf = await page.pdf(PDF_OPTIONS);
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function htmlToPdfBuffer(html: string) {
  const startedAt = performance.now();

  try {
    try {
      return await renderPdfWithBrowser(html, false);
    } catch {
      resetSharedBrowser();
      return await renderPdfWithBrowser(html, true);
    }
  } finally {
    logPdfTiming("htmlToPdfBuffer", startedAt);
  }
}
