import type { DataProvider, AggregateInput } from "../engines/computeEngine";
import type { ModuleSchema } from "@repo/types"; // ajusta si tu path real difiere

type ModuloRow = {
  id: string;
  slug: string;
  props: any;
};

let schemaCache: Record<string, ModuleSchema> | null = null;
let schemaCacheAt = 0;

async function loadSchemas(): Promise<Record<string, ModuleSchema>> {
  // cache 60s (ajusta si quieres)
  const now = Date.now();
  if (schemaCache && now - schemaCacheAt < 60_000) return schemaCache;

  const res = await fetch("/api/modulos?flat=1", { method: "GET" });
  if (!res.ok) {
    throw new Error(`getSchema: error cargando /api/modulos (status ${res.status})`);
  }
  const json = await res.json();
  if (!json?.ok || !Array.isArray(json.data)) {
    throw new Error("getSchema: respuesta inválida de /api/modulos");
  }

  const map: Record<string, ModuleSchema> = {};
  for (const m of json.data as ModuloRow[]) {
    // props debería ser ModuleSchema
    if (m?.slug && m?.props && typeof m.props === "object") {
      map[m.slug] = m.props as ModuleSchema;
    }
  }

  schemaCache = map;
  schemaCacheAt = now;
  return map;
}

export const dataProvider: DataProvider & {
  getSchema: (moduleSlug: string) => Promise<ModuleSchema>;
} = {
  async aggregate(input: AggregateInput, record: any, _context?: Record<string, any>) {
    console.warn("[@repo/ui] aggregate STUB → reemplazar por implementación real", { input, record });
    return 0;
  },

async list(input) {
  const res = await fetch("/api/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      moduleSlug: input.moduleSlug,
      filters: input.filters,
      sort: input.sort,
      limit: input.limit,
    
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`dataProvider.list error (${res.status}): ${txt}`);
  }

  const json = await res.json();
  if (!json?.ok) {
    throw new Error(json?.detail || "dataProvider.list error");
  }

  return { data: Array.isArray(json.data) ? json.data : [] };
},

  async getSchema(moduleSlug: string): Promise<ModuleSchema> {
    const map = await loadSchemas();
    const schema = map[moduleSlug];
    if (!schema) throw new Error(`getSchema: no existe módulo con slug "${moduleSlug}"`);
    return schema;
  },
};
