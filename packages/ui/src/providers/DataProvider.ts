import type { DataProvider, AggregateInput } from "../engines/computeEngine";
import type { ModuleSchema } from "@repo/types";
import { normalizeEmptyRelations } from "@repo/types";

type ModuloRow = {
  id: string;
  slug: string;
  props: any;
};

export type CreateInput = {
  table: string;
  data: Record<string, any>;
};

export type CreateResult = {
  id: string;
  record?: any;
};

let schemaCache: Record<string, ModuleSchema> | null = null;
let schemaCacheAt = 0;
let schemaCacheVersion = 0;

export function invalidateModuleSchemaCache() {
  schemaCache = null;
  schemaCacheAt = 0;
  schemaCacheVersion++;
  schemasLoading = null;
}

function getByPath<T = unknown>(obj: unknown, path: string): T | undefined {
  return path
    .split(".")
    .reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj) as T | undefined;
}

let schemasLoading: Promise<Record<string, ModuleSchema>> | null = null;
function loadSchemas(): Promise<Record<string, ModuleSchema>> {
  if (!schemasLoading) {
    const pending = loadSchemasOnce().finally(() => { if (schemasLoading === pending) schemasLoading = null; });
    schemasLoading = pending;
  }
  return schemasLoading;
}

async function loadSchemasOnce(): Promise<Record<string, ModuleSchema>> {
  const now = Date.now();
  const version = schemaCacheVersion;
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

  if (version === schemaCacheVersion) {
    schemaCache = map;
    schemaCacheAt = now;
  }
  return map;
}

/**
 * Resuelve placeholders del tipo:
 *  - "{{id}}"
 *  - "{{cliente.id}}"
 */
function resolveTpl(v: any, record: any) {
  if (typeof v !== "string") return v;

  return v.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, keyPath) => {
    const val = getByPath(record, keyPath);
    // si falta el valor, devuelve "" para no comparar literal
    return val === undefined || val === null ? "" : String(val);
  });
}


export const dataProvider: DataProvider & {
  getSchema: (moduleSlug: string) => Promise<ModuleSchema>;
  create: (input: CreateInput) => Promise<CreateResult>;
  getOne: (moduleSlug: string, id: string) => Promise<any | null>;
} = {
  async aggregate(input: AggregateInput, record: any, _context?: Record<string, any>) {
    // 1) Resolver where usando el record actual (placeholders)
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
        where: whereResolved.map((c: any) => ({
          field: c.field,
          op: c.op,
          value: c.value,
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
        offset: input.offset,
        advancedFilters: input.advancedFilters,
        purpose: input.purpose,
        hasStyle: input.hasStyle,
        styleIconField: input.styleIconField,
        styleColorField: input.styleColorField,
      }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json?.error?.message || json?.detail || `Error consultando datos (${res.status})`);
    }

    const json = await res.json();
    if (!json?.ok) {
      throw new Error(json?.detail || "dataProvider.list error");
    }

    return { data: Array.isArray(json.data) ? json.data : [], ...(typeof json.count === "number" ? { count: json.count } : {}) };
  },

  async create(input: CreateInput): Promise<CreateResult> {
    const schemas = await loadSchemas();
    const schema = schemas[input.table] || Object.values(schemas).find(item => item.db?.table === input.table);
    const res = await fetch("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: input.table,
        data: normalizeEmptyRelations(schema?.fields || [], input.data),
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`dataProvider.create error (${res.status}): ${txt}`);
    }

    const json = await res.json();
    if (!json?.ok) {
      throw new Error(json?.detail || "dataProvider.create error");
    }

    if (!json?.id) {
      throw new Error("dataProvider.create: respuesta inválida (sin id)");
    }

    return { id: String(json.id), record: json.record };
  },

  async getSchema(moduleSlug: string): Promise<ModuleSchema> {
    const map = await loadSchemas();
    const schema = map[moduleSlug];
    if (!schema) throw new Error(`getSchema: no existe módulo con slug "${moduleSlug}"`);
    return schema;
  },
  
  async getOne(moduleSlug: string, id: string) {
  if (!id) return null;

  const list = this.list; // <- puede ser undefined según TS
  if (!list) {
    throw new Error("dataProvider.getOne: dataProvider.list no está definido");
  }

  const res = await list({
    moduleSlug,
    filters: [{ field: "id", op: "=", value: id }],
    limit: 1,
    hasStyle: false,
  } as any);

  return Array.isArray(res?.data) && res.data.length ? res.data[0] : null;
},



  
};
