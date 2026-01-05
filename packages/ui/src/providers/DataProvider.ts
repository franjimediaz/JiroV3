import type { DataProvider, AggregateInput } from "../engines/computeEngine";
import type { ModuleSchema } from "@repo/types";

type ModuloRow = {
  id: string;
  slug: string;
  props: any;
};

let schemaCache: Record<string, ModuleSchema> | null = null;
let schemaCacheAt = 0;

async function loadSchemas(): Promise<Record<string, ModuleSchema>> {
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
    if (m?.slug && m?.props && typeof m.props === "object") {
      map[m.slug] = m.props as ModuleSchema;
    }
  }

  schemaCache = map;
  schemaCacheAt = now;
  return map;
}

function resolveTpl(v: any, record: any) {
  if (typeof v !== "string") return v;
  return v.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, key) => {
    const val = record?.[key];
    // IMPORTANTE: si falta el valor, devuelve null para que el where no compare con "id" literal
    return val === undefined || val === null ? "" : String(val);
  });
}

export const dataProvider: DataProvider & {
  getSchema: (moduleSlug: string) => Promise<ModuleSchema>;
} = {
  async aggregate(input: AggregateInput, record: any, _context?: Record<string, any>) {
    
    // 1) Resolver where usando el record actual
    const whereResolved = (input.where || []).map((c: any) => ({
      ...c,
      value: resolveTpl(c.value, record),
    }));

    // 2) Llamar al endpoint
    const res = await fetch("/api/aggregate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sourceTable: input.sourceTable, // ej: "materialstask"
    field: input.field,             // ej: "total"
    op: input.op,                   // ej: "sum"
    where: (input.where || []).map((c) => ({
      field: c.field,
      op: c.op,
      // 🔑 resolver placeholders ANTES de enviar
      value: typeof c.value === "string"
        ? c.value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => record?.[k] ?? null)
        : c.value,
    })),
  }),
});

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`dataProvider.aggregate error (${res.status}): ${txt}`);
    }

    const json = await res.json();
    if (!json?.ok) {
      throw new Error(json?.detail || "dataProvider.aggregate error");
    }

    return Number(json.value ?? 0);
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
        hasStyle: input.hasStyle,
        styleIconField: input.styleIconField,
        styleColorField: input.styleColorField,
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
