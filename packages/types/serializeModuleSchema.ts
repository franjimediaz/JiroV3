import { normalizeModuleSchema } from "./normalizeModuleSchema";
import { serializeFieldRef } from "./fieldRefs";
import { serializeModuleDefaultFilters } from "./moduleDefaultFilters";
import { serializeSelectorTableFilters } from "./selectorTableFilters";
import type { NormalizedModuleSchema, NormalizedField } from "./normalizeModuleSchema";

export type PersistedModuleSchema = {
  db: NormalizedModuleSchema["db"];
  fields: Omit<NormalizedField, "appareance">[];
  ui: Record<string, unknown>;
  [key: string]: unknown;
};

type Config = Record<string, any>;
const record = (value: unknown): Config => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const pick = (value: unknown, keys: string[]): Config => Object.fromEntries(
  Object.entries(record(value)).filter(([key, val]) => keys.includes(key) && val !== undefined),
);
const canonicalRef = (value: unknown) => value === undefined || value === ""
  ? value
  : typeof value === "string"
    ? value.trim()
    : serializeFieldRef(value as any);
const READ_REF_KEYS = ["titleField", "startField", "endField", "allDayField", "colorField", "descriptionField", "resourceField",
  "labelField", "displayField", "iconField", "categoryField", "typeField", "orderField", "lockedField", "visibleField", "planJsonField", "blockJsonField"];
const canonicalizeReadRefs = (value: Config, keys = READ_REF_KEYS) => {
  const next = { ...value };
  for (const key of keys) if (next[key] !== undefined && next[key] !== "") next[key] = canonicalRef(next[key]);
  return next;
};
const canonicalQuery = (items: unknown) => Array.isArray(items)
  ? items.map((item: Config) => item?.field ? { ...item, field: canonicalRef(item.field) } : item)
  : items;
const canonicalVisibility = (value: unknown) => {
  const visibility = record(value);
  if (!Array.isArray(visibility.rules)) return value;
  return { ...visibility, rules: visibility.rules.map((input: Config) => {
    const legacyRelated = input.source === "relatedRecord" && input.relationField && input.relatedField;
    const field = legacyRelated ? { relations: [input.relationField], field: input.relatedField } : input.field;
    const next: Config = { ...input, field: canonicalRef(field) };
    delete next.source; delete next.relationField; delete next.relatedModuleSlug; delete next.relatedField;
    return next;
  }) };
};

/** Only named configuration slots; never traverse data literals, defaults or filters. */
export function omitEmptyOptionalValues(value: Config, keys: string[]): Config {
  return Object.fromEntries(Object.entries(value).filter(([key, val]) => !(keys.includes(key) && val === "")));
}

function copyInput(value: unknown, child = false): Config {
  const input = record(value);
  const out = pick(input, ["source", "target", "map", "defaults", "dedupe", "children"]);
  if (input.source) {
    out.source = pick(input.source, child ? ["table", "parentField"] : ["table", "match"]);
    if (!child && out.source.match) out.source.match = pick(out.source.match, ["field", "valueFromRecord"]);
  }
  if (input.target) out.target = pick(input.target, ["table", "parentField"]);
  if (input.dedupe) out.dedupe = omitEmptyOptionalValues(pick(input.dedupe, ["enabled", "sourceIdField", "targetSourceIdField"]), ["sourceIdField", "targetSourceIdField"]);
  if (Array.isArray(input.children)) out.children = input.children.map((item: unknown) => copyInput(item, true));
  return out;
}

function deriveInput(value: unknown): Config {
  const input = record(value);
  const out = { ...input };
  if (input.source) out.source = { ...record(input.source) };
  if (input.target) out.target = { ...record(input.target) };
  if (input.maps) {
    out.maps = { ...record(input.maps) };
    for (const key of ["parent", "child"]) if (record(input.maps)[key]) {
      out.maps[key] = Object.fromEntries(Object.entries(record(record(input.maps)[key]))
        .map(([destination, source]) => [destination, canonicalRef(source)]));
    }
  }
  if (Array.isArray(input.children)) out.children = input.children.map((item: unknown) => {
    const child = { ...record(item) };
    if (child.map) child.map = Object.fromEntries(Object.entries(record(child.map))
      .map(([destination, source]) => [destination, canonicalRef(source)]));
    if (child.filters?.conditions) child.filters = { ...child.filters,
      conditions: child.filters.conditions.map((condition: Config) => ({ ...condition, field: canonicalRef(condition.field) })) };
    return child;
  });
  return out;
}

