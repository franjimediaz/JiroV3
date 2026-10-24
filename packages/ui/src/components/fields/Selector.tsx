"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { dataProvider } from "../../providers/DataProvider";
import { PopupSelector } from "../../modals/PopUpSelector";
import {
  getRecordName,
  getRecordNameFieldName,
  getFieldRefValue,
  isDirectFieldRef,
  matchesSelectorTableFilterGroup,
  resolveSelectorTableFiltersToQuery,
  type QueryFilter,
  type QuerySort,
  type SelectorTableFilterResolutionContext,
  type SelectorTableFiltersInput,
  type FieldRefLike,
} from "@repo/types";
import { getRecordNameSchema } from "../../utils/recordNameSchema";

type PopupItem = { value: string; label: string; raw?: any };
type CacheEntry = { label: string; icon?: string; color?: string };

function collectResolvedFilterFieldRefs(group: any): FieldRefLike[] {
  if (!group || !Array.isArray(group.items)) return [];
  return group.items.flatMap((item: any) =>
    Array.isArray(item?.items) ? collectResolvedFilterFieldRefs(item) : item?.field ? [item.field] : []
  );
}

type Props = {
  moduleSlug: string;
  displayField: FieldRefLike;
  valueField?: string;
  filters?: SelectorTableFiltersInput;
  sort?: QuerySort[];
  value: any;
  onChange: (v: any) => void;
  readOnly?: boolean;
  multiple?: boolean;
  label?: string;
  placeholder?: string;
  limit?: number;
  hasStyle?: boolean;
  styleIconField?: FieldRefLike;
  styleColorField?: FieldRefLike;
  displayValue?: string;
  isDisplayLoading?: boolean;
  displayIcon?: string;
  displayColor?: string;
  filterContext?: SelectorTableFilterResolutionContext;
};

function ensureList() {
  const list = dataProvider?.list;
  if (!list) throw new Error("dataProvider.list no esta implementado");
  return list;
}

function toStr(v: any) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function selectorLabel(row: any, schema: any, displayField: FieldRefLike, valueField: string, fallback?: string) {
  if (isDirectFieldRef(displayField)) {
    return getRecordName(row, schema, {
      legacyField: typeof displayField === "string" ? displayField : displayField.field,
      valueField,
      fallback,
    });
  }
  const value = getFieldRefValue(row, displayField);
  return value == null || value === "" ? (fallback || toStr(row?.[valueField])) : String(value);
}

function renderStyled(label: string, icon?: string, color?: string) {
  return (
    <span className="d-inline-flex align-items-center gap-2">
      {icon ? (
        <i className={icon.includes(" ") ? icon : `bi ${icon}`} style={{ color: color || "inherit" }} />
      ) : null}
      <span>{label}</span>
    </span>
  );
}

