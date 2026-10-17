import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve, toNamespacedPath } from "node:path";
import { fileURLToPath } from "node:url";
import { freeDevPorts, repoRoot } from "./kill-dev-ports.mjs";

export function inside(root, target) {
  const path = relative(root, target);
  return path !== "" && path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(path);
}

async function entries(path) {
  try { return await readdir(path, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}

export async function cleanTargets(root) {
  const targets = [resolve(root, "node_modules"), resolve(root, ".turbo")];
  async function visit(directory) {
    for (const entry of await entries(directory)) {
      const path = resolve(directory, entry.name);
      if (["node_modules", ".next", ".turbo"].includes(entry.name)) targets.push(path);
      else if (entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith(".")) await visit(path);
    }
  }
  for (const name of ["apps", "packages", "pdf-service"]) {
    const path = resolve(root, name);
    const stat = await lstat(path).catch(error => { if (error.code !== "ENOENT") throw error; });
    if (stat?.isDirectory() && !stat.isSymbolicLink()) await visit(path);
  }
  return targets;
}

export async function removeTarget(root, target, remove = rm) {
  const canonicalRoot = await realpath(root);
  if (!inside(canonicalRoot, resolve(target))) throw new Error(`Ruta fuera del repositorio: ${target}`);
  // Resolve the parent, not the target: unlink junctions rather than following them.
  let parent;
  try { parent = await realpath(resolve(target, "..")); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (parent !== canonicalRoot && !inside(canonicalRoot, parent)) throw new Error(`Padre fuera del repositorio: ${target}`);
  try { await remove(toNamespacedPath(target), { recursive: true, force: true, maxRetries: 6, retryDelay: 250 }); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

export async function cleanInstall({ dryRun = false } = {}) {
  const root = await realpath(repoRoot);
  const targets = await cleanTargets(root);
  if (!dryRun) await freeDevPorts();
  const failures = [];
  for (const target of targets) {
    console.log(`${dryRun ? '[simulación]' : '[limpieza]'} ${target}`);
    if (dryRun) continue;
    try { await removeTarget(root, target); }
    catch (error) { failures.push(`${target}: ${error.code || error.message}`); }
  }
  if (failures.length) throw new Error(`No se pudieron eliminar:\n${failures.join("\n")}\nCierra servidores y herramientas que usen estas rutas, pausa la sincronización de OneDrive y vuelve a ejecutar clean:install. No se ha reinstalado nada.`);
  if (!dryRun) console.log("Limpieza terminada. Ejecuta pnpm install --frozen-lockfile y después pnpm run dev.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--dry-run")) { console.error("Uso: node scripts/clean-install.mjs [--dry-run]"); process.exitCode = 1; }
  else cleanInstall({ dryRun: args.includes("--dry-run") }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
