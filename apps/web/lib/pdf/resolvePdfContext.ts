import { createClient } from "@/lib/supabase/server";
import type { ModuleSchema } from "@repo/types";

type RelatedSpec = {
  key: string;
  table: string;
  fkField: string;
};

type LabelResolver = {
  // en qué array (record o related.KEY) hay que aplicar la resolución
  in: "record" | "related";
  relatedKey?: string; // si in=related
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
        .filter((v) => typeof v === "string" && v.length > 0),
    ),
  );

  if (!ids.length) return rows;

  const { data, error } = await supabase
    .from(resolver.refTable)
    .select(`${refIdField},${resolver.refLabelField}`)
    .in(refIdField, ids);

  if (error) {
    // No petamos el PDF por esto; devolvemos sin labels
    console.warn(
      `resolvePdfContext: labelResolver error (${resolver.refTable}):`,
      error.message,
    );
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
type AnyObj = Record<string, any>;

// Helpers
function isUuidLike(v: any) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    )
  );
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
  specs: Array<{ field: string; table: string; labelField: string }>,
) {
  if (
    !Array.isArray(rows) ||
    rows.length === 0 ||
    !Array.isArray(specs) ||
    specs.length === 0
  ) {
    return rows;
  }

  // Recolecta IDs por (table,labelField) para hacer batch
  const groups = new Map<
    string,
    { table: string; labelField: string; ids: Set<string> }
  >();

  for (const s of specs) {
    const key = `${s.table}__${s.labelField}`;
    if (!groups.has(key))
      groups.set(key, {
        table: s.table,
        labelField: s.labelField,
        ids: new Set(),
      });

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
    const map = await fetchLabelsBatch({
      table: g.table,
      ids,
      labelField: g.labelField,
    });
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

async function getSchemaFromDb(params: { supabase: any; moduleSlug: string }) {
  const { supabase, moduleSlug } = params;

  // Ajusta el nombre si tu tabla no se llama "modulos"
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
    // No petamos por completo por una relación rota: devolvemos null
    console.warn(
      `resolvePdfContext: getOneFromDb error (${table} id=${id}):`,
      error.message,
    );
    return null;
  }

  return data ?? null;
}

async function enrichRecordWithLabels(
  record: any,
  specs: Array<{ field: string; table: string; labelField: string }>,
) {
  if (!record || !Array.isArray(specs) || specs.length === 0) return record;

  // Reutilizamos enrichRowsWithLabels tratando el record como array de 1
  const arr = [record];
  await enrichRowsWithLabels(arr, specs);
  return arr[0];
}

function getSchemaFields(schema: ModuleSchema): any[] {
  // Intenta varias formas comunes sin romper
  const s: any = schema as any;

  if (Array.isArray(s.fields)) return s.fields;
  if (Array.isArray(s.campos)) return s.campos;

  // a veces viene como schema.props.fields
  if (Array.isArray(s.props?.fields)) return s.props.fields;

  // fallback
  return [];
}

function inferAliasFromFieldName(name: string) {
  // customerId -> customer
  if (name.endsWith("Id") && name.length > 2) return name.slice(0, -2);
  return name;
}

function getRefFromField(
  field: any,
): { moduleSlug?: string; displayField?: string } | null {
  // Soportar varias formas típicas:
  // field.ref.moduleSlug
  // field.ref.table
  // field.selector.ref...
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
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
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

function normalizeBranding(raw: any) {
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
  const logoUrl = firstNonEmptyString(
    branding.logoUrl,
    branding.logo,
    branding.logo_url,
    branding.imageUrl,
    branding.imagen,
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

async function hydrateBelongsToTree(opts: {
  supabase: any;
  rootModuleSlug: string;
  record: AnyObj;
  depth?: number;
}) {
  const { supabase, rootModuleSlug } = opts;
  const depth = typeof opts.depth === "number" ? opts.depth : 2;

  // Cache por render (clave: `${moduleSlug}:${id}`)
  const recordCache = new Map<string, AnyObj | null>();
  const schemaCache = new Map<string, ModuleSchema>();

  async function getSchemaCached(slug: string) {
    if (schemaCache.has(slug)) return schemaCache.get(slug)!;
    const s = await getSchemaFromDb({ supabase, moduleSlug: slug });
    schemaCache.set(slug, s);
    return s;
  }

  async function getOneCached(table: string, id: string) {
    const key = `${table}:${id}`;
    if (recordCache.has(key)) return recordCache.get(key)!;
    const rec = await getOneFromDb({ supabase, table, id });
    recordCache.set(key, rec);
    return rec;
  }

  async function hydrateOne(
    moduleSlug: string,
    rec: AnyObj,
    d: number,
  ): Promise<AnyObj> {
    if (!rec || d <= 0) return rec;

    const schema = await getSchemaCached(moduleSlug);
    const fields = getSchemaFields(schema);

    // Copia para no mutar el original
    const out: AnyObj = { ...rec };

    for (const field of fields) {
      const fieldName = field?.name;
      if (!fieldName || typeof fieldName !== "string") continue;

      const ref = getRefFromField(field);
      if (!ref?.moduleSlug) continue;

      // valor FK (ej: customerId)
      const fkValue = out[fieldName];
      if (!fkValue || typeof fkValue !== "string") continue;

      const alias = field.alias ?? inferAliasFromFieldName(fieldName);

      // Evita machacar si ya existe
      if (out[alias] && typeof out[alias] === "object") continue;

      // 👇 aquí asumimos que ref.moduleSlug == nombre de tabla en supabase
      const child = await getOneCached(ref.moduleSlug, fkValue);
      out[alias] = child
        ? await hydrateOne(ref.moduleSlug, child, d - 1)
        : null;

      // opcional: label directo si existe displayField
      if (ref.displayField && child && out[`${alias}__label`] == null) {
        out[`${alias}__label`] = child?.[ref.displayField] ?? "";
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
  if (allSchemasCache && now - allSchemasCacheAt < 60_000)
    return allSchemasCache;

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

type InverseRef = {
  childModule: string; // slug de la tabla hija
  fkField: string; // campo en la hija que apunta al padre (ej: presupuestoId)
  alias: string; // nombre de la colección en py (por defecto childModule)
};

function buildInverseRefs(all: Record<string, ModuleSchema>) {
  // parentSlug -> [ { childModule, fkField, alias } ]
  const inv = new Map<string, InverseRef[]>();

  for (const [childSlug, schema] of Object.entries(all)) {
    const fields = getSchemaFields(schema);

    for (const field of fields) {
      const fieldName = field?.name;
      if (!fieldName || typeof fieldName !== "string") continue;

      const ref = getRefFromField(field);
      if (!ref?.moduleSlug) continue;

      const parentSlug = ref.moduleSlug;

      if (!inv.has(parentSlug)) inv.set(parentSlug, []);

      inv.get(parentSlug)!.push({
        childModule: childSlug,
        fkField: fieldName,
        alias: (field.backrefAlias ?? childSlug) as string, // opcional si quieres renombrar
      });
    }
  }

  return inv;
}
async function fetchChildrenByFk(params: {
  supabase: any;
  table: string;
  fkField: string;
  parentId: string;
}) {
  const { supabase, table, fkField, parentId } = params;

  // intento FK normal: fkField = parentId
  let res = await supabase.from(table).select("*").eq(fkField, parentId);

  // si falla por FK array (uuid[]), reintenta con contains
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
    // No petamos todo el PDF por una colección
    console.warn(
      `resolvePdfContext: fetchChildren error (${table}.${fkField}):`,
      res.error.message,
    );
    return [];
  }

  return Array.isArray(res.data) ? res.data : [];
}
async function hydrateHasManyCollections(opts: {
  supabase: any;
  rootModuleSlug: string;
  parentId: string;
  py: AnyObj; // el objeto py ya creado
}) {
  const { supabase, rootModuleSlug, parentId, py } = opts;

  const allSchemas = await loadAllSchemasFromDb({ supabase });
  const inverse = buildInverseRefs(allSchemas);

  const refs = inverse.get(rootModuleSlug) || [];
  if (refs.length === 0) return py;

  // agrupar por alias por si varios FKs quisieran el mismo alias
  const grouped = new Map<string, InverseRef[]>();
  for (const r of refs) {
    if (!grouped.has(r.alias)) grouped.set(r.alias, []);
    grouped.get(r.alias)!.push(r);
  }

  for (const [alias, candidates] of grouped.entries()) {
    // Si ya existe (por ejemplo lo setearon antes), no lo machacamos
    if (Array.isArray(py[alias])) continue;

    // Si hay varios candidatos (poco común), los concatenamos
    let all: any[] = [];
    for (const c of candidates) {
      const rows = await fetchChildrenByFk({
        supabase,
        table: c.childModule,
        fkField: c.fkField,
        parentId,
      });
      all = all.concat(rows);
    }

    py[alias] = all;
  }

  return py;
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
  if (!record)
    throw new Error(
      `resolvePdfContext: record no encontrado (${args.sourceTable} id=${args.recordId})`,
    );

  // 2) Relaciones
  const related: Record<string, any[]> = {};

  for (const r of args.related || []) {
    // 2.1) intento FK "normal"
    let data: any[] | null = null;
    let error: any = null;

    {
      const res = await supabase
        .from(r.table)
        .select("*")
        .eq(r.fkField, args.recordId);

      data = res.data ?? null;
      error = res.error ?? null;
    }

    // 2.2) si falla por array, reintenta como FK uuid[]
    if (error) {
      const msg = String(error.message || "");
      const code = String(error.code || "");

      const looksLikeArrayFk =
        msg.includes("malformed array literal") || code === "22P02";

      if (looksLikeArrayFk) {
        const res2 = await supabase
          .from(r.table)
          .select("*")
          .contains(r.fkField, [args.recordId]); // 👈 clave

        data = res2.data ?? null;
        error = res2.error ?? null;
      }
    }

    if (error) {
      throw new Error(
        `resolvePdfContext: error related ${r.key}: ${error.message}`,
      );
    }

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
        const rows = await addLabelsToRows({
          supabase,
          rows: [record],
          resolver: lr,
        });
        // rows[0] puede ser el mismo record o uno enriquecido
        if (rows?.[0]) Object.assign(record, rows[0]);
      }

      if (lr.in === "related" && lr.relatedKey) {
        const key = lr.relatedKey;
        const arr = related[key] || [];
        related[key] = await addLabelsToRows({
          supabase,
          rows: arr,
          resolver: lr,
        });
      }
    }
  }
  const py = await hydrateBelongsToTree({
    supabase,
    rootModuleSlug: args.sourceTable, // asumimos que coincide con el slug del módulo
    record,
    depth: 2,
  });
  await hydrateHasManyCollections({
    supabase,
    rootModuleSlug: args.sourceTable,
    parentId: args.recordId,
    py,
  });

  const normalizedBranding = normalizeBranding(branding);
  const recordWithClientFields = applyClientCardFields(record, py);

  return {
    record: recordWithClientFields,
    py,
    related,
    branding: normalizedBranding,
    empresa: normalizedBranding,
    now: new Date().toISOString(),
  };
}