export default function SelectorTabla({
  moduleSlug,
  displayField,
  valueField = "id",
  filters = [],
  sort = [],
  value = null,
  onChange,
  readOnly,
  multiple = false,
  label,
  placeholder = "Seleccionar",
  limit = 50,
  hasStyle = false,
  styleIconField = "icon",
  styleColorField = "color",
  displayValue,
  isDisplayLoading = false,
  displayIcon,
  displayColor,
  filterContext,
}: Props) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupItems, setPopupItems] = useState<PopupItem[]>([]);
  const [popupLoading, setPopupLoading] = useState(false);
  const [labelCache, setLabelCache] = useState<Record<string, CacheEntry>>({});

  const normalizedValue = useMemo(() => {
    if (multiple) return Array.isArray(value) ? value.map(toStr) : [];
    return value ? toStr(value) : "";
  }, [value, multiple]);

  const resolvedFilters = useMemo(
    () => resolveSelectorTableFiltersToQuery(filters, filterContext),
    [filters, filterContext]
  );

  useEffect(() => {
    if (isDisplayLoading) return;

    if (multiple) {
      const ids = normalizedValue as string[];
      if (ids.length !== 1 || !displayValue) return;

      const id = ids[0];
      setLabelCache((prev) => ({
        ...prev,
        [id]: {
          label: displayValue,
          icon: displayIcon ?? prev[id]?.icon,
          color: displayColor ?? prev[id]?.color,
        },
      }));
      return;
    }

    const id = normalizedValue as string;
    if (!id || !displayValue) return;

    setLabelCache((prev) => ({
      ...prev,
      [id]: {
        label: displayValue,
        icon: displayIcon ?? prev[id]?.icon,
        color: displayColor ?? prev[id]?.color,
      },
    }));
  }, [multiple, normalizedValue, displayValue, displayIcon, displayColor, isDisplayLoading]);

  const effectiveSelectedEntries = useMemo(() => {
    const ids = multiple ? (normalizedValue as string[]) : [normalizedValue as string];

    return ids
      .filter(Boolean)
      .map((id, index) => {
        const cached = labelCache[id];
        const isSingleSelection = !multiple || ids.length === 1;

        return {
          value: id,
          label:
            isDisplayLoading
              ? "Cargando..."
              : isSingleSelection && displayValue
              ? displayValue
              : cached?.label || id,
          icon: isSingleSelection && displayIcon ? displayIcon : cached?.icon,
          color: isSingleSelection && displayColor ? displayColor : cached?.color,
        };
      });
  }, [multiple, normalizedValue, labelCache, isDisplayLoading, displayValue, displayIcon, displayColor]);

  const summaryText = useMemo(() => {
    if (isDisplayLoading) return "Cargando...";

    if (multiple) {
      const entries = effectiveSelectedEntries;
      if (!entries.length) return placeholder;
      if (displayValue) return displayValue;
      if (entries.length > 3) return `${entries.length} seleccionados`;
      return entries.map((entry) => entry.label).join(", ");
    }

    const entry = effectiveSelectedEntries[0];
    if (!entry) return placeholder;
    return entry.label || entry.value;
  }, [multiple, effectiveSelectedEntries, placeholder, displayValue, isDisplayLoading]);

  const fetchItems = useCallback(
    async (searchText: string) => {
      if (!moduleSlug) return;

      const list = ensureList();
      setPopupLoading(true);

      try {
        const schema = await getRecordNameSchema(dataProvider, moduleSlug);
        const nextFilters: QueryFilter[] = (resolvedFilters.filters || []).map((filter) => ({
          field: filter.field,
          op: filter.op as QueryFilter["op"],
          value: filter.value,
        }));
        const term = (searchText || "").trim();

        if (term) {
          nextFilters.push({
            field: isDirectFieldRef(displayField)
              ? getRecordNameFieldName(schema, typeof displayField === "string" ? displayField : displayField.field)
              : displayField,
            op: "ilike",
            value: `%${term}%`,
          });
        }

        const requestedLimit = resolvedFilters.canQueryDirectly ? limit : Math.max(limit, 200);
        const res = await list({
          moduleSlug,
          filters: nextFilters,
          sort,
          limit: requestedLimit,
          hasStyle,
          styleIconField,
          styleColorField,
          fieldRefs: [displayField, styleIconField, styleColorField, ...collectResolvedFilterFieldRefs(resolvedFilters.group)],
        } as any);

        const rawRows = Array.isArray(res?.data) ? res.data : [];
        const rows = resolvedFilters.canQueryDirectly
          ? rawRows
          : rawRows.filter((row: any) => matchesSelectorTableFilterGroup(row, resolvedFilters.group));
        const items: PopupItem[] = rows.map((row: any) => ({
          value: toStr(row[valueField]),
          label: selectorLabel(row, schema, displayField, valueField),
          raw: row,
        }));

        setPopupItems(items);

        const newCache: Record<string, CacheEntry> = {};
        items.forEach((item) => {
          const raw = item.raw || {};
          newCache[item.value] = {
            label: item.label,
            icon: toStr(getFieldRefValue(raw, styleIconField)),
            color: toStr(getFieldRefValue(raw, styleColorField)),
          };
        });
        setLabelCache((prev) => ({ ...prev, ...newCache }));
      } finally {
        setPopupLoading(false);
      }
    },
    [
      moduleSlug,
      displayField,
      valueField,
      resolvedFilters,
      sort,
      limit,
      hasStyle,
      styleIconField,
      styleColorField,
    ]
  );

  useEffect(() => {
    (async () => {
      if (!moduleSlug) return;

      const list = ensureList();
      const needResolve: string[] = [];

      if (multiple) {
        for (const id of normalizedValue as string[]) {
          if (id && !labelCache[id]) needResolve.push(id);
        }
      } else {
        const id = normalizedValue as string;
        if (id && !labelCache[id]) needResolve.push(id);
      }

      if (!needResolve.length) return;

      try {
        const schema = await getRecordNameSchema(dataProvider, moduleSlug);
        const res = await list({
          moduleSlug,
          filters: [{ field: valueField, op: "in", value: needResolve }],
          limit: needResolve.length,
          hasStyle,
          styleIconField,
          styleColorField,
          fieldRefs: [displayField, styleIconField, styleColorField],
        } as any);
        const rows = Array.isArray(res?.data) ? res.data : [];
        const rowsById = new Map(rows.map((row: any) => [toStr(row?.[valueField]), row]));
        const resolved: Record<string, CacheEntry> = {};
        for (const id of needResolve) {
          const row = rowsById.get(id);
          const nextEntry: CacheEntry = {
            label: row ? selectorLabel(row, schema, displayField, valueField, id) : id,
            icon: toStr(getFieldRefValue(row, styleIconField)),
            color: toStr(getFieldRefValue(row, styleColorField)),
          };
          resolved[id] = nextEntry;
        }
        setLabelCache((prev) => ({ ...prev, ...resolved }));
      } catch {
        // Fallback silencioso: el resumen ya cae al id.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleSlug, valueField, displayField, multiple, hasStyle, styleIconField, styleColorField, JSON.stringify(normalizedValue)]);

  const openSelectorTablaPopup = async () => {
    if (readOnly) return;
    setPopupOpen(true);
    await fetchItems("");
  };

  const handleSearch = async (text: string) => {
    await fetchItems(text);
  };

  const handleApply = (next: any) => {
    if (Array.isArray(next)) {
      const newCache: Record<string, CacheEntry> = {};
      popupItems.forEach((item) => {
        if (next.includes(item.value)) {
          newCache[item.value] = {
            label: item.label,
            icon: toStr(getFieldRefValue(item.raw, styleIconField)),
            color: toStr(getFieldRefValue(item.raw, styleColorField)),
          };
        }
      });
      setLabelCache((prev) => ({ ...prev, ...newCache }));
      onChange(next);
    } else {
      const id = toStr(next);
      const found = popupItems.find((item) => item.value === id);
      if (found) {
        setLabelCache((prev) => ({
          ...prev,
          [id]: {
            label: found.label,
            icon: toStr(getFieldRefValue(found.raw, styleIconField)),
            color: toStr(getFieldRefValue(found.raw, styleColorField)),
          },
        }));
      }
      onChange(id === "" ? null : id);
    }

    setPopupOpen(false);
  };

  const summaryNode = useMemo(() => {
    if (isDisplayLoading) return "Cargando...";
    if (!hasStyle) return summaryText;

    if (multiple) {
      if (!effectiveSelectedEntries.length) return placeholder;
      if (effectiveSelectedEntries.length > 1 && !displayValue) return `${effectiveSelectedEntries.length} seleccionados`;

      const entry = effectiveSelectedEntries[0];
      return renderStyled(entry.label || entry.value, entry.icon, entry.color);
    }

    const entry = effectiveSelectedEntries[0];
    if (!entry) return placeholder;
    return renderStyled(entry.label || entry.value, entry.icon, entry.color);
  }, [
    hasStyle,
    effectiveSelectedEntries,
    summaryText,
    placeholder,
    displayValue,
    isDisplayLoading,
  ]);

  return (
    <>
      <button
        type="button"
        className="form-control d-flex justify-content-between align-items-center"
        onClick={openSelectorTablaPopup}
        disabled={readOnly}
        title={summaryText}
      >
        <span style={{ opacity: (multiple ? (normalizedValue as string[]).length : !!(normalizedValue as string)) ? 1 : 0.75 }}>
          {summaryNode}
        </span>
        <i
          className="bi bi-search ms-2"
          style={{ opacity: 0.7, fontSize: "0.9rem" }}
          aria-hidden="true"
        />
      </button>

      <PopupSelector
        open={popupOpen}
        title={label || `Seleccionar (${moduleSlug})`}
        multiple={multiple}
        value={multiple ? (normalizedValue as string[]) : (normalizedValue as string)}
        items={popupItems}
        loading={popupLoading}
        onSearch={handleSearch}
        onClose={() => setPopupOpen(false)}
        onApply={handleApply}
      />
    </>
  );
}
