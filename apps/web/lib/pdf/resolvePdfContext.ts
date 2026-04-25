import { createClient } from "@/lib/supabase/server";
import type { ModuleSchema } from "@repo/types";
import { resolvePdfDatasets } from "./resolvePdfDatasets";

type RelatedSpec = {
  key: string;
  table: string;
  fkField: string;
};

type LabelResolver = {
  in: "record" | "related";
  relatedKey?: string;
  field: string;
  refTable: string;
  refIdField?: string;
  refLabelField: string;
  outField?: string;
};

type ResolveArgs = {
  sourceTable: string;
  recordId: string;
  related?: RelatedSpec[];
  labelResolvers?: LabelResolver[];
  recordOverride?: Record<string, any> | null;
  template?: any;
};

type AnyObj = Record<string, any>;

type ResolveRunCache = {
  schemaBySlug: Map<string, Promise<ModuleSchema>>;
  rowByTableAndId: Map<string, Promise<any | null>>;
  childrenByTableFkAndParent: Map<string, Promise<any[]>>;
  labelValuesByGroup: Map<string, Map<string, string>>;
  labelLoadsByGroup: Map<string, Promise<void>>;
};

type InverseRef = {
  childModule: string;
  fkField: string;
  alias: string;
};

function createResolveRunCache(): ResolveRunCache {
  return {
    schemaBySlug: new Map(),
    rowByTableAndId: new Map(),
    childrenByTableFkAndParent: new Map(),
    labelValuesByGroup: new Map(),
    labelLoadsByGroup: new Map(),
  };
}

function getSchemaFields(schema: ModuleSchema): any[] {
  const s: any = schema as any;

  if (Array.isArray(s.fields)) return s.fields;
  if (Array.isArray(s.campos)) return s.campos;
  if (Array.isArray(s.props?.fields)) return s.props.fields;

  return [];
}

function inferAliasFromFieldName(name: string) {
  if (name.endsWith("Id") && name.length > 2) return name.slice(0, -2);
  return name;
}

function getRefFromField(
  field: any,
): { moduleSlug?: string; displayField?: string } | null {
  const f = field ?? {};
  const ref = f.ref ?? f.selector?.ref ?? null;
  if (!ref) return null;

  const moduleSlug =
    ref.moduleSlug ?? ref.slug ?? ref.table ?? ref.module ?? undefined;
  const displayField =
    ref.displayField ?? ref.labelField ?? ref.display ?? undefined;

  if (!moduleSlug) return null;
  return { moduleSlug, displayField };
}

function firstNonEmptyString(...values: any[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function pickNestedValue(source: any, paths: string[]) {
  for (const path of paths) {
    const parts = path.split(".").filter(Boolean);
    let current = source;

    for (const part of parts) {
      if (current == null) break;
      if (Array.isArray(current) && /^\d+$/.test(part)) {
        current = current[Number(part)];
      } else {
        current = current?.[part];
      }
    }

    const value = firstNonEmptyString(current);
    if (value) return value;
  }

  return "";
}

function tryParseJsonString(value: any) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function buildPublicStorageUrl(bucket: string, path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !bucket || !path) return "";
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

function extractAssetUrl(raw: any, depth = 0): string {
  if (depth > 4 || raw == null) return "";

  const parsed = tryParseJsonString(raw);
  if (parsed !== raw) return extractAssetUrl(parsed, depth + 1);

  if (typeof parsed === "string") {
    const value = parsed.trim();
    if (!value) return "";

    if (
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("/") ||
      value.startsWith("data:image/")
    ) {
      return value;
    }

    return "";
  }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const url = extractAssetUrl(item, depth + 1);
      if (url) return url;
    }
    return "";
  }

  if (typeof parsed === "object") {
    const candidates = [
      parsed.url,
      parsed.publicUrl,
      parsed.public_url,
      parsed.signedUrl,
      parsed.signed_url,
      parsed.logoUrl,
      parsed.logo_url,
      parsed.firmaUrl,
      parsed.firma_url,
      parsed.signatureUrl,
      parsed.signature_url,
      parsed.imageUrl,
      parsed.image_url,
      parsed.src,
      parsed.href,
      parsed.logo,
      parsed.firma,
      parsed.signature,
      parsed.file,
      parsed.asset,
      parsed.value,
    ];

    for (const candidate of candidates) {
      const url = extractAssetUrl(candidate, depth + 1);
      if (url) return url;
    }

    const bucket = firstNonEmptyString(
      parsed.bucket,
      parsed.storageBucket,
      parsed.storage_bucket,
    );
    const path = firstNonEmptyString(
      parsed.path,
      parsed.storagePath,
      parsed.storage_path,
      parsed.key,
      parsed.filename,
    );

    if (bucket && path) {
      return buildPublicStorageUrl(bucket, path);
    }
  }

  return "";
}

