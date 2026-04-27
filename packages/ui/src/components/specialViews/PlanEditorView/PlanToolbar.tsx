"use client";

import styles from "./PlanEditorView.module.css";
import type { PlanTool } from "./planTypes";

type Props = {
  tool: PlanTool;
  readOnly?: boolean;
  hasSelection: boolean;
  hasActiveSymbol?: boolean;
  gridEnabled: boolean;
  snapEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  calibrationActive?: boolean;
  onToolChange: (tool: PlanTool) => void;
  onDeleteSelected: () => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onToggleCalibration: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
};

const TOOLS: Array<{ id: PlanTool; label: string }> = [
  { id: "select", label: "Seleccionar" },
  { id: "line", label: "Linea" },
  { id: "rect", label: "Rectangulo" },
  { id: "text", label: "Texto" },
  { id: "polygon", label: "Zona" },
  { id: "measure", label: "Medir" },
  { id: "pan", label: "Mano" },
];

export default function PlanToolbar({
  tool,
  readOnly,
  hasSelection,
  hasActiveSymbol,
  gridEnabled,
  snapEnabled,
  canUndo,
  canRedo,
  calibrationActive,
  onToolChange,
  onDeleteSelected,
  onClear,
  onUndo,
  onRedo,
  onToggleGrid,
  onToggleSnap,
  onToggleCalibration,
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
        title={hasActiveSymbol ? "Insertar simbolo seleccionado" : "Selecciona un simbolo del catalogo"}
      >
        Simbolo
      </button>

      <button type="button" className={styles.button} onClick={onUndo} disabled={readOnly || !canUndo}>
        Deshacer
      </button>

      <button type="button" className={styles.button} onClick={onRedo} disabled={readOnly || !canRedo}>
        Rehacer
      </button>

      <button type="button" className={`${styles.button} ${styles.buttonDanger}`} onClick={onDeleteSelected} disabled={readOnly || !hasSelection}>
        Eliminar
      </button>

      <button type="button" className={styles.button} onClick={onClear} disabled={readOnly}>
        Limpiar
      </button>

      <button type="button" className={`${styles.button} ${gridEnabled ? styles.buttonActive : ""}`} onClick={onToggleGrid} disabled={readOnly}>
        Grid
      </button>

      <button type="button" className={`${styles.button} ${snapEnabled ? styles.buttonActive : ""}`} onClick={onToggleSnap} disabled={readOnly || !gridEnabled}>
        Snap
      </button>

      <button type="button" className={`${styles.button} ${calibrationActive ? styles.buttonActive : ""}`} onClick={onToggleCalibration} disabled={readOnly}>
        Calibrar escala
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
