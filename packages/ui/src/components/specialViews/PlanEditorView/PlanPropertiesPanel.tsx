"use client";

import { useEffect, useState } from "react";
import styles from "./PlanEditorView.module.css";
import type { LinkTargetRecord } from "./planDataSources";
import type { PlanDocument, PlanEditorOptions, PlanLayer, PlanLinkTargetConfig, PlanObject, PlanUnit } from "./planTypes";
import { calculateLineMeasure, formatArea, formatRealLength, getObjectAreaLabel, getRectRealSize, parsePlanDecimal, realToPixels, updateRectFromRealSize, validatePolygon } from "./planUtils";

type Props = {
  object: PlanObject | null;
  layers: PlanLayer[];
  scale: PlanDocument["canvas"]["scale"];
  linkTargets?: PlanLinkTargetConfig[];
  linkRecords?: LinkTargetRecord[];
  loadingLinkRecords?: boolean;
  readOnly?: boolean;
  editingVertices?: boolean;
  selectedVertexIndex?: number | null;
  calibrationActive?: boolean;
  calibration?: PlanEditorOptions["calibration"];
  polygonValidationOptions?: PlanEditorOptions["polygonValidation"];
  onChange: (patch: Partial<PlanObject>) => void;
  onLoadLinkRecords?: (target: PlanLinkTargetConfig, searchText?: string) => void;
  onToggleVertexEditing?: () => void;
  onSelectVertex?: (index: number | null) => void;
  onAddVertex?: () => void;
  onDeleteVertex?: () => void;
  onUseLineForCalibration?: (lineId: string, realLength: number, unit: PlanUnit) => void;
};

