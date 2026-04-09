"use client";

import React from "react";
import type { Field } from "@repo/types";

export type RelationDisplayEntry = {
  label: string;
  icon?: string;
  color?: string;
};

export type RelationDisplayStatus = "resolved" | "failed";
export type RelationDisplayStatusMap = Record<string, RelationDisplayStatus>;

export type RelationDisplayConfig = {
  fieldName: string;
  moduleSlug: string;
  valueField: string;
  displayField: string;
  multiple: boolean;
  hasStyle: boolean;
  styleIconField: string;
  styleColorField: string;
};

type RelationBucket = {
  config: RelationDisplayConfig;
  ids: Set<string>;
};

export function getRelationDisplayConfig(field: Field): RelationDisplayConfig | null {
  if (field.type !== "selectorTabla") return null;

  const ref = (field as any).ref;
  const moduleSlug = ref?.moduleSlug ? String(ref.moduleSlug) : "";
  if (!moduleSlug) return null;

  return {
    fieldName: field.name,
    moduleSlug,
    valueField: ref?.valueField ? String(ref.valueField) : "id",
    displayField: ref?.displayField ? String(ref.displayField) : "id",
    multiple: !!ref?.multiple,
    hasStyle: !!((field as any).hasStyle ?? ref?.hasStyle),
    styleIconField: String((field as any).styleIconField ?? ref?.styleIconField ?? "icon"),
    styleColorField: String((field as any).styleColorField ?? ref?.styleColorField ?? "color"),
  };
}

export function getRelationBucketKey(config: RelationDisplayConfig) {
  return [
    config.moduleSlug,
    config.valueField,
    config.displayField,
    config.hasStyle ? 1 : 0,
    config.styleIconField,
    config.styleColorField,
  ].join("|");
}

export function getRelationCacheKey(config: RelationDisplayConfig, value: string) {
  return `${getRelationBucketKey(config)}|${value}`;
}

export function normalizeRelationId(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const nested = (value as any).id ?? (value as any).value ?? null;
    return normalizeRelationId(nested);
  }
  return null;
}

export function normalizeRelationIds(value: any, multiple: boolean) {
  if (multiple) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => normalizeRelationId(item))
      .filter((item): item is string => !!item);
  }

  const id = normalizeRelationId(value);
  return id ? [id] : [];
}

export function getRelationDisplayFallback(value: any, multiple: boolean) {
  const ids = normalizeRelationIds(value, multiple);
  return ids.join(", ");
}

export function collectRelationPendingKeys(params: {
  rows: any[];
  fields: Field[];
  getValue: (row: any, field: Field) => any;
  cache: Record<string, RelationDisplayEntry>;
  statusByKey?: RelationDisplayStatusMap;
}) {
  const { rows, fields, getValue, cache, statusByKey } = params;
  const pendingKeys: Record<string, boolean> = {};

  for (const field of fields) {
    const config = getRelationDisplayConfig(field);
    if (!config) continue;

    for (const row of rows) {
      const ids = normalizeRelationIds(getValue(row, field), config.multiple);
      for (const id of ids) {
        const cacheKey = getRelationCacheKey(config, id);
        if (cache[cacheKey]?.label) continue;
        if (statusByKey?.[cacheKey] === "failed") continue;
        pendingKeys[cacheKey] = true;
      }
    }
  }

  return pendingKeys;
}

export function buildRelationDisplayEntry(config: RelationDisplayConfig, row: any): RelationDisplayEntry | null {
  if (!row || typeof row !== "object") return null;

  const label = String(row?.[config.displayField] ?? row?.[config.valueField] ?? "");
  if (!label) return null;

  return {
    label,
    icon: config.hasStyle ? row?.[config.styleIconField] : undefined,
    color: config.hasStyle ? row?.[config.styleColorField] : undefined,
  };
}

export function getRelationObjectDisplayEntry(config: RelationDisplayConfig, value: any): RelationDisplayEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return buildRelationDisplayEntry(config, value);
}

export function getRelationArrayObjectDisplayEntry(config: RelationDisplayConfig, value: any): RelationDisplayEntry | null {
  if (!Array.isArray(value)) return null;

  const entries = value
    .map((item) => getRelationObjectDisplayEntry(config, item))
    .filter((item): item is RelationDisplayEntry => !!item);

  if (!entries.length) return null;

  return {
    label: entries.map((item) => item.label).join(", "),
  };
}

export function renderRelationDisplay(label: string, icon?: string, color?: string) {
  const isBootstrapIcon = !!icon && (icon.includes("bi-") || icon.startsWith("bi "));

  return (
    <span className="d-inline-flex align-items-center gap-2">
      {icon ? (
        isBootstrapIcon ? (
          <i
            className={icon.includes(" ") ? icon : `bi ${icon}`}
            style={{ color: color || "inherit" }}
            aria-hidden="true"
          />
        ) : (
          <span style={{ color: color || "inherit" }}>{icon}</span>
        )
      ) : null}
      <span>{label}</span>
    </span>
  );
}

