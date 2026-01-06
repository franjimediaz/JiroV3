"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { dataProvider } from "./providers/DataProvider";
// AJUSTA ESTA RUTA a donde tengas el componente real
import { PopupSelector } from "./modals/PopUpSelector";

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
  hasStyle?: boolean;
  styleIconField?: string;  // default "icon"
  styleColorField?: string;
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
  hasStyle = false,
  styleIconField = "icon",
  styleColorField = "color",
}: Props) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupItems, setPopupItems] = useState<PopupItem[]>([]);
  const [popupLoading, setPopupLoading] = useState(false);

  // Cache: id -> label (para mostrar en el botón aunque el popup no esté abierto)
  type CacheEntry = { label: string; icon?: string; color?: string };

  const [labelCache, setLabelCache] = useState<Record<string, CacheEntry>>({});


  const normalizedValue = useMemo(() => {
    if (multiple) return Array.isArray(value) ? value.map(toStr) : [];
    return value ? toStr(value) : "";
  }, [value, multiple]);


  const summaryText = useMemo(() => {
  if (multiple) {
    const arr = normalizedValue as string[];
    if (!arr.length) return placeholder;

    const labels = arr.map((id) => labelCache[id]?.label || id);
    if (labels.length > 3) return `${labels.length} seleccionados`;
    return labels.join(", ");
  }

  const id = normalizedValue as string;
  if (!id) return placeholder;
  return labelCache[id]?.label || id;
}, [multiple, normalizedValue, labelCache, placeholder]);




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

        
        const res = await list({
          moduleSlug,
          filters: nextFilters,
          sort,
          limit,
          hasStyle,
          styleIconField,
          styleColorField,
        } as any);

        const rows = Array.isArray(res?.data) ? res.data : [];
        

        const items: PopupItem[] = rows.map((r: any) => ({
          value: toStr(r[valueField]),
          label: toStr(r[displayField]) || toStr(r[valueField]),
          raw: r,
        }));

        setPopupItems(items);

        // Alimenta cache con lo que venga (sirve para pintar summary)
        const newCache: Record<string, CacheEntry> = {};
        items.forEach((it) => {
          const raw = it.raw || {};
          newCache[it.value] = {
            label: it.label,
            icon: raw?.[styleIconField],
            color: raw?.[styleColorField],
          };
        });
        setLabelCache((prev) => ({ ...prev, ...newCache }));
      } finally {
        setPopupLoading(false);
      }
    },
    [moduleSlug, displayField, valueField, filters, sort, limit, styleIconField, styleColorField]
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
          setLabelCache((prev) => ({ ...prev, [id]: {
                                label: lbl,
                                icon: row?.[styleIconField],
                                color: row?.[styleColorField],
                              },}));
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
      const newCache: Record<string, CacheEntry> = {};
      popupItems.forEach((item) => {
        if (next.includes(item.value)) {
          newCache[item.value] = {
          label: item.label,
          icon: item.raw?.[styleIconField],
          color: item.raw?.[styleColorField],
        };
        }
      });
      setLabelCache((prev) => ({ ...prev, ...newCache }));
      onChange(next);
    } else {
      const id = toStr(next);
      const found = popupItems.find((i) => i.value === id);
      if (found) {
        setLabelCache((prev) => ({ ...prev, [id]: {
      label: found.label,
      icon: found.raw?.[styleIconField],
      color: found.raw?.[styleColorField],
    }, }));
      }
      onChange(id);
    }

    setPopupOpen(false);
  };

const renderStyled = (label: string, icon?: string, color?: string) => (
  <span className="d-inline-flex align-items-center gap-2">
    {icon ? (
      // Si tu icono ya viene como "bi bi-gear", úsalo tal cual
      <i className={icon.includes(" ") ? icon : `bi ${icon}`} style={{ color: color || "inherit" }} />
    ) : null}
    <span>{label}</span>
  </span>
);

const summaryNode = useMemo(() => {
  if (!hasStyle) return summaryText;

  // multi: mejor contador salvo que haya 1 seleccionado
  if (multiple) {
    const arr = normalizedValue as string[];
    if (!arr.length) return placeholder;
    if (arr.length > 1) return `${arr.length} seleccionados`;

    const id = arr[0];
    const entry = labelCache[id];
    return renderStyled(entry?.label || id, entry?.icon, entry?.color);
  }

  const id = normalizedValue as string;
  if (!id) return placeholder;
  const entry = labelCache[id];
  return renderStyled(entry?.label || id, entry?.icon, entry?.color);
}, [hasStyle, multiple, normalizedValue, labelCache, summaryText, placeholder]);



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
