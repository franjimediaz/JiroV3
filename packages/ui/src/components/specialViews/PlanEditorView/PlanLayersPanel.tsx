"use client";

import styles from "./PlanEditorView.module.css";
import type { PlanDocument, PlanLayer } from "./planTypes";
import { createPlanObjectId } from "./planUtils";

type Props = {
  document: PlanDocument;
  readOnly?: boolean;
  onChange: (document: PlanDocument) => void;
};

export default function PlanLayersPanel({ document, readOnly, onChange }: Props) {
  const layers = [...document.layers].sort((a, b) => a.order - b.order);

  const updateLayer = (layerId: string, patch: Partial<PlanLayer>) => {
    onChange({
      ...document,
      layers: document.layers.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)),
    });
  };

  const addLayer = () => {
    const nextOrder = Math.max(0, ...document.layers.map((layer) => layer.order || 0)) + 1;
    const id = `layer_${createPlanObjectId()}`;
    onChange({
      ...document,
      activeLayerId: id,
      layers: [
        ...document.layers,
        {
          id,
          name: `Capa ${nextOrder}`,
          visible: true,
          locked: false,
          order: nextOrder,
        },
      ],
    });
  };

  const removeLayer = (layerId: string) => {
    if (document.layers.length <= 1) return;
    const remaining = document.layers.filter((layer) => layer.id !== layerId);
    const nextActive = document.activeLayerId === layerId ? remaining[0]?.id || "" : document.activeLayerId;
    onChange({
      ...document,
      layers: remaining,
      activeLayerId: nextActive,
      objects: document.objects.map((object) =>
        object.layerId === layerId ? { ...object, layerId: nextActive } : object
      ),
    });
  };

  const moveLayer = (layerId: string, direction: -1 | 1) => {
    const index = layers.findIndex((layer) => layer.id === layerId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= layers.length) return;
    const current = layers[index];
    const swap = layers[swapIndex];
    updateLayers([
      ...document.layers.map((layer) => {
        if (layer.id === current.id) return { ...layer, order: swap.order };
        if (layer.id === swap.id) return { ...layer, order: current.order };
        return layer;
      }),
    ]);
  };

  const updateLayers = (nextLayers: PlanLayer[]) => {
    onChange({ ...document, layers: nextLayers });
  };

  return (
    <div className={styles.panelSection}>
      <div className={styles.settingsHeader}>
        <h3 className={styles.panelTitle}>Capas</h3>
        <button type="button" className={styles.linkButton} disabled={readOnly} onClick={addLayer}>
          Añadir
        </button>
      </div>

      <div className={styles.layerList}>
        {layers.map((layer, index) => (
          <div key={layer.id} className={`${styles.layerRow} ${document.activeLayerId === layer.id ? styles.layerRowActive : ""}`}>
            <button
              type="button"
              className={styles.layerSelect}
              disabled={readOnly}
              onClick={() => onChange({ ...document, activeLayerId: layer.id })}
            >
              {layer.color ? <span className={styles.colorDot} style={{ backgroundColor: layer.color }} /> : null}
              <span>{layer.name}</span>
            </button>

            <input
              className={styles.layerNameInput}
              value={layer.name}
              disabled={readOnly}
              onChange={(event) => updateLayer(layer.id, { name: event.target.value })}
            />

            <button type="button" className={styles.iconButton} disabled={readOnly} onClick={() => updateLayer(layer.id, { visible: !layer.visible })}>
              {layer.visible ? "Ver" : "Oculta"}
            </button>
            <button type="button" className={styles.iconButton} disabled={readOnly} onClick={() => updateLayer(layer.id, { locked: !layer.locked })}>
              {layer.locked ? "Bloq" : "Libre"}
            </button>
            <button type="button" className={styles.iconButton} disabled={readOnly || index === 0} onClick={() => moveLayer(layer.id, -1)}>
              ↑
            </button>
            <button type="button" className={styles.iconButton} disabled={readOnly || index === layers.length - 1} onClick={() => moveLayer(layer.id, 1)}>
              ↓
            </button>
            <button type="button" className={styles.iconButton} disabled={readOnly || layers.length <= 1} onClick={() => removeLayer(layer.id)}>
              X
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
