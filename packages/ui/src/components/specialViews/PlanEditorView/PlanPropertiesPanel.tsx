"use client";

import { useEffect, useState } from "react";
import styles from "./PlanEditorView.module.css";
import type { LinkTargetRecord } from "./planDataSources";
import type { PlanLayer, PlanLinkTargetConfig, PlanObject } from "./planTypes";

type Props = {
  object: PlanObject | null;
  layers: PlanLayer[];
  linkTargets?: PlanLinkTargetConfig[];
  linkRecords?: LinkTargetRecord[];
  loadingLinkRecords?: boolean;
  readOnly?: boolean;
  onChange: (patch: Partial<PlanObject>) => void;
  onLoadLinkRecords?: (target: PlanLinkTargetConfig, searchText?: string) => void;
};

export default function PlanPropertiesPanel({
  object,
  layers,
  linkTargets = [],
  linkRecords = [],
  loadingLinkRecords,
  readOnly,
  onChange,
  onLoadLinkRecords,
}: Props) {
  const [linkTargetIndex, setLinkTargetIndex] = useState(0);
  const [linkSearch, setLinkSearch] = useState("");
  const selectedTarget = linkTargets[linkTargetIndex] || null;

  useEffect(() => {
    if (!object || !selectedTarget) return;
    onLoadLinkRecords?.(selectedTarget, linkSearch);
  }, [object?.id, selectedTarget?.moduleSlug, linkSearch]);

  if (!object) {
    return (
      <aside className={styles.panel}>
        <h3 className={styles.panelTitle}>Propiedades</h3>
        <div className={styles.hint}>Selecciona un elemento del plano para editar sus propiedades.</div>
      </aside>
    );
  }

  const color = object.type === "text" ? object.fill : object.type === "symbol" ? object.symbolColor || "#111827" : object.stroke;

  return (
    <aside className={styles.panel}>
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
