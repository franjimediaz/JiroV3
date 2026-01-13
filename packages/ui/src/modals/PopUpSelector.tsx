"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Item = { value: string | number; label: string };

export function PopupSelector({
  open,
  title,
  multiple,
  value,
  items,
  loading,
  onSearch,
  onClose,
  onApply,
}: {
  open: boolean;
  title?: string;
  multiple?: boolean;

  // value: si multiple -> array, si no -> scalar
  value: any;

  items: Item[];
  loading?: boolean;

  onSearch?: (q: string) => void;
  onClose: () => void;
  onApply: (nextValue: any) => void;
}) {
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  // normaliza selección actual
  const selectedSet = useMemo(() => {
    if (multiple) return new Set(Array.isArray(value) ? value : []);
    return new Set(value === "" || value === null || value === undefined ? [] : [value]);
  }, [value, multiple]);

  const [draft, setDraft] = useState<Set<any>>(new Set(selectedSet));

  // Focus + reset al abrir
  useEffect(() => {
    if (!open) return;
    setQ("");
    setDraft(new Set(selectedSet));
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [open, selectedSet]);

  // Búsqueda con debounce
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onSearch?.(q), 150);
    return () => clearTimeout(t);
  }, [q, open, onSearch]);

  // Bloquear scroll body mientras está abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (v: any) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (multiple) {
        next.has(v) ? next.delete(v) : next.add(v);
      } else {
        next.clear();
        next.add(v);
      }
      return next;
    });
  };

  const clear = () => setDraft(new Set());

  const apply = () => {
    if (multiple) onApply(Array.from(draft));
    else onApply(draft.size ? Array.from(draft)[0] : "");
    onClose();
  };

  const closeOnBackdrop = (e: React.MouseEvent) => {
    // Solo si clicas el backdrop, no dentro del modal
    if (e.target === e.currentTarget) onClose();
  };

  const ui = (
    <div onMouseDown={closeOnBackdrop} className="selModal">
      <div
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="selModal__dialog"
      >
        {/* Header */}
        <div className="selModal__header">
          <div className="selModal__titleRow">
            <div className="selModal__title">{title || "Seleccionar"}</div>
          </div>

          <div className="selModal__searchRow">
            <input
              ref={searchRef}
              className="form-control selModal__search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
            />
            <button
              className="btn btn-outline-light selBtnClear"
              type="button"
              onClick={clear}
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="selModal__body">
          {items.length === 0 && !loading && (
            <div className="selModal__empty">No hay resultados.</div>
          )}

          <div className="selModal__list">
            {items.map((it) => {
              const checked = draft.has(it.value);
              return (
                <button
                  key={String(it.value)}
                  type="button"
                  className={`btn btn-outline-light selItem ${checked ? "selItem--checked" : ""}`}
                  onClick={() => toggle(it.value)}
                >
                  <span className="selItem__main">{it.label}</span>
                  <span className="selItem__mark">
                    {multiple ? (checked ? "☑" : "☐") : checked ? "◉" : "○"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="selModal__footer">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" type="button" onClick={apply}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );

  // Portal para que quede fijo y no afectado por layouts/overflow
  return createPortal(ui, document.body);
}