export default function PlanPropertiesPanel({
  object,
  layers,
  scale,
  linkTargets = [],
  linkRecords = [],
  loadingLinkRecords,
  readOnly,
  editingVertices,
  selectedVertexIndex,
  calibrationActive,
  calibration,
  polygonValidationOptions,
  onChange,
  onLoadLinkRecords,
  onToggleVertexEditing,
  onSelectVertex,
  onAddVertex,
  onDeleteVertex,
  onUseLineForCalibration,
}: Props) {
  const [linkTargetIndex, setLinkTargetIndex] = useState(0);
  const [linkSearch, setLinkSearch] = useState("");
  const [calibrationLength, setCalibrationLength] = useState("");
  const [calibrationUnit, setCalibrationUnit] = useState<PlanUnit>(calibration?.defaultUnit || "m");
  const [realWidthText, setRealWidthText] = useState("");
  const [realHeightText, setRealHeightText] = useState("");
  const [keepRectRatio, setKeepRectRatio] = useState(false);
  const selectedTarget = linkTargets[linkTargetIndex] || null;
  const allowedCalibrationUnits = calibration?.allowedUnits?.length ? calibration.allowedUnits : ["mm", "cm", "m", "km", "in", "ft"];

  useEffect(() => {
    if (!object || !selectedTarget) return;
    onLoadLinkRecords?.(selectedTarget, linkSearch);
  }, [object?.id, selectedTarget?.moduleSlug, linkSearch]);

  useEffect(() => {
    if (!object || object.type !== "rect") return;
    const size = getRectRealSize(object, scale);
    setRealWidthText(size ? String(Math.round(size.width * 1000) / 1000).replace(".", ",") : "");
    setRealHeightText(size ? String(Math.round(size.height * 1000) / 1000).replace(".", ",") : "");
  }, [object?.id, object?.type === "rect" ? object.width : undefined, object?.type === "rect" ? object.height : undefined, scale]);

  if (!object) {
    return (
      <aside className={styles.panel} data-plan-editor-ignore-hotkeys="true">
        <h3 className={styles.panelTitle}>Propiedades</h3>
        <div className={styles.hint}>Selecciona un elemento del plano para editar sus propiedades.</div>
      </aside>
    );
  }

  const color = object.type === "text" ? object.fill : object.type === "symbol" ? object.symbolColor || "#111827" : object.stroke;
  const polygonValidation = object.type === "polygon" && polygonValidationOptions?.enabled !== false
    ? validatePolygon(object.points, polygonValidationOptions?.epsilon || 0.5)
    : null;
  const rectRealSize = object.type === "rect" ? getRectRealSize(object, scale) : null;
  const applyRectRealSize = () => {
    if (object.type !== "rect" || readOnly) return;
    const currentReal = getRectRealSize(object, scale);
    const nextWidth = parsePlanDecimal(realWidthText);
    const nextHeight = parsePlanDecimal(realHeightText);
    if (!currentReal || nextWidth === null || nextHeight === null || nextWidth <= 0 || nextHeight <= 0) return;
    onChange(updateRectFromRealSize(object, nextWidth, nextHeight, scale) as Partial<PlanObject>);
  };
  const updateRealWidth = (value: string) => {
    setRealWidthText(value);
    if (!keepRectRatio || object.type !== "rect") return;
    const parsed = parsePlanDecimal(value);
    const current = getRectRealSize(object, scale);
    if (parsed && current && current.width > 0) setRealHeightText(String(Math.round(parsed * (current.height / current.width) * 1000) / 1000).replace(".", ","));
  };
  const updateRealHeight = (value: string) => {
    setRealHeightText(value);
    if (!keepRectRatio || object.type !== "rect") return;
    const parsed = parsePlanDecimal(value);
    const current = getRectRealSize(object, scale);
    if (parsed && current && current.height > 0) setRealWidthText(String(Math.round(parsed * (current.width / current.height) * 1000) / 1000).replace(".", ","));
  };

  return (
    <aside className={styles.panel} data-plan-editor-ignore-hotkeys="true">
      <h3 className={styles.panelTitle}>Propiedades</h3>

      <div className={styles.meta}>
        <span>{object.type}</span>
        <span>{object.id}</span>
        {object.locked ? <span>bloqueado</span> : null}
      </div>

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={!!object.locked}
          disabled={readOnly}
          onChange={(event) => onChange({ locked: event.target.checked } as Partial<PlanObject>)}
        />
        <span>Bloquear objeto</span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Capa</span>
        <select
          className={styles.input}
          value={object.layerId || layers[0]?.id || ""}
          disabled={readOnly}
          onChange={(event) => onChange({ layerId: event.target.value } as Partial<PlanObject>)}
        >
          {layers.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.name}{layer.locked ? " (bloqueada)" : ""}
            </option>
          ))}
        </select>
      </label>

      {object.type === "text" ? (
        <label className={styles.field}>
          <span className={styles.label}>Texto</span>
          <input className={styles.input} value={object.text} disabled={readOnly} onChange={(event) => onChange({ text: event.target.value } as Partial<PlanObject>)} />
        </label>
      ) : object.type === "symbol" ? (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Simbolo</span>
            <input className={styles.input} value={object.symbolLabel} disabled={readOnly} onChange={(event) => onChange({ symbolLabel: event.target.value } as Partial<PlanObject>)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Icono / marca</span>
            <input className={styles.input} value={object.symbolIcon || ""} disabled={readOnly} onChange={(event) => onChange({ symbolIcon: event.target.value || undefined } as Partial<PlanObject>)} />
          </label>
        </>
      ) : (
        <label className={styles.field}>
          <span className={styles.label}>Label</span>
          <input className={styles.input} value={object.label} disabled={readOnly} onChange={(event) => onChange({ label: event.target.value } as Partial<PlanObject>)} />
        </label>
      )}

      <label className={styles.field}>
        <span className={styles.label}>Color</span>
        <input
          className={styles.input}
          type="color"
          value={normalizeColorInput(color)}
          disabled={readOnly}
          onChange={(event) =>
            onChange(
              object.type === "text"
                ? ({ fill: event.target.value } as Partial<PlanObject>)
                : object.type === "symbol"
                  ? ({ symbolColor: event.target.value } as Partial<PlanObject>)
                  : ({ stroke: event.target.value } as Partial<PlanObject>)
            )
          }
        />
      </label>

      {object.type === "symbol" ? (
        <label className={styles.field}>
          <span className={styles.label}>Tamano</span>
          <input
            className={styles.input}
            type="number"
            min={12}
            max={120}
            value={object.size}
            disabled={readOnly}
            onChange={(event) => onChange({ size: Number(event.target.value || 32) } as Partial<PlanObject>)}
          />
        </label>
      ) : object.type !== "text" ? (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Grosor</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              max={30}
              value={object.strokeWidth}
              disabled={readOnly}
              onChange={(event) => onChange({ strokeWidth: Number(event.target.value || 1) } as Partial<PlanObject>)}
            />
          </label>

          {object.type === "line" ? (
            <>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={object.showMeasure}
                  disabled={readOnly}
                  onChange={(event) => onChange({ showMeasure: event.target.checked } as Partial<PlanObject>)}
                />
                <span>Mostrar medida</span>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Medida manual</span>
                <input
                  className={styles.input}
                  value={object.manualMeasureLabel || ""}
                  placeholder="Ej: 3,40 m"
                  disabled={readOnly}
                  onChange={(event) => onChange({ manualMeasureLabel: event.target.value || undefined } as Partial<PlanObject>)}
                />
              </label>
              {calibrationActive ? (
                <div className={styles.panelSection}>
                  <h4 className={styles.sectionTitle}>Calibrar escala</h4>
                  <div className={styles.hint}>Medida actual: {calculateLineMeasure(object, scale)}</div>
                  <label className={styles.field}>
                    <span className={styles.label}>Medida real</span>
                    <input className={styles.input} type="number" min={0.0001} step={0.01} value={calibrationLength} disabled={readOnly} onChange={(event) => setCalibrationLength(event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Unidad</span>
                    <select className={styles.input} value={calibrationUnit} disabled={readOnly} onChange={(event) => setCalibrationUnit(event.target.value as PlanUnit)}>
                      {allowedCalibrationUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={readOnly || !Number(calibrationLength)}
                    onClick={() => onUseLineForCalibration?.(object.id, Number(calibrationLength), calibrationUnit)}
                  >
                    Usar para calibrar escala
                  </button>
                </div>
              ) : null}
            </>
          ) : object.type === "rect" || object.type === "polygon" ? (
            <>
              {object.type === "rect" ? (
                <>
                  <div className={styles.settingsGrid}>
                    <label className={styles.field}>
                      <span className={styles.label}>Ancho px</span>
                      <input className={styles.input} type="number" min={1} value={object.width} disabled={readOnly} onChange={(event) => onChange({ width: Number(event.target.value || 1) } as Partial<PlanObject>)} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Alto px</span>
                      <input className={styles.input} type="number" min={1} value={object.height} disabled={readOnly} onChange={(event) => onChange({ height: Number(event.target.value || 1) } as Partial<PlanObject>)} />
                    </label>
                    <label className={styles.checkboxRow}>
                      <input type="checkbox" checked={keepRectRatio} disabled={readOnly || !rectRealSize} onChange={(event) => setKeepRectRatio(event.target.checked)} />
                      <span>Mantener proporcion</span>
                    </label>
                  </div>
                  <div className={styles.panelSection}>
                    <h4 className={styles.sectionTitle}>Medidas reales</h4>
                    {!rectRealSize ? <div className={styles.hint}>Configura la escala del plano para editar medidas reales.</div> : null}
                    <div className={styles.settingsGrid}>
                      <label className={styles.field}>
                        <span className={styles.label}>Ancho real</span>
                        <input className={styles.input} value={realWidthText} disabled={readOnly || !rectRealSize} onChange={(event) => updateRealWidth(event.target.value)} onBlur={applyRectRealSize} />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.label}>Alto real</span>
                        <input className={styles.input} value={realHeightText} disabled={readOnly || !rectRealSize} onChange={(event) => updateRealHeight(event.target.value)} onBlur={applyRectRealSize} />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.label}>Unidad</span>
                        <input className={styles.input} value={scale?.unit || ""} disabled />
                      </label>
                    </div>
                    <div className={styles.hint}>
                      {rectRealSize ? `Ancho: ${formatRealLength(rectRealSize.width, rectRealSize.unit)} · Alto: ${formatRealLength(rectRealSize.height, rectRealSize.unit)} · Area: ${formatArea(rectRealSize.area, rectRealSize.unit)}` : `Tamano tecnico: ${Math.round(object.width)} x ${Math.round(object.height)} px`}
                    </div>
                    <button type="button" className={styles.button} disabled={readOnly || !rectRealSize || !realToPixels(parsePlanDecimal(realWidthText) || 0, scale) || !realToPixels(parsePlanDecimal(realHeightText) || 0, scale)} onClick={applyRectRealSize}>
                      Aplicar medidas
                    </button>
                  </div>
                </>
              ) : null}

              <label className={styles.field}>
                <span className={styles.label}>Relleno</span>
                <input className={styles.input} value={object.fill} disabled={readOnly} onChange={(event) => onChange({ fill: event.target.value } as Partial<PlanObject>)} />
              </label>

              <label className={styles.checkboxRow}>
                <input type="checkbox" checked={object.showArea} disabled={readOnly} onChange={(event) => onChange({ showArea: event.target.checked } as Partial<PlanObject>)} />
                <span>Mostrar superficie</span>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Superficie manual</span>
                <input
                  className={styles.input}
                  value={object.manualAreaLabel || ""}
                  placeholder={getObjectAreaLabel(object, scale, true)}
                  disabled={readOnly}
                  onChange={(event) => onChange({ manualAreaLabel: event.target.value || undefined } as Partial<PlanObject>)}
                />
              </label>

              <div className={styles.hint}>Superficie: {getObjectAreaLabel(object, scale, true) || "Oculta"}</div>
              {object.type === "polygon" ? (
                <div className={styles.panelSection}>
                  {polygonValidation && (polygonValidation.errors.length || polygonValidation.warnings.length) ? (
                    <div className={polygonValidation.errors.length ? styles.errorText : styles.hint}>
                      {[...polygonValidation.errors, ...polygonValidation.warnings].join(" ")}
                    </div>
                  ) : null}
                  <div className={styles.settingsHeader}>
                    <h4 className={styles.sectionTitle}>Vertices</h4>
                    <button type="button" className={styles.linkButton} disabled={readOnly} onClick={onToggleVertexEditing}>
                      {editingVertices ? "Finalizar edicion" : "Editar vertices"}
                    </button>
                  </div>
                  <div className={styles.actionsRow}>
                    <button type="button" className={styles.button} disabled={readOnly || !editingVertices} onClick={onAddVertex}>
                      Anadir vertice
                    </button>
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonDanger}`}
                      disabled={readOnly || !editingVertices || selectedVertexIndex === null || object.points.length <= 3}
                      onClick={onDeleteVertex}
                    >
                      Eliminar vertice
                    </button>
                  </div>
                  <div className={styles.vertexList}>
                    {object.points.map((point, index) => (
                      <button
                        key={index}
                        type="button"
                        className={`${styles.vertexRow} ${selectedVertexIndex === index ? styles.vertexRowActive : ""}`}
                        disabled={readOnly || !editingVertices}
                        onClick={() => onSelectVertex?.(index)}
                      >
                        <span>#{index + 1}</span>
                        <span>x {Math.round(point.x)}</span>
                        <span>y {Math.round(point.y)}</span>
                      </button>
                    ))}
                  </div>
                  {object.points.length <= 3 ? <div className={styles.hint}>Un poligono necesita al menos 3 vertices.</div> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <label className={styles.field}>
          <span className={styles.label}>Tamano</span>
          <input
            className={styles.input}
            type="number"
            min={8}
            max={96}
            value={object.fontSize}
            disabled={readOnly}
            onChange={(event) => onChange({ fontSize: Number(event.target.value || 16) } as Partial<PlanObject>)}
          />
        </label>
      )}

      <div className={styles.panelSection}>
        <h4 className={styles.sectionTitle}>Vinculacion JiRo</h4>
        {linkTargets.length === 0 ? (
          <div className={styles.hint}>No hay destinos de vinculacion configurados.</div>
        ) : (
          <>
            <label className={styles.field}>
              <span className={styles.label}>Destino</span>
              <select
                className={styles.input}
                value={linkTargetIndex}
                disabled={readOnly}
                onChange={(event) => {
                  const nextIndex = Number(event.target.value || 0);
                  setLinkTargetIndex(nextIndex);
                  const target = linkTargets[nextIndex];
                  if (target) onLoadLinkRecords?.(target);
                }}
              >
                {linkTargets.map((target, index) => (
                  <option key={`${target.moduleSlug}:${target.table || ""}:${target.label}`} value={index}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Registro</span>
              <input
                className={styles.input}
                value={linkSearch}
                placeholder="Buscar registro"
                disabled={readOnly || loadingLinkRecords || !selectedTarget}
                onChange={(event) => setLinkSearch(event.target.value)}
              />
              <select
                className={styles.input}
                value={object.linkedTo?.recordId || ""}
                disabled={readOnly || loadingLinkRecords || !selectedTarget}
                onChange={(event) => {
                  const record = linkRecords.find((item) => item.recordId === event.target.value);
                  onChange({
                    linkedTo: selectedTarget
                      ? {
                          label: selectedTarget.label,
                          moduleSlug: selectedTarget.moduleSlug,
                          table: selectedTarget.table || selectedTarget.moduleSlug,
                          recordId: record?.recordId || "",
                          displayValue: record?.displayValue || "",
                        }
                      : undefined,
                  } as Partial<PlanObject>);
                }}
              >
                <option value="">{loadingLinkRecords ? "Cargando..." : "Sin vincular"}</option>
                {linkRecords.map((record) => (
                  <option key={record.recordId} value={record.recordId}>
                    {record.displayValue || record.recordId}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    </aside>
  );
}

function normalizeColorInput(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#111827";
}
