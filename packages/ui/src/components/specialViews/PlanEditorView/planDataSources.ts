import type { DataProvider } from "../../../engines/computeEngine";
import type {
  PlanDynamicSourceConfig,
  PlanLayer,
  PlanLinkTargetConfig,
  PlanObjectSource,
  PlanSymbolDefinition,
} from "./planTypes";

type RecordLike = Record<string, unknown>;

export type LinkTargetRecord = {
  recordId: string;
  displayValue: string;
  raw?: unknown;
};

export async function loadPlanSymbols(config: PlanDynamicSourceConfig | undefined, dataProvider?: DataProvider) {
  if (!isEnabledSource(config)) return [];
  const rows = await loadRows(config, dataProvider);
  return rows.map((row) => normalizeSymbolRecord(row, config)).filter(Boolean) as PlanSymbolDefinition[];
}

export async function loadDefaultLayers(config: PlanDynamicSourceConfig | undefined, dataProvider?: DataProvider) {
  if (!isEnabledSource(config)) return [];
  const rows = await loadRows(config, dataProvider);
  return rows.map((row, index) => normalizeLayerRecord(row, config, index + 1)).filter(Boolean) as PlanLayer[];
}

export async function loadLinkTargetRecords(config: PlanLinkTargetConfig, dataProvider?: DataProvider, searchText?: string): Promise<LinkTargetRecord[]> {
  if (!dataProvider?.list || !config.moduleSlug) return [];
  const filters = [...(config.filters || [])];
  const displayField = config.displayField || "id";
  const valueField = config.valueField || "id";

  if (searchText?.trim()) {
    filters.push({ field: displayField, op: "ilike" as any, value: `%${searchText.trim()}%` });
  }

  const result = await dataProvider.list({
    moduleSlug: config.moduleSlug,
    filters,
    sort: config.sort,
    limit: 50,
  });

  return (Array.isArray(result?.data) ? result.data : [])
    .map((row) => ({
      recordId: toText((row as RecordLike)?.[valueField]),
      displayValue: toText((row as RecordLike)?.[displayField]) || toText((row as RecordLike)?.[valueField]),
      raw: row,
    }))
    .filter((row) => row.recordId);
}

export function normalizeSymbolRecord(record: unknown, mapping: PlanDynamicSourceConfig): PlanSymbolDefinition | null {
  if (!isRecord(record)) return null;
  const valueField = mapping.valueField || "id";
  const labelField = mapping.labelField || mapping.displayField || valueField;
  const id = toText(record[valueField]);
  if (!id) return null;

  return {
    id,
    label: toText(record[labelField]) || id,
    icon: mapping.iconField ? toText(record[mapping.iconField]) || undefined : undefined,
    color: mapping.colorField ? toText(record[mapping.colorField]) || undefined : undefined,
    category: mapping.categoryField ? toText(record[mapping.categoryField]) || undefined : undefined,
    type: mapping.typeField ? toText(record[mapping.typeField]) || undefined : undefined,
    raw: record,
    source: buildSource(mapping, id),
  };
}

export function normalizeLayerRecord(record: unknown, mapping: PlanDynamicSourceConfig, order: number): PlanLayer | null {
  if (!isRecord(record)) return null;
  const valueField = mapping.valueField || "id";
  const labelField = mapping.labelField || mapping.displayField || valueField;
  const id = toText(record[valueField]);
  if (!id) return null;

  return {
    id: `source_${id}`,
    name: toText(record[labelField]) || id,
    visible: mapping.visibleField ? record[mapping.visibleField] !== false : true,
    locked: mapping.lockedField ? record[mapping.lockedField] === true : false,
    order: mapping.orderField ? toNumber(record[mapping.orderField], order) : order,
    color: mapping.colorField ? toText(record[mapping.colorField]) || undefined : undefined,
    source: buildSource(mapping, id),
  };
}

async function loadRows(config: PlanDynamicSourceConfig, dataProvider?: DataProvider) {
  if (!dataProvider?.list || !config.moduleSlug) return [];
  const result = await dataProvider.list({
    moduleSlug: config.moduleSlug,
    filters: config.filters || [],
    sort: config.sort,
    limit: 500,
    hasStyle: !!(config.iconField || config.colorField),
    styleIconField: config.iconField,
    styleColorField: config.colorField,
  });
  return Array.isArray(result?.data) ? result.data : [];
}

function isEnabledSource(config: PlanDynamicSourceConfig | undefined): config is PlanDynamicSourceConfig {
  return !!config?.enabled && !!config.moduleSlug;
}

function buildSource(config: PlanDynamicSourceConfig, recordId: string): PlanObjectSource {
  return {
    moduleSlug: config.moduleSlug || undefined,
    table: config.table || undefined,
    recordId,
  };
}

function isRecord(value: unknown): value is RecordLike {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
