import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import os from "node:os";

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

async function resolveLaunchConfig() {
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
      headless: true as const,
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
    headless: true as const,
    strategy: "system-browser",
  };
}

export async function htmlToPdfBuffer(html: string) {
  const launchConfig = await resolveLaunchConfig();
  console.info("PDF local fallback launch config", {
    environment: process.env.NODE_ENV || "development",
    platform: process.platform,
    hostname: os.hostname(),
    strategy: launchConfig.strategy,
    executablePath: launchConfig.executablePath,
  });

  let browser;
  try {
    browser = await puppeteer.launch({
      args: launchConfig.args,
      executablePath: launchConfig.executablePath,
      headless: launchConfig.headless,
    });
  } catch (error: any) {
    console.error("PDF local fallback launch failed", {
      environment: process.env.NODE_ENV || "development",
      platform: process.platform,
      strategy: launchConfig.strategy,
      executablePath: launchConfig.executablePath,
      errorMessage: error?.message || String(error),
      errorStack: error?.stack || null,
    });
    throw error;
  }

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
    await browser?.close();
  }
}
