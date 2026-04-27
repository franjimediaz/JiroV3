"use client";

import styles from "./PlanEditorView.module.css";
import type { PlanTool } from "./planTypes";

type Props = {
  tool: PlanTool;
  readOnly?: boolean;
  hasSelection: boolean;
  hasActiveSymbol?: boolean;
  hasActiveBlock?: boolean;
  hasClipboard?: boolean;
  selectionCount?: number;
  gridEnabled: boolean;
  snapEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  calibrationActive?: boolean;
  measurementEnabled?: boolean;
  onToolChange: (tool: PlanTool) => void;
  onDeleteSelected: () => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onAlign: (mode: "left" | "right" | "top" | "bottom" | "centerH" | "centerV") => void;
  onDistribute: (direction: "horizontal" | "vertical") => void;
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
  hasActiveBlock,
  hasClipboard,
  selectionCount = 0,
  gridEnabled,
  snapEnabled,
  canUndo,
  canRedo,
  calibrationActive,
  measurementEnabled = true,
  onToolChange,
  onDeleteSelected,
  onClear,
  onUndo,
  onRedo,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
  onGroup,
  onUngroup,
  onAlign,
  onDistribute,
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
          disabled={(readOnly && item.id !== "select" && item.id !== "pan") || (item.id === "measure" && !measurementEnabled)}
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

      <button
        type="button"
        className={`${styles.button} ${tool === "block" ? styles.buttonActive : ""}`}
        onClick={() => onToolChange("block")}
        disabled={readOnly || !hasActiveBlock}
        title={hasActiveBlock ? "Insertar bloque seleccionado" : "Selecciona un bloque"}
      >
        Bloque
      </button>

      <button type="button" className={styles.button} onClick={onUndo} disabled={readOnly || !canUndo}>
        Deshacer
      </button>

      <button type="button" className={styles.button} onClick={onRedo} disabled={readOnly || !canRedo}>
        Rehacer
      </button>

      <button type="button" className={styles.button} onClick={onCopy} disabled={readOnly || !hasSelection}>
        Copiar
      </button>

      <button type="button" className={styles.button} onClick={onCut} disabled={readOnly || !hasSelection}>
        Cortar
      </button>

      <button type="button" className={styles.button} onClick={onPaste} disabled={readOnly || !hasClipboard}>
        Pegar
      </button>

      <button type="button" className={styles.button} onClick={onDuplicate} disabled={readOnly || !hasSelection}>
        Duplicar
      </button>

      <button type="button" className={styles.button} onClick={onGroup} disabled={readOnly || selectionCount < 2}>
        Agrupar
      </button>

      <button type="button" className={styles.button} onClick={onUngroup} disabled={readOnly || !hasSelection}>
        Desagrupar
      </button>

      <select className={styles.input} style={{ width: 130 }} disabled={readOnly || selectionCount < 2} defaultValue="" onChange={(event) => { if (event.target.value) onAlign(event.target.value as "left" | "right" | "top" | "bottom" | "centerH" | "centerV"); event.target.value = ""; }}>
        <option value="">Alinear</option>
        <option value="left">Izquierda</option>
        <option value="right">Derecha</option>
        <option value="top">Arriba</option>
        <option value="bottom">Abajo</option>
        <option value="centerH">Centro H</option>
        <option value="centerV">Centro V</option>
      </select>

      <select className={styles.input} style={{ width: 130 }} disabled={readOnly || selectionCount < 3} defaultValue="" onChange={(event) => { if (event.target.value) onDistribute(event.target.value as "horizontal" | "vertical"); event.target.value = ""; }}>
        <option value="">Distribuir</option>
        <option value="horizontal">Horizontal</option>
        <option value="vertical">Vertical</option>
      </select>

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
