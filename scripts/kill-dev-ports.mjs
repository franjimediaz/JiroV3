import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const repoRoot = fileURLToPath(new URL("../", import.meta.url));
export const devPorts = [3000, 3001];
const exec = (file, args) => execFileSync(file, args, { encoding: "utf8", windowsHide: true, timeout: 10_000 });

export function parseListeners(output, ports = devPorts) {
  return output.split(/\r?\n/).flatMap(line => {
    const [protocol, local, , state, pid] = line.trim().split(/\s+/);
    const port = Number(local?.split(":").at(-1));
    return protocol === "TCP" && state === "LISTENING" && ports.includes(port) && /^[1-9]\d*$/.test(pid || "")
      ? [{ port, pid: Number(pid) }] : [];
  });
}

export function ancestorPids(processes, pid) {
  const result = new Set();
  while (pid && !result.has(pid)) {
    result.add(pid);
    pid = processes.find(item => item.ProcessId === pid)?.ParentProcessId;
  }
  return result;
}

export function isRepoDevProcess(item, root, protectedPids) {
  if (!item || protectedPids.has(item.ProcessId) || !/^node(?:\.exe)?$/i.test(item.Name)) return false;
  const command = (item.CommandLine || "").replaceAll("/", "\\").toLowerCase();
  const prefix = root.replaceAll("/", "\\").replace(/\\+$/, "").toLowerCase() + "\\";
  return command.includes(prefix) && /next\\dist\\(?:bin\\next(?:\.js)?["']?\s+dev(?:\s|$)|server\\lib\\start-server(?:\.js)?)/i.test(command);
}

function processes(run) {
  const result = JSON.parse(run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine) | ConvertTo-Json -Compress"]));
  return Array.isArray(result) ? result : [result];
}

export async function freeDevPorts({ run = exec, platform = process.platform } = {}) {
  if (platform !== "win32") {
    const { createServer } = await import("node:net");
    for (const port of devPorts) await new Promise((done, reject) => {
      const server = createServer();
      server.once("error", () => reject(new Error(`Puerto ${port} ocupado. Detén su servidor antes de iniciar Jiro.`)));
      server.listen(port, () => server.close(done));
    });
    return;
  }
  const listeners = () => parseListeners(run("netstat.exe", ["-ano", "-p", "tcp"]));
  const initial = listeners();
  if (!initial.length) return;
  const snapshot = processes(run);
  const protectedPids = ancestorPids(snapshot, process.pid);
  protectedPids.add(process.ppid);
  for (const { port, pid } of initial) {
    if (!isRepoDevProcess(snapshot.find(item => item.ProcessId === pid), repoRoot, protectedPids)) {
      throw new Error(`Puerto ${port} ocupado por PID ${pid}; no se reconoce como Next de este repositorio. Detén ese proceso manualmente.`);
    }
  }
  for (const pid of new Set(initial.map(item => item.pid))) {
    if (!listeners().some(item => item.pid === pid)) continue;
    const current = processes(run);
    const owner = current.find(item => item.ProcessId === pid);
    // Stopping one workspace may make its supervisor stop the other meanwhile.
    if (!owner && !listeners().some(item => item.pid === pid)) continue;
    if (!isRepoDevProcess(owner, repoRoot, ancestorPids(current, process.pid))) {
      throw new Error(`Cambió el propietario del PID ${pid}; se cancela la parada.`);
    }
    try { run("taskkill.exe", ["/PID", String(pid), "/T", "/F"]); }
    catch (error) { if (listeners().some(item => item.pid === pid)) throw error; }
    console.log(`Detenido Next de Jiro: PID ${pid}`);
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!listeners().length) return;
    await delay(250);
  }
  throw new Error("Los puertos 3000/3001 siguen ocupados después de esperar; se cancela el arranque.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  freeDevPorts().catch(error => { console.error(error.message); process.exitCode = 1; });
}