export function normalizeBranding(raw: any) {
  const branding = raw && typeof raw === "object" ? { ...raw } : {};

  const nombre = firstNonEmptyString(
    branding.nombre,
    branding.razonSocial,
    branding.razon_social,
    branding.companyName,
    branding.name,
  );
  const cif = firstNonEmptyString(
    branding.cif,
    branding.nif,
    branding.vat,
    branding.vatNumber,
  );
  const direccion = firstNonEmptyString(
    branding.direccion,
    branding.address,
    branding.domicilio,
    branding.direccionFiscal,
    branding.street,
  );
  const telefono = firstNonEmptyString(
    branding.telefono,
    branding.phone,
    branding.telefono1,
    branding.mobile,
  );
  const email = firstNonEmptyString(
    branding.email,
    branding.correo,
    branding.mail,
  );
  const logoUrl =
    extractAssetUrl(
      branding.logoUrl ||
        branding.logo ||
        branding.logo_url ||
        branding.imageUrl ||
        branding.image_url ||
        branding.imagen ||
        branding.image ||
        branding.logoFile ||
        branding.logo_file,
    ) ||
    firstNonEmptyString(
      branding.logoUrl,
      branding.logo,
      branding.logo_url,
      branding.imageUrl,
      branding.image_url,
      branding.imagen,
    );
  const firmaUrl =
    extractAssetUrl(
      branding.firmaUrl ||
        branding.firma ||
        branding.firma_url ||
        branding.signatureUrl ||
        branding.signature_url ||
        branding.signature ||
        branding.signatureFile ||
        branding.signature_file ||
        branding.firmaFile ||
        branding.firma_file,
    ) ||
    firstNonEmptyString(
      branding.firmaUrl,
      branding.firma,
      branding.firma_url,
      branding.signatureUrl,
      branding.signature_url,
      branding.signature,
    );
  const website = firstNonEmptyString(
    branding.website,
    branding.web,
    branding.url,
    branding.sitioWeb,
  );
  const primaryColor = firstNonEmptyString(
    branding.primaryColor,
    branding.colorPrincipal,
    branding.mainColor,
    branding.color,
  );

  return {
    ...branding,
    nombre,
    razonSocial: firstNonEmptyString(
      branding.razonSocial,
      branding.razon_social,
      nombre,
    ),
    cif,
    direccion,
    telefono,
    email,
    website,
    logo: logoUrl,
    logoUrl,
    firma: firmaUrl,
    firmaUrl,
    signatureUrl: firstNonEmptyString(branding.signatureUrl, firmaUrl),
    primaryColor,
    colorPrincipal: firstNonEmptyString(branding.colorPrincipal, primaryColor),
  };
}

function normalizeClient(raw: any) {
  const client = raw && typeof raw === "object" ? { ...raw } : {};

  const nombre = firstNonEmptyString(
    client.nombre,
    client.nombreCompleto,
    client.razonSocial,
    client.razon_social,
    client.fullName,
    client.name,
    client.label,
    client.cliente_nombre,
    client.customerName,
    client.clientName,
  );
  const apellido = firstNonEmptyString(
    client.apellido,
    client.surname,
    client.customersurname,
  );
  const dni = firstNonEmptyString(
    client.dni,
    client.nif,
    client.documento,
    client.docId,
  );
  const direccion = firstNonEmptyString(
    client.direccion,
    client.address,
    client.domicilio,
    client.street,
    client.addressLine1,
    pickNestedValue(client, [
      "direccion.calle",
      "direccionFiscal.calle",
      "direcciones.0.direccion",
      "direcciones.0.calle",
      "contacto.direccion",
      "contacts.0.address",
    ]),
  );
  const telefono = firstNonEmptyString(
    client.telefono,
    client.phone,
    client.mobile,
    client.telefono1,
    client.telefonoMovil,
    pickNestedValue(client, [
      "contacto.telefono",
      "contact.contactPhone",
      "contacts.0.phone",
    ]),
  );
  const email = firstNonEmptyString(
    client.email,
    client.correo,
    client.mail,
    pickNestedValue(client, [
      "contacto.email",
      "contact.email",
      "contacts.0.email",
    ]),
  );

  return {
    ...client,
    nombre,
    nombreVisible: nombre,
    label: firstNonEmptyString(client.label, nombre),
    razonSocial: firstNonEmptyString(
      client.razonSocial,
      client.razon_social,
      nombre,
      apellido,
    ),
    dni,
    direccion,
    telefono,
    email,
  };
}

