import { advancedFilterFields, advancedFilterOperators, ADVANCED_FILTER_MAX_CONDITIONS, ADVANCED_FILTER_MAX_DEPTH,
  type Field, type ModuleSchema, type ModuleDefaultResolvedFilterGroup } from "@repo/types";
import { badRequest, forbidden } from "./auth/apiError";
import { getEffectiveModuleCapabilities } from "@repo/types";
import { resolveModuleConfig } from "./modules/resolveModuleConfig";
import { requireModulePermission } from "./auth/requireModulePermission";
import { resolveDefaultFiltersForQuery } from "./moduleDefaultFilters";

export function filterIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw badRequest("Identificador no válido en la configuración del filtro");
  return value;
}

function literal(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value !== "string" || value.length > 1000 || Array.from(value).some(char => char.charCodeAt(0) < 32)) throw badRequest("Valor de filtro no válido");
  // PostgREST quoted literal grammar: delimiters inside values cannot add predicates.
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function filterConditionExpression(field: string, op: string, value: unknown, text = false): string {
  const column = filterIdentifier(field);
  const term = (operator: string, val: unknown) => `${column}.${operator}.${literal(val)}`;
  const empty = `${column}.is.null`;
  if (op === "isNull" || (op === "=" && value == null)) return text ? `or(${empty},${term("eq", "")})` : empty;
  if (op === "isNotNull" || (op === "!=" && value == null)) return text ? `and(${column}.not.is.null,${term("neq", "")})` : `${column}.not.is.null`;
  const operators: Record<string, string> = { "=": "eq", "!=": "neq", ">": "gt", ">=": "gte", "<": "lt", "<=": "lte" };
  if (operators[op]) return term(operators[op]!, value);
  if (op === "in" || op === "notIn") {
    if (!Array.isArray(value) || value.length > 100) throw badRequest("La lista de valores no es válida (máximo 100)");
    if (!value.length) return op === "in" ? `and(${empty},${column}.not.is.null)` : `or(${empty},${column}.not.is.null)`;
    return `${column}.${op === "in" ? "in" : "not.in"}.(${value.map(literal).join(",")})`;
  }
  if (op === "between") {
    if (!Array.isArray(value) || value.length !== 2) throw badRequest("Entre requiere dos valores");
    return `and(${term("gte", value[0])},${term("lte", value[1])})`;
  }
  if (["contains", "notContains", "startsWith", "endsWith", "ilike"].includes(op)) {
    if (typeof value !== "string") throw badRequest("Este operador requiere texto");
    const escaped = op === "ilike" ? value : value.replace(/[\\%_]/g, "\\$&");
    const pattern = op === "startsWith" ? `${escaped}%` : op === "endsWith" ? `%${escaped}` : op === "ilike" ? escaped : `%${escaped}%`;
    return term(op === "notContains" ? "not.ilike" : "ilike", pattern);
  }
  throw badRequest("Operador de filtro no permitido");
}

export function defaultFilterExpression(group: ModuleDefaultResolvedFilterGroup, schema: ModuleSchema): string | undefined {
  if (!group.items.length) return undefined;
  const items = group.items.map(item => {
    if ("items" in item) return defaultFilterExpression(item, schema) || `${filterIdentifier(schema.db.primaryKey || "id")}.not.is.null`;
    if (!schema.fields.some(field => field.name === item.field) && item.field !== (schema.db.primaryKey || "id"))
      throw badRequest(`Campo de filtro por defecto no declarado: ${item.field}`);
    return filterConditionExpression(item.field, item.op, item.value);
  });
  return `${group.logic === "OR" ? "or" : "and"}(${items.join(",")})`;
}

