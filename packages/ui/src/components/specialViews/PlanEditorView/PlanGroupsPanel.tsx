"use client";

import styles from "./PlanEditorView.module.css";
import type { PlanDocument } from "./planTypes";

type Props = {
  document: PlanDocument;
  selectedIds: string[];
  readOnly?: boolean;
  onGroup: () => void;
  onUngroup: (groupId: string) => void;
  onUpdateGroup: (groupId: string, patch: Partial<PlanDocument["groups"][number]>) => void;
};

export default function PlanGroupsPanel({ document, selectedIds, readOnly, onGroup, onUngroup, onUpdateGroup }: Props) {
  return (
    <aside className={styles.panel}>
      <div className={styles.settingsHeader}>
        <h3 className={styles.panelTitle}>Grupos</h3>
        <button type="button" className={styles.button} disabled={readOnly || selectedIds.length < 2} onClick={onGroup}>
          Agrupar
        </button>
      </div>
      {!document.groups.length ? <div className={styles.hint}>No hay grupos en este plano.</div> : null}
      <div className={styles.vertexList}>
        {document.groups.map((group) => (
          <div key={group.id} className={styles.groupRow}>
            <input
              className={styles.input}
              value={group.label}
              disabled={readOnly}
              onChange={(event) => onUpdateGroup(group.id, { label: event.target.value })}
            />
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={group.locked} disabled={readOnly} onChange={(event) => onUpdateGroup(group.id, { locked: event.target.checked })} />
              <span>Bloqueado</span>
            </label>
            <div className={styles.meta}>
              <span>{group.objectIds.length} objetos</span>
              <button type="button" className={styles.linkButton} disabled={readOnly} onClick={() => onUngroup(group.id)}>
                Desagrupar
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
