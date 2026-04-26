"use client";

import { useMemo, useState } from "react";
import styles from "./PlanEditorView.module.css";
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
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return symbols;
    return symbols.filter((symbol) =>
      [symbol.label, symbol.category, symbol.type, symbol.id].some((value) => String(value || "").toLowerCase().includes(q))
    );
  }, [query, symbols]);

  const grouped = useMemo(() => {
    const groups = new Map<string, PlanSymbolDefinition[]>();
    for (const symbol of filtered) {
      const key = symbol.category || "Símbolos";
      groups.set(key, [...(groups.get(key) || []), symbol]);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  return (
    <div className={styles.panelSection}>
      <h3 className={styles.panelTitle}>Símbolos</h3>
      {!configured ? (
        <div className={styles.hint}>Configura una fuente de símbolos en el módulo para usar este panel.</div>
      ) : (
        <>
          <input
            className={styles.input}
            value={query}
            placeholder="Buscar símbolo"
            disabled={readOnly || loading}
            onChange={(event) => setQuery(event.target.value)}
          />
          {loading ? <div className={styles.hint}>Cargando símbolos...</div> : null}
          {error ? <div className={styles.errorText}>{error}</div> : null}
          {!loading && !error && filtered.length === 0 ? <div className={styles.hint}>No hay símbolos disponibles.</div> : null}

          <div className={styles.symbolGroups}>
            {grouped.map(([group, items]) => (
              <div key={group} className={styles.symbolGroup}>
                <div className={styles.sectionTitle}>{group}</div>
                <div className={styles.symbolGrid}>
                  {items.map((symbol) => (
                    <button
                      key={symbol.id}
                      type="button"
                      className={`${styles.symbolButton} ${selectedSymbolId === symbol.id ? styles.symbolButtonActive : ""}`}
                      disabled={readOnly}
                      onClick={() => onSelect(selectedSymbolId === symbol.id ? null : symbol)}
                    >
                      <span className={styles.symbolIcon} style={{ color: symbol.color || "#111827" }}>
                        {symbol.icon || symbol.label.slice(0, 2).toUpperCase()}
                      </span>
                      <span>{symbol.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
