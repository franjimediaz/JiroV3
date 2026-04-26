"use client";

import styles from "./PlanEditorView.module.css";
import type { PlanTool } from "./planTypes";

type Props = {
  tool: PlanTool;
  readOnly?: boolean;
  hasSelection: boolean;
  hasActiveSymbol?: boolean;
  onToolChange: (tool: PlanTool) => void;
  onDeleteSelected: () => void;
  onClear: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
};

const TOOLS: Array<{ id: PlanTool; label: string }> = [
  { id: "select", label: "Seleccionar" },
  { id: "line", label: "Línea" },
  { id: "rect", label: "Rectángulo" },
  { id: "text", label: "Texto" },
];

export default function PlanToolbar({
  tool,
  readOnly,
  hasSelection,
  hasActiveSymbol,
  onToolChange,
  onDeleteSelected,
  onClear,
  onExportPng,
  onExportPdf,
}: Props) {
  return (
    <div className={styles.toolbar}>
      {TOOLS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`${styles.button} ${tool === item.id ? styles.buttonActive : ""}`}
          onClick={() => onToolChange(item.id)}
          disabled={readOnly && item.id !== "select"}
        >
          {item.label}
        </button>
      ))}

      <button
        type="button"
        className={`${styles.button} ${tool === "symbol" ? styles.buttonActive : ""}`}
        onClick={() => onToolChange("symbol")}
        disabled={readOnly || !hasActiveSymbol}
        title={hasActiveSymbol ? "Insertar símbolo seleccionado" : "Selecciona un símbolo del catálogo"}
      >
        Símbolo
      </button>

      <button
        type="button"
        className={`${styles.button} ${styles.buttonDanger}`}
        onClick={onDeleteSelected}
        disabled={readOnly || !hasSelection}
      >
        Eliminar seleccionado
      </button>

      <button type="button" className={styles.button} onClick={onClear} disabled={readOnly}>
        Limpiar plano
      </button>

      <button type="button" className={styles.button} onClick={onExportPng}>
        PNG
      </button>

      <button type="button" className={styles.button} onClick={onExportPdf}>
        PDF
      </button>
    </div>
  );
}
