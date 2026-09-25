import { readdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function discoverModulePages(root) {
  const routes = [];
  function visit(directory, segments) {
    const entries = readdirSync(directory, { withFileTypes: true });
    if (entries.some((entry) => /^page\.(tsx?|jsx?)$/.test(entry.name))) {
      if (!segments.some((segment) => segment.includes("[")))
        routes.push(`/${segments.join("/")}`);
    }
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith("_") ||
        entry.name.startsWith("@") ||
        entry.name.startsWith("(..")
      )
        continue;
      visit(
        join(directory, entry.name),
        entry.name.startsWith("(") ? segments : [...segments, entry.name],
      );
    }
  }
  visit(root, []);
  return [...new Set(routes)].filter((route) => route !== "/").sort();
}

export function generateModulePages() {
  const web = dirname(fileURLToPath(import.meta.url));
  const output = join(web, "lib/modules/pageRoutes.generated.json");
  const content =
    JSON.stringify(discoverModulePages(join(web, "app/(main)")), null, 2) +
    "\n";
  if (!existsSync(output) || readFileSync(output, "utf8") !== content)
    writeFileSync(output, content);
}