const ACTION_KEYS: Record<string, string[]> = {
  createRelated: ["target", "fieldMap", "defaults", "afterCreate"],
  navigate: ["target", "hrefTemplate"],
  duplicate: ["includeChildren", "omitFields", "afterDuplicate"],
  recalculate: [],
  external: ["kind", "pdf", "endpoint", "open", "params", "external"],
  workflow: ["workflowKey", "input", "after"],
};
const COMMON_KEYS = ["id", "label", "type", "icon", "showIn", "variant", "visibility", "confirm", "disabledWhen", "placement"];

export function serializeFormAction(value: Config): Config {
  const type = value.type || "external";
  if (!Object.hasOwn(ACTION_KEYS, type)) return { ...value };
  const out = pick(value, [...COMMON_KEYS, ...ACTION_KEYS[type]!]);
  if (out.visibility) out.visibility = canonicalVisibility(out.visibility);
  if (out.disabledWhen?.type === "missingFields") out.disabledWhen = { ...out.disabledWhen,
    fields: (out.disabledWhen.fields || []).map(canonicalRef) };
  if (type === "createRelated" && out.fieldMap) out.fieldMap = Object.fromEntries(
    Object.entries(out.fieldMap).map(([destination, source]) => [destination, canonicalRef(source)]));
  if (type === "workflow" && value.input) {
    if (value.workflowKey === "records.copyRelated") out.input = copyInput(value.input);
    if (value.workflowKey === "derive.createFromParent" || value.workflowKey === "budget.generateFromTasks") out.input = deriveInput(value.input);
    // Other workflows retain their own contracts, including unknown extensions.
  }
  if (type === "createRelated" && value.target) {
    out.target = { ...value.target };
    // A physical legacy table cannot be guessed to be a logical module slug.
    if (out.target.moduleSlug) delete out.target.table;
  }
  for (const key of ["after", "afterCreate", "afterDuplicate"]) {
    if (out[key]) {
      out[key] = omitEmptyOptionalValues(out[key], ["navigateTo", "hrefTemplate"]);
      if (!Object.keys(out[key]).length) delete out[key];
    }
  }
  return omitEmptyOptionalValues(out, ["hrefTemplate"]);
}

/** Discriminant changes keep presentation, but never carry a previous action's payload. */
export function updateFormActionConfig(previous: Config, patch: Config): Config {
  if (patch.type !== undefined && patch.type !== previous.type) {
    return { ...pick(previous, COMMON_KEYS), ...patch };
  }
  if (patch.workflowKey !== undefined && patch.workflowKey !== previous.workflowKey) {
    return { ...previous, ...patch, input: {} };
  }
  return { ...previous, ...patch };
}

