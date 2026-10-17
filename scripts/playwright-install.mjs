import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
const require = createRequire(import.meta.url);
const manifest = require.resolve("playwright/package.json");
const cli = resolve(dirname(manifest), require(manifest).bin.playwright);
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--dry-run")) throw new Error("Uso: playwright-install.mjs [--dry-run]");
const result = spawnSync(process.execPath, [cli, "install", "chromium", ...args], {
  stdio: "inherit", windowsHide: true, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "0" },
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