function validateValue(field: Field, op: string, value: unknown) {
  if (op === "isNull" || op === "isNotNull") return;
  const values = op === "between" || op === "in" || op === "notIn" ? value : [value];
  if (!Array.isArray(values) || !values.length || values.length > 100 || (op === "between" && values.length !== 2))
    throw badRequest("Número de valores no válido");
  for (const val of values) {
    literal(val);
    if (["number", "money", "percent"].includes(field.type) && (typeof val !== "number" || !Number.isFinite(val))) throw badRequest("Se requiere un número válido");
    if (field.type === "boolean" && typeof val !== "boolean") throw badRequest("Se requiere verdadero o falso");
    if (["text", "textarea", "color", "select"].includes(field.type) && typeof val !== "string") throw badRequest("Se requiere un valor de texto");
    if (field.type === "date" || field.type === "datetime") {
      if (typeof val !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(val) || !Number.isFinite(Date.parse(val)) ||
        new Date(`${val.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== val.slice(0, 10))
        throw badRequest("Se requiere una fecha válida");
    }
  }
  if (op === "between" && (field.type === "datetime" ? Date.parse(values[0]) > Date.parse(values[1]) : values[0] > values[1]))
    throw badRequest("El inicio del intervalo debe ser menor o igual al final");
}

export async function compileAdvancedFilters(input: unknown, schema: ModuleSchema, runtime: Parameters<typeof resolveDefaultFiltersForQuery>[1],
  dependencies = { resolveModuleConfig, requireModulePermission }) {
  if (!getEffectiveModuleCapabilities(schema).allowSearch) throw forbidden("La búsqueda está deshabilitada en este módulo");
  let conditions = 0;
  let nodes = 0;
  const relations = new Map<string, Awaited<ReturnType<typeof resolveModuleConfig>>>();
  const embeds: Array<{ alias: string; select: string; expression: string }> = [];
  async function walk(inputNode: unknown, depth: number): Promise<string | undefined> {
    if (++nodes > 100 || depth > ADVANCED_FILTER_MAX_DEPTH || !inputNode || typeof inputNode !== "object" || Array.isArray(inputNode))
      throw badRequest("Filtro demasiado complejo o inválido (máximo 4 niveles y 40 condiciones)");
    const node = inputNode as Record<string, unknown>;
    if (node.kind === "group") {
      if (!Array.isArray(node.items) || (node.logic !== "AND" && node.logic !== "OR")) throw badRequest("Grupo de filtros no válido");
      if (depth > 1 && !node.items.length) throw badRequest("Elimina los grupos vacíos antes de buscar");
      const parts: string[] = [];
      for (const item of node.items) { const part = await walk(item, depth + 1); if (part) parts.push(part); }
      return parts.length ? `${node.logic === "OR" ? "or" : "and"}(${parts.join(",")})` : undefined;
    }
    if (node.kind !== "condition" || ++conditions > ADVANCED_FILTER_MAX_CONDITIONS) throw badRequest("Condición no válida o demasiadas condiciones");
    if (typeof node.field !== "string" || typeof node.op !== "string" || (node.relation !== undefined && typeof node.relation !== "string"))
      throw badRequest("Campo, operador o relación no válido");
    let target = schema;
    let relationColumn: string | undefined;
    let related: Awaited<ReturnType<typeof resolveModuleConfig>> | undefined;
    if (node.relation !== undefined) {
      const relation = advancedFilterFields(schema).find(field => field.name === node.relation);
      if (!relation || relation.type !== "selectorTabla" || relation.ref.multiple) throw badRequest("Relación no permitida para búsqueda");
      relationColumn = filterIdentifier(relation.name);
      const slug = relation.ref.moduleSlug;
      related = relations.get(slug);
      if (!related) {
        related = await dependencies.resolveModuleConfig(slug);
        await dependencies.requireModulePermission(related.permissionsKey, "ver");
        if (!related.table) throw badRequest("La relación no apunta a un módulo de datos");
        relations.set(slug, related);
      }
      target = related.schema;
    }
    const field = advancedFilterFields(target).find(field => field.name === node.field);
    if (!field) throw badRequest(`Campo no permitido para búsqueda: ${String(node.field).slice(0, 80)}`);
    if (!advancedFilterOperators(field).some(operator => operator === node.op)) throw badRequest(`Operador no permitido para ${field.label || field.name}`);
    validateValue(field, node.op, node.value);
    const expression = filterConditionExpression(field.name, node.op, node.value, ["text", "textarea", "color"].includes(field.type));
    if (!related) return expression;
    // Empty embeds + not.is.null are EXISTS predicates; no related records are downloaded.
    // One alias per condition preserves OR across root and related columns.
    let alias = `jiro_search_${embeds.length}`;
    while (schema.fields.some(field => field.name === alias)) alias += "_";
    const defaults = defaultFilterExpression(resolveDefaultFiltersForQuery(target.db.defaultFilters, runtime).group, target);
    // PostgREST accepts the single-column FK's source column as a hint. This
    // is NOT an assumed constraint name (e.g. obraId resolves TASK_obraId_fkey).
    // Both identifiers come from validated schemas; PostgREST checks the real FK.
    embeds.push({ alias, select: `${alias}:${filterIdentifier(related.table!)}!${relationColumn}()`,
      expression: defaults ? `and(${expression},${defaults})` : expression });
    return `${alias}.not.is.null`;
  }
  if (!input || typeof input !== "object" || !("kind" in input) || input.kind !== "group") throw badRequest("La búsqueda debe contener un grupo raíz");
  const expression = await walk(input, 1);
  return { expression, embeds };
}