function findClientSource(record: AnyObj, py: AnyObj) {
  const candidates = [
    py?.cliente,
    py?.customer,
    py?.client,
    py?.obra?.cliente,
    py?.proyecto?.cliente,
    record?.cliente,
    record?.customer,
    record?.client,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") return candidate;
  }

  return null;
}

function applyClientCardFields(record: AnyObj, py: AnyObj) {
  const clientSource = findClientSource(record, py);
  const client = normalizeClient(clientSource);
  const visibleName = firstNonEmptyString(
    record?.cliente_nombre,
    record?.clienteNombre,
    record?.cliente_label,
    record?.clienteId__label,
    record?.customer_name,
    record?.customerName,
    record?.client_name,
    record?.clientName,
    client.nombre,
    py?.cliente__label,
    py?.customer__label,
    py?.client__label,
    py?.obra?.cliente__label,
  );

  return {
    ...record,
    cliente_nombre: visibleName,
    clienteNombre: firstNonEmptyString(record?.clienteNombre, visibleName),
    cliente_label: firstNonEmptyString(record?.cliente_label, visibleName),
    cliente_dni: firstNonEmptyString(record?.cliente_dni, client.dni),
    cliente_direccion: firstNonEmptyString(
      record?.cliente_direccion,
      client.direccion,
    ),
    cliente_email: firstNonEmptyString(record?.cliente_email, client.email),
    cliente_telefono: firstNonEmptyString(
      record?.cliente_telefono,
      client.telefono,
    ),
    customer_name: firstNonEmptyString(record?.customer_name, visibleName),
    customerName: firstNonEmptyString(record?.customerName, visibleName),
    client_name: firstNonEmptyString(record?.client_name, visibleName),
    clientName: firstNonEmptyString(record?.clientName, visibleName),
    cliente: client,
    customer: client,
    client,
  };
}

async function getSchemaFromDb(params: { supabase: any; moduleSlug: string }) {
  const { supabase, moduleSlug } = params;

  const { data, error } = await supabase
    .from("modulos")
    .select("props")
    .eq("slug", moduleSlug)
    .maybeSingle();

  if (error) {
    throw new Error(
      `resolvePdfContext: error cargando schema ${moduleSlug}: ${error.message}`,
    );
  }

  const schema = data?.props as ModuleSchema | undefined;
  if (!schema) {
    throw new Error(
      `resolvePdfContext: no existe schema para slug "${moduleSlug}" en tabla modulos`,
    );
  }

  return schema;
}

async function getSchemaCached(args: {
  supabase: any;
  cache: ResolveRunCache;
  moduleSlug: string;
}) {
  const { supabase, cache, moduleSlug } = args;

  let promise = cache.schemaBySlug.get(moduleSlug);
  if (!promise) {
    promise = getSchemaFromDb({ supabase, moduleSlug });
    cache.schemaBySlug.set(moduleSlug, promise);
  }

  return promise;
}

async function getOneFromDb(params: {
  supabase: any;
  table: string;
  id: string;
}) {
  const { supabase, table, id } = params;

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.warn(
      `resolvePdfContext: getOneFromDb error (${table} id=${id}):`,
      error.message,
    );
    return null;
  }

  return data ?? null;
}

async function getOneCached(args: {
  supabase: any;
  cache: ResolveRunCache;
  table: string;
  id: string;
}) {
  const { supabase, cache, table, id } = args;
  const cacheKey = `${table}:${id}`;

  let promise = cache.rowByTableAndId.get(cacheKey);
  if (!promise) {
    promise = getOneFromDb({ supabase, table, id });
    cache.rowByTableAndId.set(cacheKey, promise);
  }

  return promise;
}

