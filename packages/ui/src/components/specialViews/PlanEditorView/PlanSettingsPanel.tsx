"use client";

import styles from "./PlanEditorView.module.css";
import { getAcceptValue, uploadSingleFile } from "../../fields/fileUploadUtils";
import type { PlanBackgroundConfig, PlanBackgroundUploaderConfig, PlanDocument, PlanEditorOptions, PlanScaleConfig, PlanUnit } from "./planTypes";
import { useRef, useState } from "react";

type Props = {
  document: PlanDocument;
  readOnly?: boolean;
  uploader?: PlanBackgroundUploaderConfig;
  calibration?: PlanEditorOptions["calibration"];
  uploadFolder?: string;
  onChange: (document: PlanDocument) => void;
};

export default function PlanSettingsPanel({ document, readOnly, uploader, calibration, uploadFolder, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [backgroundError, setBackgroundError] = useState("");
  const scale = document.canvas.scale;
  const grid = document.canvas.grid;
  const background = document.background;
  const uploaderEnabled = uploader?.enabled !== false;
  const uploadEndpoint = uploader?.endpoint || "/api/upload";
  const allowedUnits = calibration?.allowedUnits?.length ? calibration.allowedUnits : ["mm", "cm", "m", "km", "in", "ft"];

  const updateScale = (patch: Partial<PlanScaleConfig>) => {
    const nextScale: PlanScaleConfig = {
      pixels: scale?.pixels || 100,
      realValue: scale?.realValue || 1,
      unit: scale?.unit || document.canvas.unit,
      ...patch,
      calibratedFrom: patch.calibratedFrom === undefined ? scale?.calibratedFrom : patch.calibratedFrom,
    };
    onChange({ ...document, canvas: { ...document.canvas, scale: nextScale } });
  };

  const updateBackground = (patch: Partial<PlanBackgroundConfig>) => {
    onChange({ ...document, background: { ...background, ...patch } });
  };

  const uploadBackground = async (file: File | undefined) => {
    if (!file || readOnly || !uploaderEnabled) return;
    setUploading(true);
    setBackgroundError("");
    try {
      const uploaded = await uploadSingleFile(file, "image", uploader?.folder || uploadFolder || "plan-backgrounds", [], uploadEndpoint);
      const url = uploaded.url || "";
      if (!url) throw new Error("La subida no devolvio una URL publica.");
      updateBackground({
        url,
        source: {
          type: "upload",
          fileName: uploaded.name || file.name,
          uploadedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      setBackgroundError((error as Error)?.message || "No se pudo subir la imagen de fondo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateGrid = (patch: Partial<typeof grid>) => {
    onChange({ ...document, canvas: { ...document.canvas, grid: { ...grid, ...patch } } });
  };

  const updateView = (patch: Partial<typeof document.canvas.view>) => {
    onChange({ ...document, canvas: { ...document.canvas, view: { ...document.canvas.view, ...patch } } });
  };

  const updateSnap = (patch: Partial<typeof document.canvas.snap>) => {
    onChange({ ...document, canvas: { ...document.canvas, snap: { ...document.canvas.snap, ...patch } } });
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
                {allowedUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </label>
            {scale.calibratedFrom ? (
              <div className={styles.hint} style={{ gridColumn: "1 / -1" }}>
                Escala calibrada: {Math.round(scale.calibratedFrom.pixelLength * 100) / 100}px = {scale.calibratedFrom.realLength} {scale.calibratedFrom.unit}
                <button
                  type="button"
                  className={styles.linkButton}
                  disabled={readOnly}
                  onClick={() => onChange({ ...document, canvas: { ...document.canvas, scale: { pixels: scale.pixels, realValue: scale.realValue, unit: scale.unit } } })}
                >
                  Limpiar calibracion
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.hint}>Sin escala. Las medidas automáticas se mostrarán como “sin escala”.</div>
        )}
      </div>

      <div className={styles.settingsBlock}>
        <h3 className={styles.panelTitle}>Grid</h3>
        <div className={styles.settingsGrid}>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={grid.enabled} disabled={readOnly} onChange={(event) => updateGrid({ enabled: event.target.checked })} />
            <span>Mostrar grid</span>
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={grid.snap} disabled={readOnly || !grid.enabled} onChange={(event) => updateGrid({ snap: event.target.checked })} />
            <span>Snapping</span>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Tamano</span>
            <input
              className={styles.input}
              type="number"
              min={2}
              value={grid.size}
              disabled={readOnly}
              onChange={(event) => updateGrid({ size: Number(event.target.value || 20) })}
            />
          </label>
        </div>
      </div>

      <div className={styles.settingsBlock}>
        <h3 className={styles.panelTitle}>Vista y snap</h3>
        <div className={styles.settingsGrid}>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={document.canvas.snap.enabled} disabled={readOnly} onChange={(event) => updateSnap({ enabled: event.target.checked })} />
            <span>Snap activo</span>
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={document.canvas.snap.toGrid} disabled={readOnly || !document.canvas.snap.enabled} onChange={(event) => updateSnap({ toGrid: event.target.checked })} />
            <span>A grid</span>
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={document.canvas.snap.toObjects} disabled={readOnly || !document.canvas.snap.enabled} onChange={(event) => updateSnap({ toObjects: event.target.checked })} />
            <span>A objetos</span>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Umbral</span>
            <input className={styles.input} type="number" min={1} value={document.canvas.snap.threshold} disabled={readOnly} onChange={(event) => updateSnap({ threshold: Number(event.target.value || 8) })} />
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={document.canvas.view.showRulers} disabled={readOnly} onChange={(event) => updateView({ showRulers: event.target.checked })} />
            <span>Reglas</span>
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={document.canvas.view.showGuides} disabled={readOnly} onChange={(event) => updateView({ showGuides: event.target.checked })} />
            <span>Guias</span>
          </label>
        </div>
      </div>

      <div className={styles.settingsBlock}>
        <h3 className={styles.panelTitle}>Fondo</h3>
        {background.url ? (
          <div className={styles.backgroundPreview}>
            <img src={background.url} alt="Fondo del plano" onError={() => setBackgroundError("No se pudo cargar la imagen de fondo.")} />
          </div>
        ) : null}
        <label className={styles.field}>
          <span className={styles.label}>URL imagen</span>
          <input
            className={styles.input}
            value={background.url}
            disabled={readOnly}
            placeholder="https://..."
            onChange={(event) => updateBackground({ url: event.target.value, source: { type: "url", fileName: "", uploadedAt: "" } })}
          />
        </label>
        <div className={styles.actionsRow}>
          <button type="button" className={styles.button} disabled={readOnly || uploading || !uploaderEnabled} onClick={() => fileInputRef.current?.click()}>
            {uploading ? "Subiendo..." : "Subir imagen"}
          </button>
          <button type="button" className={styles.button} disabled={readOnly || !background.url} onClick={() => updateBackground({ url: "", source: { type: "url", fileName: "", uploadedAt: "" } })}>
            Eliminar fondo
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={getAcceptValue({}, true)}
          hidden
          disabled={readOnly || uploading || !uploaderEnabled}
          onChange={(event) => void uploadBackground(event.target.files?.[0])}
        />
        {backgroundError ? <div className={styles.errorText}>{backgroundError}</div> : null}
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
          <label className={styles.field}>
            <span className={styles.label}>Ajuste</span>
            <select className={styles.input} value={background.fit} disabled={readOnly} onChange={(event) => updateBackground({ fit: event.target.value as PlanBackgroundConfig["fit"] })}>
              <option value="contain">contain</option>
              <option value="cover">cover</option>
              <option value="stretch">stretch</option>
              <option value="original">original</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
