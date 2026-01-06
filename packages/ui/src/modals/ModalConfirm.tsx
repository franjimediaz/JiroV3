"use client";

import React from "react";
import styles from "./ModalConfirm.module.css";

export type ModalConfirmMode = "confirm" | "info";

export type ModalConfirmDetail = {
  label: string;
  value: React.ReactNode;
};

type Props = {
  open: boolean;
  title?: string;
  message?: string;
  details?: ModalConfirmDetail[];
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  mode?: ModalConfirmMode;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ModalConfirm({
  open,
  title = "Confirmar acción",
  message,
  details = [],
  confirmText,
  cancelText,
  danger = false,
  mode = "confirm",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      {/* BACKDROP */}
      <div
        className={styles.backdrop}
        onClick={mode === "confirm" ? onCancel : undefined}
      />

      {/* DIALOG */}
      <div className={styles.dialog}>
        <div className={styles.content}>
          {/* HEADER */}
          <div
            className={`${styles.header} ${
              danger ? styles.headerDanger : styles.headerPrimary
            }`}
          >
            <h5 className={styles.title}>{title}</h5>

            <button
              type="button"
              className={`btn-close btn-close-white ${styles.close}`}
              aria-label="Cerrar"
              onClick={onCancel}
            />
          </div>

          {/* BODY */}
          <div className={styles.body}>
            {message && (
              <p className={styles.message}>{message}</p>
            )}

            {details.length > 0 && (
              <div className={styles.details}>
                {details.map((d, i) => (
                  <div key={i} className={styles.detail}>
                    <strong>{d.label}:</strong> {d.value}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div className={styles.footer}>
            {/* CANCELAR solo en confirm */}
            {mode === "confirm" && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onCancel}
              >
                {cancelText || "Cancelar"}
              </button>
            )}

            {/* CONFIRMAR / ACEPTAR */}
            <button
              type="button"
              className={`btn ${
                mode === "confirm"
                  ? danger
                    ? "btn-danger"
                    : "btn-primary"
                  : "btn-primary"
              } ${styles.confirm}`}
              onClick={onConfirm}
            >
              {confirmText ||
                (mode === "confirm" ? "Confirmar" : "Aceptar")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