async function fetchChildrenByFk(params: {
  supabase: any;
  cache: ResolveRunCache;
  table: string;
  fkField: string;
  parentId: string;
}) {
  const { supabase, cache, table, fkField, parentId } = params;
  const cacheKey = `${table}|${fkField}|${parentId}`;

  let promise = cache.childrenByTableFkAndParent.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      let res = await supabase.from(table).select("*").eq(fkField, parentId);

      if (res.error) {
        const msg = String(res.error.message || "");
        const code = String(res.error.code || "");
        const looksLikeArrayFk =
          msg.includes("malformed array literal") || code === "22P02";

        if (looksLikeArrayFk) {
          res = await supabase
            .from(table)
            .select("*")
            .contains(fkField, [parentId]);
        }
      }

      if (res.error) {
        console.warn(
          `resolvePdfContext: fetchChildren error (${table}.${fkField}):`,
          res.error.message,
        );
        return [];
      }

      return Array.isArray(res.data) ? res.data : [];
    })();

    cache.childrenByTableFkAndParent.set(cacheKey, promise);
  }

  return promise;
}

async function ensureLabelValues(args: {
  supabase: any;
  cache: ResolveRunCache;
  table: string;
  refIdField: string;
  refLabelField: string;
  ids: string[];
}) {
  const { supabase, cache, table, refIdField, refLabelField } = args;
  const uniqueIds = Array.from(
    new Set(
      (args.ids || []).filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    ),
  );
  const groupKey = `${table}|${refIdField}|${refLabelField}`;

  let store = cache.labelValuesByGroup.get(groupKey);
  if (!store) {
    store = new Map<string, string>();
    cache.labelValuesByGroup.set(groupKey, store);
  }

  let missingIds = uniqueIds.filter((id) => !store.has(id));
  if (!missingIds.length) return store;

  const pending = cache.labelLoadsByGroup.get(groupKey);
  if (pending) {
    await pending;
    missingIds = uniqueIds.filter((id) => !store!.has(id));
    if (!missingIds.length) return store;
  }

  const loadPromise = (async () => {
    const { data, error } = await supabase
      .from(table)
      .select(`${refIdField},${refLabelField}`)
      .in(refIdField, missingIds);

    if (error) {
      console.warn(
        `resolvePdfContext: labelResolver error (${table}):`,
        error.message,
      );
      return;
    }

    for (const row of data || []) {
      const key = String((row as any)?.[refIdField] ?? "");
      const value = String((row as any)?.[refLabelField] ?? "");
      if (key) store!.set(key, value);
    }
  })();

  cache.labelLoadsByGroup.set(groupKey, loadPromise);
  try {
    await loadPromise;
  } finally {
    if (cache.labelLoadsByGroup.get(groupKey) === loadPromise) {
      cache.labelLoadsByGroup.delete(groupKey);
    }
  }

  return store;
}

async function applyLabelResolversToRows(args: {
  supabase: any;
  cache: ResolveRunCache;
  rows: any[];
  resolvers: LabelResolver[];
}) {
  const { supabase, cache, rows, resolvers } = args;

  if (!Array.isArray(rows) || rows.length === 0) return rows;
  if (!Array.isArray(resolvers) || resolvers.length === 0) return rows;

  const groupedResolvers = new Map<
    string,
    {
      refTable: string;
      refIdField: string;
      refLabelField: string;
      ids: Set<string>;
    }
  >();

  for (const resolver of resolvers) {
    if (!resolver?.field || !resolver?.refTable || !resolver?.refLabelField) {
      continue;
    }

    const refIdField = resolver.refIdField ?? "id";
    const groupKey = `${resolver.refTable}|${refIdField}|${resolver.refLabelField}`;
    let group = groupedResolvers.get(groupKey);
    if (!group) {
      group = {
        refTable: resolver.refTable,
        refIdField,
        refLabelField: resolver.refLabelField,
        ids: new Set<string>(),
      };
      groupedResolvers.set(groupKey, group);
    }

    for (const row of rows) {
      const value = row?.[resolver.field];
      if (typeof value === "string" && value.length > 0) {
        group.ids.add(value);
      }
    }
  }

  const labelMaps = new Map<string, Map<string, string>>();
  await Promise.all(
    Array.from(groupedResolvers.entries()).map(async ([groupKey, group]) => {
      const map = await ensureLabelValues({
        supabase,
        cache,
        table: group.refTable,
        refIdField: group.refIdField,
        refLabelField: group.refLabelField,
        ids: Array.from(group.ids),
      });
      labelMaps.set(groupKey, map);
    }),
  );

  return rows.map((row) => {
    let nextRow = row;

    for (const resolver of resolvers) {
      const refIdField = resolver.refIdField ?? "id";
      const outField = resolver.outField ?? `${resolver.field}__label`;
      const groupKey = `${resolver.refTable}|${refIdField}|${resolver.refLabelField}`;
      const value = row?.[resolver.field];
      const label =
        typeof value === "string" ? labelMaps.get(groupKey)?.get(value) : undefined;

      if (label) {
        if (nextRow === row) nextRow = { ...row };
        nextRow[outField] = label;
      }
    }

    return nextRow;
  });
}

