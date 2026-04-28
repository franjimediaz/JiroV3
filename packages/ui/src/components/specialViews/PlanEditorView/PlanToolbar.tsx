"use client";

import { useEffect, useRef, useState } from "react";
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
  onToggleCalibration,
  onExportPng,
  onExportPdf,
}: Props) {
  const [openMenu, setOpenMenu] = useState<"align" | "distribute" | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const canAlign = !readOnly && selectionCount >= 2;
  const canDistribute = !readOnly && selectionCount >= 3;

  useEffect(() => {
    if (!openMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (toolbarRef.current?.contains(event.target as Node)) return;
      setOpenMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  const runAlign = (mode: Parameters<Props["onAlign"]>[0]) => {
    onAlign(mode);
    setOpenMenu(null);
  };

  const runDistribute = (direction: Parameters<Props["onDistribute"]>[0]) => {
    onDistribute(direction);
    setOpenMenu(null);
  };

  return (
    <div className={styles.toolbar} ref={toolbarRef}>
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

      <div className={styles.toolbarMenu}>
        <button
          type="button"
          className={styles.button}
          onClick={() => setOpenMenu((current) => current === "align" ? null : "align")}
          disabled={!canAlign}
          aria-haspopup="menu"
          aria-expanded={openMenu === "align"}
        >
          Alinear
        </button>
        {openMenu === "align" ? (
          <div className={styles.toolbarMenuList} role="menu">
            <button type="button" role="menuitem" onClick={() => runAlign("left")}>Alinear izquierda</button>
            <button type="button" role="menuitem" onClick={() => runAlign("right")}>Alinear derecha</button>
            <button type="button" role="menuitem" onClick={() => runAlign("top")}>Alinear arriba</button>
            <button type="button" role="menuitem" onClick={() => runAlign("bottom")}>Alinear abajo</button>
            <button type="button" role="menuitem" onClick={() => runAlign("centerH")}>Alinear centro horizontal</button>
            <button type="button" role="menuitem" onClick={() => runAlign("centerV")}>Alinear centro vertical</button>
          </div>
        ) : null}
      </div>

      <div className={styles.toolbarMenu}>
        <button
          type="button"
          className={styles.button}
          onClick={() => setOpenMenu((current) => current === "distribute" ? null : "distribute")}
          disabled={!canDistribute}
          aria-haspopup="menu"
          aria-expanded={openMenu === "distribute"}
        >
          Distribuir
        </button>
        {openMenu === "distribute" ? (
          <div className={styles.toolbarMenuList} role="menu">
            <button type="button" role="menuitem" onClick={() => runDistribute("horizontal")}>Distribuir horizontal</button>
            <button type="button" role="menuitem" onClick={() => runDistribute("vertical")}>Distribuir vertical</button>
          </div>
        ) : null}
      </div>

      <button type="button" className={`${styles.button} ${styles.buttonDanger}`} onClick={onDeleteSelected} disabled={readOnly || !hasSelection}>
        Eliminar
      </button>

      <button type="button" className={styles.button} onClick={onClear} disabled={readOnly}>
        Limpiar
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
