"use client";

import styles from "./PlanEditorView.module.css";
import type { PlanBackgroundConfig, PlanDocument, PlanScaleConfig, PlanUnit } from "./planTypes";

type Props = {
  document: PlanDocument;
  readOnly?: boolean;
  onChange: (document: PlanDocument) => void;
};

export default function PlanSettingsPanel({ document, readOnly, onChange }: Props) {
  const scale = document.canvas.scale;
  const background = document.background || { url: "", locked: true, opacity: 1 };

  const updateScale = (patch: Partial<PlanScaleConfig>) => {
    const nextScale: PlanScaleConfig = {
      pixels: scale?.pixels || 100,
      realValue: scale?.realValue || 1,
      unit: scale?.unit || document.canvas.unit,
      ...patch,
    };
    onChange({ ...document, canvas: { ...document.canvas, scale: nextScale } });
  };

  const updateBackground = (patch: Partial<PlanBackgroundConfig>) => {
    onChange({ ...document, background: { ...background, ...patch } });
  };

  return (
    <div className={styles.settings}>
      <div className={styles.settingsBlock}>
        <div className={styles.settingsHeader}>
          <h3 className={styles.panelTitle}>Escala</h3>
          <button
            type="button"
            className={styles.linkButton}
            disabled={readOnly}
            onClick={() =>
              onChange({
                ...document,
                canvas: {
                  ...document.canvas,
                  scale: scale ? null : { pixels: 100, realValue: 1, unit: document.canvas.unit },
                },
              })
            }
          >
            {scale ? "Quitar escala" : "Activar escala"}
          </button>
        </div>

        {scale ? (
          <div className={styles.settingsGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Pixels</span>
              <input
                className={styles.input}
                type="number"
                min={1}
                value={scale.pixels}
                disabled={readOnly}
                onChange={(event) => updateScale({ pixels: Number(event.target.value || 1) })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Valor real</span>
              <input
                className={styles.input}
                type="number"
                min={0.01}
                step={0.01}
                value={scale.realValue}
                disabled={readOnly}
                onChange={(event) => updateScale({ realValue: Number(event.target.value || 1) })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Unidad</span>
              <select
                className={styles.input}
                value={scale.unit}
                disabled={readOnly}
                onChange={(event) => updateScale({ unit: event.target.value as PlanUnit })}
              >
                <option value="m">m</option>
                <option value="cm">cm</option>
                <option value="mm">mm</option>
                <option value="px">px</option>
              </select>
            </label>
          </div>
        ) : (
          <div className={styles.hint}>Sin escala. Las medidas automáticas se mostrarán como “sin escala”.</div>
        )}
      </div>

      <div className={styles.settingsBlock}>
        <h3 className={styles.panelTitle}>Fondo</h3>
        <label className={styles.field}>
          <span className={styles.label}>URL imagen</span>
          <input
            className={styles.input}
            value={background.url}
            disabled={readOnly}
            placeholder="https://..."
            onChange={(event) => updateBackground({ url: event.target.value })}
          />
        </label>
        <div className={styles.settingsGrid}>
          <label className={styles.field}>
            <span className={styles.label}>Opacidad</span>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={background.opacity}
              disabled={readOnly}
              onChange={(event) => updateBackground({ opacity: Number(event.target.value || 1) })}
            />
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={background.locked}
              disabled={readOnly}
              onChange={(event) => updateBackground({ locked: event.target.checked })}
            />
            <span>Bloquear fondo</span>
          </label>
        </div>
      </div>
    </div>
  );
}