async function hydrateBelongsToTree(opts: {
  supabase: any;
  cache: ResolveRunCache;
  rootModuleSlug: string;
  record: AnyObj;
  depth?: number;
}) {
  const { supabase, cache, rootModuleSlug } = opts;
  const depth = typeof opts.depth === "number" ? opts.depth : 2;

  async function hydrateOne(
    moduleSlug: string,
    rec: AnyObj,
    d: number,
  ): Promise<AnyObj> {
    if (!rec || d <= 0) return rec;

    const schema = await getSchemaCached({ supabase, cache, moduleSlug });
    const fields = getSchemaFields(schema);
    const out: AnyObj = { ...rec };

    const hydrationTasks = fields.map(async (field) => {
      const fieldName = field?.name;
      if (!fieldName || typeof fieldName !== "string") return null;

      const ref = getRefFromField(field);
      if (!ref?.moduleSlug) return null;

      const fkValue = out[fieldName];
      if (!fkValue || typeof fkValue !== "string") return null;

      const alias = field.alias ?? inferAliasFromFieldName(fieldName);
      if (out[alias] && typeof out[alias] === "object") return null;

      const child = await getOneCached({
        supabase,
        cache,
        table: ref.moduleSlug,
        id: fkValue,
      });
      const hydratedChild = child
        ? await hydrateOne(ref.moduleSlug, child, d - 1)
        : null;

      return {
        alias,
        child: hydratedChild,
        label:
          ref.displayField && child ? (child as AnyObj)?.[ref.displayField] ?? "" : undefined,
      };
    });

    const hydratedEntries = await Promise.all(hydrationTasks);
    for (const entry of hydratedEntries) {
      if (!entry) continue;
      out[entry.alias] = entry.child;
      if (entry.label != null && out[`${entry.alias}__label`] == null) {
        out[`${entry.alias}__label`] = entry.label;
      }
    }

    return out;
  }

  return hydrateOne(rootModuleSlug, opts.record, depth);
}

let allSchemasCache: Record<string, ModuleSchema> | null = null;
let allSchemasCacheAt = 0;

async function loadAllSchemasFromDb(params: { supabase: any }) {
  const now = Date.now();
  if (allSchemasCache && now - allSchemasCacheAt < 60_000) {
    return allSchemasCache;
  }

  const { supabase } = params;
  const { data, error } = await supabase.from("modulos").select("slug,props");

  if (error) {
    throw new Error(
      `resolvePdfContext: error cargando modulos: ${error.message}`,
    );
  }

  const map: Record<string, ModuleSchema> = {};
  for (const row of data || []) {
    const slug = (row as any)?.slug;
    const props = (row as any)?.props;
    if (slug && props && typeof props === "object") {
      map[String(slug)] = props as ModuleSchema;
    }
  }

  allSchemasCache = map;
  allSchemasCacheAt = now;
  return map;
}

function buildInverseRefs(all: Record<string, ModuleSchema>) {
  const inverse = new Map<string, InverseRef[]>();

  for (const [childSlug, schema] of Object.entries(all)) {
    const fields = getSchemaFields(schema);

    for (const field of fields) {
      const fieldName = field?.name;
      if (!fieldName || typeof fieldName !== "string") continue;

      const ref = getRefFromField(field);
      if (!ref?.moduleSlug) continue;

      const parentSlug = ref.moduleSlug;
      if (!inverse.has(parentSlug)) inverse.set(parentSlug, []);

      inverse.get(parentSlug)!.push({
        childModule: childSlug,
        fkField: fieldName,
        alias: (field.backrefAlias ?? childSlug) as string,
      });
    }
  }

  return inverse;
}

