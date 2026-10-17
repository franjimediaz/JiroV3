import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "./kill-dev-ports.mjs";

export function probeTurbo(require, run = spawnSync) {
  try {
    const cli = require.resolve("turbo/bin/turbo");
    const result = run(process.execPath, [cli, "--version"], { cwd: repoRoot, encoding: "utf8", windowsHide: true, timeout: 15_000 });
    if (result.error || result.status !== 0) return { reason: result.error?.code || `Turbo terminó con código ${result.status}` };
    return { cli, version: result.stdout.trim() };
  } catch (error) { return { reason: error.code || error.message }; }
}

export function directCommands() {
  return ["web", "docs"].map(name => {
    const cwd = resolve(repoRoot, "apps", name);
    const require = createRequire(resolve(cwd, "package.json"));
    // Read current workspace scripts so port changes are not silently ignored.
    const command = require("./package.json").scripts.dev;
    const match = /^next dev --port (\d+)$/.exec(command);
    if (!match) throw new Error(`El script dev de ${name} ha cambiado; actualiza el arranque directo.`);
    return { cwd, args: [require.resolve("next/dist/bin/next"), "dev", "--port", match[1]] };
  });
}

export async function supervise(commands) {
  const children = new Set();
  let stopping = false;
  let finish;
  const done = new Promise(resolveDone => { finish = resolveDone; });
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (!child.pid || child.exitCode !== null || child.signalCode) continue;
      if (process.platform === "win32") {
        const result = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 10_000, stdio: "ignore" });
        if (result.error) console.error(`No se pudo detener PID ${child.pid}: ${result.error.code}`);
      } else {
        try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") console.error(error.message); }
      }
    }
    process.exitCode = code;
    finish();
  };
  const onInterrupt = () => stop(130);
  const onTerminate = () => stop(143);
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  for (const command of commands) {
    const child = spawn(process.execPath, command.args, { cwd: command.cwd, stdio: "inherit", windowsHide: true, detached: process.platform !== "win32" });
    children.add(child);
    child.once("error", error => { console.error(`No se pudo arrancar: ${error.message}`); stop(1); });
    child.once("exit", code => { children.delete(child); stop(code ?? 1); });
  }
  await done;
  process.removeListener("SIGINT", onInterrupt);
  process.removeListener("SIGTERM", onTerminate);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--direct", "--check"].includes(arg))) throw new Error("Uso: dev [--direct] [--check]");
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Jiro necesita Node 22 o posterior. Se recomienda Node 22 LTS.");
  if (process.versions.node.split(".")[0] !== "22") console.warn(`Node actual: ${process.version}. Versión recomendada: Node 22 LTS.`);
  if (/onedrive/i.test(repoRoot)) console.warn("Repositorio en OneDrive: para evitar sincronización/bloqueos, se recomienda una copia en C:\\src\\JiroV3.");
  const require = createRequire(resolve(repoRoot, "package.json"));
  const turbo = probeTurbo(require);
  if (!turbo.cli) console.warn(`Turbo no está disponible (${turbo.reason}). Se usará Next directamente para web y docs.`);
  const commands = turbo.cli && !args.includes("--direct")
    ? [{ cwd: repoRoot, args: [turbo.cli, "run", "dev", "--ui=stream"] }]
    : directCommands();
  if (args.includes("--check")) {
    directCommands(); // Also verify installed Next workspaces without starting them.
    console.log(`Diagnóstico correcto. Modo: ${turbo.cli && !args.includes("--direct") ? `Turbo ${turbo.version}` : "Next directo"}.`);
    return;
  }
  await supervise(commands);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`${error.message}\nSi faltan dependencias, ejecuta pnpm install --frozen-lockfile.`); process.exitCode = 1; });
}
