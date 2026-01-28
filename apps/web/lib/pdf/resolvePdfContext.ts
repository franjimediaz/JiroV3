import { createClient } from "@/lib/supabase/server";


type RelatedSpec = {
  key: string;
  table: string;
  fkField: string;
};

type LabelResolver = {
  // en qué array (record o related.KEY) hay que aplicar la resolución
  in: "record" | "related";
  relatedKey?: string;        // si in=related
  // campo que es UUID en la fila (ej: "service")
  field: string;
  // tabla donde buscar el label (ej: "servicios_config" o "services")
  refTable: string;
  // campo id en la tabla de referencia (normalmente "id")
  refIdField?: string;
  // campo label en la tabla de referencia (ej: "nombre" o "title")
  refLabelField: string;
  // nombre del campo resultante (default: `${field}__label`)
  outField?: string;
};

type ResolveArgs = {
  sourceTable: string;
  recordId: string;
  related?: RelatedSpec[];
  labelResolvers?: LabelResolver[];
};

async function addLabelsToRows(args: {
  supabase: any;
  rows: any[];
  resolver: LabelResolver;
}) {
  const { supabase, rows, resolver } = args;
  const refIdField = resolver.refIdField ?? "id";
  const outField = resolver.outField ?? `${resolver.field}__label`;

  // ids únicos
  const ids = Array.from(
    new Set(
      (rows || [])
        .map((r) => r?.[resolver.field])
        .filter((v) => typeof v === "string" && v.length > 0)
    )
  );

  if (!ids.length) return rows;

  const { data, error } = await supabase
    .from(resolver.refTable)
    .select(`${refIdField},${resolver.refLabelField}`)
    .in(refIdField, ids);

  if (error) {
    // No petamos el PDF por esto; devolvemos sin labels
    console.warn(`resolvePdfContext: labelResolver error (${resolver.refTable}):`, error.message);
    return rows;
  }

  const map = new Map<string, string>();
  for (const x of data || []) {
    const k = String((x as any)?.[refIdField] ?? "");
    const v = String((x as any)?.[resolver.refLabelField] ?? "");
    if (k) map.set(k, v);
  }

  return (rows || []).map((r) => {
    const id = r?.[resolver.field];
    const label = typeof id === "string" ? map.get(id) : undefined;
    return label ? { ...r, [outField]: label } : r;
  });
}


// Helpers
function isUuidLike(v: any) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function fetchLabelsBatch(params: {
  table: string;
  ids: string[];
  labelField: string;
}) {
  // Llama a tu route (ver más abajo) para centralizar permisos/selección
  const res = await fetch("/api/dp/labels", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });

  const json = await res.json();
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "No se pudo resolver labels");
  }
  return (json.map || {}) as Record<string, string>;
}

async function enrichRowsWithLabels(
  rows: any[],
  specs: Array<{ field: string; table: string; labelField: string }>
) {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(specs) || specs.length === 0) {
    return rows;
  }

  // Recolecta IDs por (table,labelField) para hacer batch
  const groups = new Map<string, { table: string; labelField: string; ids: Set<string> }>();

  for (const s of specs) {
    const key = `${s.table}__${s.labelField}`;
    if (!groups.has(key)) groups.set(key, { table: s.table, labelField: s.labelField, ids: new Set() });

    for (const r of rows) {
      const id = r?.[s.field];
      if (isUuidLike(id)) groups.get(key)!.ids.add(id);
    }
  }

  // Carga mapas
  const mapsByKey = new Map<string, Record<string, string>>();
  for (const [k, g] of groups.entries()) {
    const ids = Array.from(g.ids);
    if (ids.length === 0) {
      mapsByKey.set(k, {});
      continue;
    }
    const map = await fetchLabelsBatch({ table: g.table, ids, labelField: g.labelField });
    mapsByKey.set(k, map);
  }

  // Inyecta __label en cada fila
  for (const r of rows) {
    for (const s of specs) {
      const id = r?.[s.field];
      if (!isUuidLike(id)) continue;

      const key = `${s.table}__${s.labelField}`;
      const map = mapsByKey.get(key) || {};
      r[`${s.field}__label`] = map[id] || id; // fallback
    }
  }

  return rows;
}

async function enrichRecordWithLabels(
  record: any,
  specs: Array<{ field: string; table: string; labelField: string }>
) {
  if (!record || !Array.isArray(specs) || specs.length === 0) return record;

  // Reutilizamos enrichRowsWithLabels tratando el record como array de 1
  const arr = [record];
  await enrichRowsWithLabels(arr, specs);
  return arr[0];
}

export async function resolvePdfContext(args: ResolveArgs) {
  const supabase = await createClient();

  // 1) Registro principal
  const { data: record, error: e1 } = await supabase
    .from(args.sourceTable)
    .select("*")
    .eq("id", args.recordId)
    .maybeSingle();

  if (e1) throw new Error(`resolvePdfContext: error record: ${e1.message}`);
  if (!record) throw new Error(`resolvePdfContext: record no encontrado (${args.sourceTable} id=${args.recordId})`);

  // 2) Relaciones
  const related: Record<string, any[]> = {};
  for (const r of args.related || []) {
    const { data, error } = await supabase
      .from(r.table)
      .select("*")
      .eq(r.fkField, args.recordId);

    if (error) throw new Error(`resolvePdfContext: error related ${r.key}: ${error.message}`);
    related[r.key] = Array.isArray(data) ? data : [];
  }

  // 3) Branding
  const { data: branding } = await supabase
    .from("branding")
    .select("*")
    .limit(1)
    .maybeSingle();

  // 4) ✅ Aplicar labelResolvers (si vienen)
  if (Array.isArray(args.labelResolvers)) {
    for (const lr of args.labelResolvers) {
      if (!lr || typeof lr !== "object") continue;

      if (lr.in === "record") {
        const rows = await addLabelsToRows({ supabase, rows: [record], resolver: lr });
        // rows[0] puede ser el mismo record o uno enriquecido
        if (rows?.[0]) Object.assign(record, rows[0]);
      }

      if (lr.in === "related" && lr.relatedKey) {
        const key = lr.relatedKey;
        const arr = related[key] || [];
        related[key] = await addLabelsToRows({ supabase, rows: arr, resolver: lr });
      }
    }
  }

  return {
    record,
    related,
    branding: branding || {},
    now: new Date().toISOString(),
  };
}