async function hydrateHasManyCollections(opts: {
  supabase: any;
  cache: ResolveRunCache;
  rootModuleSlug: string;
  parentId: string;
  py: AnyObj;
}) {
  const { supabase, cache, rootModuleSlug, parentId, py } = opts;

  const allSchemas = await loadAllSchemasFromDb({ supabase });
  const inverse = buildInverseRefs(allSchemas);
  const refs = inverse.get(rootModuleSlug) || [];
  if (!refs.length) return py;

  const grouped = new Map<string, InverseRef[]>();
  for (const ref of refs) {
    if (!grouped.has(ref.alias)) grouped.set(ref.alias, []);
    grouped.get(ref.alias)!.push(ref);
  }

  await Promise.all(
    Array.from(grouped.entries()).map(async ([alias, candidates]) => {
      if (Array.isArray(py[alias])) return;

      const childGroups = await Promise.all(
        candidates.map((candidate) =>
          fetchChildrenByFk({
            supabase,
            cache,
            table: candidate.childModule,
            fkField: candidate.fkField,
            parentId,
          }),
        ),
      );

      py[alias] = childGroups.flat();
    }),
  );

  return py;
}

export async function resolvePdfContext(args: ResolveArgs) {
  const supabase = await createClient();
  const cache = createResolveRunCache();

  const [recordResult, relatedResults, brandingResult] = await Promise.all([
    supabase.from(args.sourceTable).select("*").eq("id", args.recordId).maybeSingle(),
    Promise.all(
      (args.related || []).map(async (relation) => {
        const rows = await fetchChildrenByFk({
          supabase,
          cache,
          table: relation.table,
          fkField: relation.fkField,
          parentId: args.recordId,
        });
        return [relation.key, rows] as const;
      }),
    ),
    supabase.from("branding").select("*").limit(1).maybeSingle(),
  ]);

  if (recordResult.error) {
    throw new Error(`resolvePdfContext: error record: ${recordResult.error.message}`);
  }
  if (!recordResult.data) {
    throw new Error(
      `resolvePdfContext: record no encontrado (${args.sourceTable} id=${args.recordId})`,
    );
  }

  const record = {
    ...recordResult.data,
    ...((args.recordOverride && typeof args.recordOverride === "object")
      ? args.recordOverride
      : {}),
  };

  const related = Object.fromEntries(relatedResults) as Record<string, any[]>;

  const recordResolvers = (args.labelResolvers || []).filter(
    (resolver) => resolver?.in === "record",
  );
  const relatedResolversByKey = new Map<string, LabelResolver[]>();
  for (const resolver of args.labelResolvers || []) {
    if (resolver?.in !== "related" || !resolver.relatedKey) continue;
    if (!relatedResolversByKey.has(resolver.relatedKey)) {
      relatedResolversByKey.set(resolver.relatedKey, []);
    }
    relatedResolversByKey.get(resolver.relatedKey)!.push(resolver);
  }

  if (recordResolvers.length) {
    const [enrichedRecord] = await applyLabelResolversToRows({
      supabase,
      cache,
      rows: [record],
      resolvers: recordResolvers,
    });
    Object.assign(record, enrichedRecord);
  }

  await Promise.all(
    Array.from(relatedResolversByKey.entries()).map(async ([relatedKey, resolvers]) => {
      related[relatedKey] = await applyLabelResolversToRows({
        supabase,
        cache,
        rows: related[relatedKey] || [],
        resolvers,
      });
    }),
  );

  const py = await hydrateBelongsToTree({
    supabase,
    cache,
    rootModuleSlug: args.sourceTable,
    record,
    depth: 2,
  });

  await hydrateHasManyCollections({
    supabase,
    cache,
    rootModuleSlug: args.sourceTable,
    parentId: args.recordId,
    py,
  });

  const normalizedBranding = normalizeBranding(brandingResult.data);
  const recordWithClientFields = applyClientCardFields(record, py);

  const baseCtx = {
    record: recordWithClientFields,
    py,
    related,
    branding: normalizedBranding,
    empresa: normalizedBranding,
    firmaUrl: normalizedBranding.firmaUrl || "",
    now: new Date().toISOString(),
  };

  const datasets = args.template
    ? await resolvePdfDatasets({
        supabase,
        template: args.template,
        ctx: baseCtx,
      })
    : {};

  return {
    ...baseCtx,
    datasets,
  };
}