export function getRelationDisplayResult(params: {
  config: RelationDisplayConfig;
  rawValue: any;
  cache: Record<string, RelationDisplayEntry>;
  pendingKeys?: Record<string, boolean>;
  statusByKey?: RelationDisplayStatusMap;
}) {
  const { config, rawValue, cache, pendingKeys, statusByKey } = params;
  const arrayObjectEntry = getRelationArrayObjectDisplayEntry(config, rawValue);
  if (arrayObjectEntry) return { kind: "resolved" as const, entry: arrayObjectEntry };

  const objectEntry = getRelationObjectDisplayEntry(config, rawValue);
  if (objectEntry) return { kind: "resolved" as const, entry: objectEntry };

  const ids = normalizeRelationIds(rawValue, config.multiple);
  if (!ids.length) return { kind: "empty" as const, text: "�" };

  const entries = ids.map((id) => {
    const key = getRelationCacheKey(config, id);
    return { id, key, entry: cache[key], status: statusByKey?.[key] };
  });

  const isLoading = entries.some(({ key, entry, status }) => !entry && status !== "failed" && !!pendingKeys?.[key]);
  if (isLoading) return { kind: "loading" as const, text: "Cargando..." };

  const resolvedEntries = entries.filter((item) => !!item.entry) as Array<{
    id: string;
    key: string;
    entry: RelationDisplayEntry;
    status?: RelationDisplayStatus;
  }>;

  if (resolvedEntries.length) {
    const text = entries.map((item) => item.entry?.label ?? item.id).join(", ");
    const first = resolvedEntries[0]?.entry;
    return {
      kind: "resolved" as const,
      entry: {
        label: text,
        icon: ids.length === 1 ? first?.icon : undefined,
        color: ids.length === 1 ? first?.color : undefined,
      },
    };
  }

  return {
    kind: "fallback" as const,
    text: getRelationDisplayFallback(rawValue, config.multiple) || "�",
  };
}

export async function preloadRelationDisplayCache(params: {
  rows: any[];
  fields: Field[];
  getValue: (row: any, field: Field) => any;
  dataProvider: { list?: (input: any) => Promise<any> };
  cache: Record<string, RelationDisplayEntry>;
  statusByKey?: RelationDisplayStatusMap;
}) {
  const { rows, fields, getValue, dataProvider, cache, statusByKey } = params;
  const buckets = new Map<string, RelationBucket>();
  const pendingKeys: Record<string, boolean> = {};
  const statusPatch: RelationDisplayStatusMap = {};

  for (const field of fields) {
    const config = getRelationDisplayConfig(field);
    if (!config) continue;

    const bucketKey = getRelationBucketKey(config);
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, { config, ids: new Set<string>() });
    }

    const bucket = buckets.get(bucketKey)!;
    for (const row of rows) {
      const ids = normalizeRelationIds(getValue(row, field), config.multiple);
      for (const id of ids) {
        const cacheKey = getRelationCacheKey(config, id);
        if (cache[cacheKey]?.label) continue;
        if (statusByKey?.[cacheKey] === "failed") continue;
        bucket.ids.add(id);
        pendingKeys[cacheKey] = true;
      }
    }
  }

  const patch: Record<string, RelationDisplayEntry> = {};
  if (typeof dataProvider?.list !== "function") {
    for (const cacheKey of Object.keys(pendingKeys)) {
      statusPatch[cacheKey] = "failed";
    }
    return { patch, pendingKeys, statusPatch };
  }

  for (const bucket of buckets.values()) {
    const ids = Array.from(bucket.ids);
    if (!ids.length) continue;

    try {
      const result = await dataProvider.list({
        moduleSlug: bucket.config.moduleSlug,
        filters: [{ field: bucket.config.valueField, op: "in", value: ids }],
        limit: Math.min(ids.length, 500),
        hasStyle: bucket.config.hasStyle,
        styleIconField: bucket.config.styleIconField,
        styleColorField: bucket.config.styleColorField,
      });

      const rowsResult = Array.isArray((result as any)?.data) ? (result as any).data : [];
      const resolvedKeys = new Set<string>();

      for (const row of rowsResult) {
        const id = normalizeRelationId(row?.[bucket.config.valueField]);
        const entry = buildRelationDisplayEntry(bucket.config, row);
        if (!id || !entry) continue;

        const cacheKey = getRelationCacheKey(bucket.config, id);
        patch[cacheKey] = entry;
        statusPatch[cacheKey] = "resolved";
        resolvedKeys.add(cacheKey);
      }

      for (const id of ids) {
        const cacheKey = getRelationCacheKey(bucket.config, id);
        if (!resolvedKeys.has(cacheKey) && !patch[cacheKey]) {
          statusPatch[cacheKey] = "failed";
        }
      }
    } catch {
      for (const id of ids) {
        statusPatch[getRelationCacheKey(bucket.config, id)] = "failed";
      }
    }
  }

  return { patch, pendingKeys, statusPatch };
}