/** Runtime aliases are generated on read and deliberately excluded from writes. */
export function serializeModuleSchema(value: unknown): PersistedModuleSchema {
  const schema = normalizeModuleSchema(value);
  const out: Config = { ...schema };
  delete out.table;
  delete out.formSections;
  out.db = { ...schema.db };
  if (out.db.defaultFilters) out.db.defaultFilters = serializeModuleDefaultFilters(out.db.defaultFilters);
  out.fields = schema.fields.map(field => {
    const next: Config = { ...field };
    delete next.appareance;
    if (next.type === "ReverseLink") next.virtual = true;
    if (next.visibility) next.visibility = canonicalVisibility(next.visibility);
    if (next.compute?.type === "formula" && Array.isArray(next.compute.dependencies)) next.compute = { ...next.compute,
      dependencies: next.compute.dependencies.map((dependency: Config) => ({ ...dependency, ref: canonicalRef(dependency.ref) })) };
    if (next.compute?.type === "aggregate") next.compute = { ...next.compute,
      field: canonicalRef(next.compute.field),
      where: (next.compute.where || []).map((condition: Config) => ({ ...condition, field: canonicalRef(condition.field),
        ...(condition.path ? { path: canonicalRef(condition.path) } : {}) })) };
    if (next.ref) {
      next.ref = canonicalizeReadRefs(next.ref, ["displayField", "styleIconField", "styleColorField"]);
      if (next.ref.filters) next.ref.filters = serializeSelectorTableFilters(next.ref.filters);
      if (next.ref.sort) next.ref.sort = canonicalQuery(next.ref.sort);
    }
    return next;
  });
  const ui = { ...schema.ui } as Config;
  const view = (item: Config): Config => {
    const next: Config = { ...item, config: { ...record(item.config) } };
    if (item.type === "planEditor") {
      delete next.sourceField;
      delete next.options;
      const options = { ...record(next.config.options) };
      if (options.exportSubtitleField) options.exportSubtitleField = canonicalRef(options.exportSubtitleField);
      if (Array.isArray(options.export?.metadataFields)) options.export = { ...options.export, metadataFields: options.export.metadataFields.map((entry: Config) => ({ ...entry, field: canonicalRef(entry.field) })) };
      for (const key of ["templatesSource", "blocksSource", "symbolsSource", "defaultLayersSource"]) {
        if (options[key]) options[key] = omitEmptyOptionalValues(canonicalizeReadRefs(options[key]), ["moduleSlug", "table", "labelField", "displayField"]);
      }
      if (Array.isArray(options.linkTargets)) options.linkTargets = options.linkTargets.map((target: Config) => omitEmptyOptionalValues(canonicalizeReadRefs(target, ["displayField"]), ["moduleSlug", "table"]));
      next.config.options = options;
    }
    if (item.type === "calendar") next.config = omitEmptyOptionalValues(canonicalizeReadRefs(next.config, ["titleField", "startField", "endField", "allDayField", "colorField", "descriptionField", "resourceField"]), ["endField", "allDayField", "colorField", "descriptionField", "resourceField", "parentLinkField"]);
    if (item.type === "treeview" && next.config.source?.moduleSlug) {
      next.config.source = { ...next.config.source };
      delete next.config.source.table;
    }
    if (item.type === "treeview") {
      if (next.config.grouping?.groupByField) next.config.grouping = { ...next.config.grouping,
        groupByField: canonicalRef(next.config.grouping.groupByField),
        ...(next.config.grouping.groupTitleField ? { groupTitleField: canonicalRef(next.config.grouping.groupTitleField) } : {}) };
      if (Array.isArray(next.config.columns)) next.config.columns = next.config.columns.map((column: Config) => ({ ...column, field: canonicalRef(column.field) }));
      if (next.config.totals?.sumField) next.config.totals = { ...next.config.totals, sumField: canonicalRef(next.config.totals.sumField) };
      if (next.config.source?.orderBy?.field) next.config.source.orderBy = { ...next.config.source.orderBy, field: canonicalRef(next.config.source.orderBy.field) };
      if (Array.isArray(next.config.source?.filters)) next.config.source.filters = next.config.source.filters.map((filter: Config) => ({ ...filter,
        field: canonicalRef(filter.field),
        ...(filter.valueFromParent ? { valueFromParent: canonicalRef(filter.valueFromParent) } : {}),
        ...(filter.valuesFromParent ? { valuesFromParent: canonicalRef(filter.valuesFromParent) } : {}) }));
    }
    if (item.type === "form" && Array.isArray(next.config.formSections)) {
      next.config.formSections = next.config.formSections.map((section: Config) => ({
        ...section,
        fields: (section.fields || []).map((field: unknown) => typeof field === "string" ? field : record(field).name).filter(Boolean),
      }));
    }
    return next;
  };
  ui.tabs = (ui.tabs || []).map(view);
  ui.specialViews = (ui.specialViews || []).map(view);
  if (Array.isArray(ui.formActions)) ui.formActions = ui.formActions.map(serializeFormAction);
  out.ui = ui;
  return out as PersistedModuleSchema;
}
