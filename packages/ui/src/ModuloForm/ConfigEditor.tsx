"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import ModalConfirm from "../modals/ModalConfirm";
import styles from "./modulo-detalle.module.css";

const ConfigNavigation = createContext<((hidden: boolean) => void) | null>(null);

/** A local transaction: nested Apply updates the parent draft, never the module itself. */
export function ConfigEditor<T>({ title, summary, value, onChange, readOnly, children }: {
  title: string;
  summary?: React.ReactNode;
  value: T;
  onChange: (next: T) => void;
  readOnly?: boolean;
  children: (draft: T, update: (next: T) => void) => React.ReactNode;
}) {
  const [session, setSession] = useState<{ value: T } | null>(null);
  return <>
    <button type="button" className={`btn text-start w-100 my-2 ${styles.configTrigger}`}
      onClick={() => setSession({ value: structuredClone(value) })}>
      <span className="d-flex justify-content-between gap-2"><strong>{title}</strong><span>Editar</span></span>
      {summary && <span className="small d-block mt-1">{summary}</span>}
    </button>
    {session && <ConfigSession title={title} readOnly={readOnly} onClose={() => setSession(null)}
      onApply={() => { onChange(session.value); setSession(null); }}>
      {children(session.value, (next) => setSession({ value: next }))}
    </ConfigSession>}
  </>;
}

export function ConfigSession({ title, readOnly, onClose, onApply, children }: {
  title: string; readOnly?: boolean; onClose: () => void; onApply: () => void; children: React.ReactNode;
}) {
  const parent = useContext(ConfigNavigation);
  const [suspended, setSuspended] = useState(false);
  useEffect(() => {
    parent?.(true);
    return () => parent?.(false);
  }, [parent]);
  return <ConfigNavigation.Provider value={setSuspended}>
    <ModalConfirm open configuration suspended={suspended} title={title}
      confirmText="Aplicar" cancelText={parent ? "← Volver sin aplicar" : "Cancelar"}
      confirmDisabled={readOnly} onConfirm={onApply} onCancel={onClose}>
      {children}
    </ModalConfirm>
  </ConfigNavigation.Provider>;
}
