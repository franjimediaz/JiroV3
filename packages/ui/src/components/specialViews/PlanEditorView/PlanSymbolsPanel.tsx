"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./PlanEditorView.module.css";
import { getPlanIconInfo, getSymbolInitials } from "./planIconUtils";
import type { PlanSymbolDefinition } from "./planTypes";

type Props = {
  symbols: PlanSymbolDefinition[];
  loading?: boolean;
  error?: string | null;
  configured?: boolean;
  selectedSymbolId?: string;
  readOnly?: boolean;
  onSelect: (symbol: PlanSymbolDefinition | null) => void;
};

export default function PlanSymbolsPanel({ symbols, loading, error, configured, selectedSymbolId, readOnly, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedSymbol = useMemo(() => symbols.find((symbol) => symbol.id === selectedSymbolId) || null, [selectedSymbolId, symbols]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return symbols;
    return symbols.filter((symbol) =>
      [symbol.label, symbol.category, symbol.type, symbol.id, symbol.icon].some((value) =>
        String(value || "").toLowerCase().includes(q)
      )
    );
  }, [query, symbols]);

  const grouped = useMemo(() => {
    const groups = new Map<string, PlanSymbolDefinition[]>();
    for (const symbol of filtered) {
      const key = symbol.category || "Simbolos";
      groups.set(key, [...(groups.get(key) || []), symbol]);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className={styles.panelSection}>
      <h3 className={styles.panelTitle}>Simbolos</h3>
      {!configured ? (
        <div className={styles.hint}>Configura una fuente de simbolos en el modulo para usar este panel.</div>
      ) : (
        <>
          {loading ? <div className={styles.hint}>Cargando simbolos...</div> : null}
          {error ? <div className={styles.errorText}>{error}</div> : null}

          {selectedSymbol ? (
            <div className={styles.selectedSymbolSummary}>
              <SymbolIcon symbol={selectedSymbol} />
              <div>
                <div className={styles.selectedSymbolName}>{selectedSymbol.label}</div>
                {selectedSymbol.category ? <div className={styles.hint}>{selectedSymbol.category}</div> : null}
              </div>
              <button type="button" className={styles.linkButton} disabled={readOnly} onClick={() => onSelect(null)}>
                Quitar
              </button>
            </div>
          ) : (
            <div className={styles.hint}>No hay simbolo activo.</div>
          )}

          <button type="button" className={styles.button} disabled={readOnly || loading || !!error} onClick={() => setOpen(true)}>
            Elegir simbolo
          </button>

          {open ? (
            <div className={styles.symbolModalBackdrop} onMouseDown={() => setOpen(false)}>
              <div className={styles.symbolModal} role="dialog" aria-modal="true" aria-label="Biblioteca de simbolos" onMouseDown={(event) => event.stopPropagation()}>
                <div className={styles.symbolModalHeader}>
                  <div>
                    <h3 className={styles.panelTitle}>Biblioteca de simbolos</h3>
                    <div className={styles.hint}>{symbols.length} simbolos desde configuracion</div>
                  </div>
                  <button type="button" className={styles.iconButton} onClick={() => setOpen(false)}>
                    Cerrar
                  </button>
                </div>

                <input
                  className={styles.input}
                  value={query}
                  autoFocus
                  placeholder="Buscar por nombre, categoria, tipo o icono"
                  disabled={loading}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {!loading && !error && filtered.length === 0 ? <div className={styles.hint}>No hay simbolos disponibles.</div> : null}

                <div className={styles.symbolModalBody}>
                  {grouped.map(([group, items]) => (
                    <div key={group} className={styles.symbolGroup}>
                      <div className={styles.sectionTitle}>{group}</div>
                      <div className={styles.symbolGrid}>
                        {items.map((symbol) => (
                          <button
                            key={symbol.id}
                            type="button"
                            className={`${styles.symbolButton} ${selectedSymbolId === symbol.id ? styles.symbolButtonActive : ""}`}
                            onClick={() => {
                              onSelect(selectedSymbolId === symbol.id ? null : symbol);
                              setOpen(false);
                            }}
                            title={symbol.icon || symbol.label}
                          >
                            <SymbolIcon symbol={symbol} />
                            <span>{symbol.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function SymbolIcon({ symbol }: { symbol: PlanSymbolDefinition }) {
  const icon = getPlanIconInfo(symbol.icon);
  const color = symbol.color || "#111827";

  if (icon.kind === "bootstrap") {
    return <i className={`${styles.symbolIcon} ${icon.className || ""}`} style={{ color }} aria-hidden="true" title={symbol.icon} />;
  }

  if (icon.kind === "image") {
    return <img className={styles.symbolImageIcon} src={icon.value} alt="" title={symbol.icon} />;
  }

  return (
    <span className={styles.symbolIcon} style={{ color }} title={icon.kind === "empty" ? undefined : symbol.icon}>
      {icon.kind === "empty" ? getSymbolInitials(symbol.label || symbol.id) : icon.value}
    </span>
  );
}
