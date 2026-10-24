import type { Field, FieldRefInput } from "@repo/types";
import { MAX_FIELD_REF_DEPTH, fieldRefKey, normalizeFieldRef } from "@repo/types";
import { badRequest } from "../auth/apiError";
import type { requireModulePermission } from "../auth/requireModulePermission";
import type { resolveModuleConfig, ResolvedModuleConfig } from "../modules/resolveModuleConfig";

export type ResolvedFieldRefRelation = {
  field: string;
  moduleSlug: string;
  table: string;
  fieldSchema: Field;
  schema: ResolvedModuleConfig["schema"];
};

export type ResolvedFieldRef = {
  key: string;
  ref: ReturnType<typeof normalizeFieldRef>;
  sourceModule: ResolvedModuleConfig;
  targetModule: ResolvedModuleConfig;
  targetTable: string;
  field: string;
  fieldSchema: Field;
  relations: ResolvedFieldRefRelation[];
};

export type FieldRefResolverDependencies = {
  resolveModuleConfig: typeof resolveModuleConfig;
  requireModulePermission: typeof requireModulePermission;
};

const defaultDependencies: FieldRefResolverDependencies = {
  resolveModuleConfig: async (...args) => (await import("../modules/resolveModuleConfig")).resolveModuleConfig(...args),
  requireModulePermission: async (...args) => (await import("../auth/requireModulePermission")).requireModulePermission(...args),
};

function readableField(config: ResolvedModuleConfig, name: string) {
  return config.schema.fields.find(field => field.name === name && !field.virtual && field.visible !== false);
}

export async function resolveFieldRefs(
  sourceModuleSlug: string,
  inputs: readonly FieldRefInput[],
  dependencies: FieldRefResolverDependencies = defaultDependencies,
): Promise<ResolvedFieldRef[]> {
  const moduleCache = new Map<string, ResolvedModuleConfig>();
  const permissionCache = new Set<string>();
  const resolveModule = async (slug: string) => {
    let config = moduleCache.get(slug);
    if (!config) {
      const loaded = await dependencies.resolveModuleConfig(slug);
      config = (loaded.slug ? loaded : { ...loaded, slug }) as ResolvedModuleConfig;
      moduleCache.set(slug, config);
    }
    if (!permissionCache.has(config.permissionsKey)) {
      await dependencies.requireModulePermission(config.permissionsKey, "ver");
      permissionCache.add(config.permissionsKey);
    }
    if (!config.table) throw badRequest(`El módulo ${config.slug} no tiene tabla de datos`);
    return config;
  };

  const sourceModule = await resolveModule(sourceModuleSlug);
  const output: ResolvedFieldRef[] = [];

  for (const input of inputs) {
    const ref = normalizeFieldRef(input);
    if (!ref.field) throw badRequest("La referencia no contiene un campo");
    if (ref.relations.length > MAX_FIELD_REF_DEPTH) {
      throw badRequest(`La referencia supera ${MAX_FIELD_REF_DEPTH} relaciones`);
    }

    let current = sourceModule;
    const visitedModules = new Set([current.slug]);
    const relations: ResolvedFieldRefRelation[] = [];
    for (const relationName of ref.relations) {
      const relation = readableField(current, relationName);
      if (!relation || relation.type !== "selectorTabla" || relation.ref.multiple || !relation.ref.moduleSlug) {
        throw badRequest(`La relación ${relationName} no es un selectorTabla simple válido en ${current.slug}`);
      }
      const target = await resolveModule(relation.ref.moduleSlug);
      if (visitedModules.has(target.slug)) throw badRequest("La referencia contiene un ciclo de módulos");
      visitedModules.add(target.slug);
      relations.push({
        field: relation.name,
        moduleSlug: target.slug,
        table: target.table!,
        fieldSchema: relation,
        schema: target.schema,
      });
      current = target;
    }

    const fieldSchema = readableField(current, ref.field);
    if (!fieldSchema) throw badRequest(`El campo ${ref.field} no existe o no está disponible en ${current.slug}`);
    output.push({
      key: fieldRefKey(ref),
      ref,
      sourceModule,
      targetModule: current,
      targetTable: current.table!,
      field: fieldSchema.name,
      fieldSchema,
      relations,
    });
  }

  return output;
}

export async function resolveFieldRef(
  sourceModuleSlug: string,
  input: FieldRefInput,
  dependencies: FieldRefResolverDependencies = defaultDependencies,
) {
  return (await resolveFieldRefs(sourceModuleSlug, [input], dependencies))[0]!;
}
