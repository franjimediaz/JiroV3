"use client";

import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./ModalConfirm.module.css";

let configurationLocks = 0;
let bodyOverflow = "";

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
  children?: React.ReactNode;
  configuration?: boolean;
  suspended?: boolean;
  confirmDisabled?: boolean;
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
  children,
  configuration = false,
  suspended = false,
  confirmDisabled = false,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    if (!open || !configuration) return;
    if (configurationLocks++ === 0) bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (--configurationLocks === 0) document.body.style.overflow = bodyOverflow;
    };
  }, [open, configuration]);
  useEffect(() => {
    if (!open || !configuration || suspended) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      // Existing selectors may open their own picker above the configuration.
      if (Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).some(
        (dialog) => dialog !== dialogRef.current && dialog.getClientRects().length > 0
      )) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelRef.current();
      }
      if (event.key === "Tab") {
        const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
        ) || []).filter((element) => element.getClientRects().length > 0);
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
          event.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, configuration, suspended]);
  if (!open) return null;

  const modal = (
    <div className={`${styles.overlay} ${configuration ? styles.configuration : ""}`} role="dialog" aria-modal="true"
      aria-labelledby={titleId} ref={dialogRef} tabIndex={-1} style={suspended ? { display: "none" } : undefined}>
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
            <h5 className={styles.title} id={titleId}>{title}</h5>

            <button
              type="button"
              className={`btn-close btn-close-white ${styles.close}`}
              aria-label="Cerrar"
              onClick={onCancel}
            />
          </div>

          {/* BODY */}
          <div className={styles.body}>
            {children}
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
              disabled={confirmDisabled}
            >
              {confirmText ||
                (mode === "confirm" ? "Confirmar" : "Aceptar")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  return configuration && typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
