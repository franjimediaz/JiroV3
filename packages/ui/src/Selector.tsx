"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { dataProvider } from "./providers/DataProvider";
// AJUSTA ESTA RUTA a donde tengas el componente real
import { PopupSelector } from "./PopUpSelector";

type RefFilter = { field: string; op: string; value: any };
type RefSort = { field: string; direction: "asc" | "desc" };

type PopupItem = { value: string; label: string; raw?: any };

type Props = {
  moduleSlug: string;
  displayField: string;
  valueField?: string;
  filters?: RefFilter[];
  sort?: RefSort[];

  value: any; // string | string[]
  onChange: (v: any) => void;

  readOnly?: boolean;
  multiple?: boolean;
  label?: string; // para title del popup
  placeholder?: string;
  limit?: number; // cantidad por búsqueda
};

function ensureList() {
  const list = dataProvider?.list;
  if (!list) throw new Error("dataProvider.list no está implementado");
  return list;
}

function toStr(v: any) {
  if (v === null || v === undefined) return "";
  return String(v);
}

export default function SelectorTabla({
  moduleSlug,
  displayField,
  valueField = "id",
  filters = [],
  sort = [],
  value,
  onChange,
  readOnly,
  multiple = false,
  label,
  placeholder = "— Seleccionar —",
  limit = 20,
}: Props) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupItems, setPopupItems] = useState<PopupItem[]>([]);
  const [popupLoading, setPopupLoading] = useState(false);

  // Cache: id -> label (para mostrar en el botón aunque el popup no esté abierto)
  const [labelCache, setLabelCache] = useState<Record<string, string>>({});

  const normalizedValue = useMemo(() => {
    if (multiple) return Array.isArray(value) ? value.map(toStr) : [];
    return value ? toStr(value) : "";
  }, [value, multiple]);

  const summary = useMemo(() => {
    if (multiple) {
      const arr = normalizedValue as string[];
      if (!arr.length) return placeholder;

      const labels = arr.map((v) => labelCache[v] || v);
      if (labels.length > 3) return `${labels.length} seleccionados`;
      return labels.join(", ");
    }

    const v = normalizedValue as string;
    if (!v) return placeholder;
    return labelCache[v] || v;
  }, [normalizedValue, multiple, labelCache, placeholder]);

  // --- Cargar items para el popup (con búsqueda) ---
  const fetchItems = useCallback(
    async (searchText: string) => {
      if (!moduleSlug) return;

      const list = ensureList();
      setPopupLoading(true);

      try {
        const nextFilters: RefFilter[] = [...filters];

        const term = (searchText || "").trim();
        if (term) {
          // OJO: esto asume que tu backend soporta "ilike"
          nextFilters.push({
            field: displayField,
            op: "ilike",
            value: `%${term}%`,
          });
        }

        // Tu list() recibe un único objeto tipo ListInput (por lo que me dijiste)
        const res = await list({
          moduleSlug,
          filters: nextFilters,
          sort,
          limit,
        } as any);

        const rows = Array.isArray(res?.data) ? res.data : [];

        const items: PopupItem[] = rows.map((r: any) => ({
          value: toStr(r[valueField]),
          label: toStr(r[displayField]) || toStr(r[valueField]),
          raw: r,
        }));

        setPopupItems(items);

        // Alimenta cache con lo que venga (sirve para pintar summary)
        const newCache: Record<string, string> = {};
        items.forEach((it) => (newCache[it.value] = it.label));
        setLabelCache((prev) => ({ ...prev, ...newCache }));
      } finally {
        setPopupLoading(false);
      }
    },
    [moduleSlug, displayField, valueField, filters, sort, limit]
  );

  // Pre-resolver labels del value actual si no están en caché
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
        // resolvemos uno a uno (simple y seguro). Si prefieres, lo optimizamos con "in".
        for (const id of needResolve) {
          const res = await list({
            moduleSlug,
            filters: [{ field: valueField, op: "=", value: id }],
            limit: 1,
          } as any);

          const row = Array.isArray(res?.data) ? res.data[0] : null;
          const lbl = row ? toStr(row[displayField]) : id;
          setLabelCache((prev) => ({ ...prev, [id]: lbl }));
        }
      } catch {
        // si falla, al menos mostramos el id (ya lo hace summary)
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleSlug, valueField, displayField, multiple, JSON.stringify(normalizedValue)]);

  const openSelectorTablaPopup = async () => {
    if (readOnly) return;
    setPopupOpen(true);
    // primera carga sin texto
    await fetchItems("");
  };

  const handleSearch = async (text: string) => {
    await fetchItems(text);
  };

  const handleApply = (next: any) => {
    // next puede ser string o string[]
    if (Array.isArray(next)) {
      const newCache: Record<string, string> = {};
      popupItems.forEach((item) => {
        if (next.includes(item.value)) {
          newCache[item.value] = item.label;
        }
      });
      setLabelCache((prev) => ({ ...prev, ...newCache }));
      onChange(next);
    } else {
      const id = toStr(next);
      const found = popupItems.find((i) => i.value === id);
      if (found) {
        setLabelCache((prev) => ({ ...prev, [id]: found.label }));
      }
      onChange(id);
    }

    setPopupOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="form-control d-flex justify-content-between align-items-center"
        onClick={openSelectorTablaPopup}
        disabled={readOnly}
        title={summary}
      >
        <span style={{ opacity: (multiple ? (normalizedValue as string[]).length : !!(normalizedValue as string)) ? 1 : 0.75 }}>
          {summary}
        </span>
        <span style={{ opacity: 0.7 }}>🔎</span>
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
