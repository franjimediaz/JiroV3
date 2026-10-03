"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getRecordName } from "@repo/types";

type Breadcrumb = { pathname: string; module: string; title: string; href: string };
const Context = createContext<{
  value: Breadcrumb | null;
  setValue: Dispatch<SetStateAction<Breadcrumb | null>>;
} | null>(null);

export function getRecordTitle(record: Record<string, unknown> | null, displayField: string, primaryKey: string, fallback: string) {
  return getRecordName(record, undefined, { legacyField: displayField, valueField: primaryKey, fallback });
}

export function RecordBreadcrumbProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Breadcrumb | null>(null);
  return <Context.Provider value={{ value, setValue }}>{children}</Context.Provider>;
}

/** Mounted only inside the permitted record view; uses already loaded data. */
export function RegisterRecordBreadcrumb({ module, title, href }: Omit<Breadcrumb, "pathname">) {
  const setValue = useContext(Context)?.setValue;
  const pathname = usePathname();
  useEffect(() => {
    if (!setValue) return;
    const entry = { pathname, module, title, href };
    setValue(entry);
    return () => setValue(current => current === entry ? null : current);
  }, [setValue, pathname, module, title, href]);
  return null;
}

export function RecordBreadcrumbTrail() {
  const value = useContext(Context)?.value;
  const pathname = usePathname();
  if (!value || value.pathname !== pathname) return null;
  return (
    <nav aria-label="Ruta del registro" className="record-breadcrumb">
      <Link href={value.href} title={value.module}>{value.module}</Link>
      <span aria-hidden="true">›</span>
      <span aria-current="page" title={value.title}>{value.title}</span>
    </nav>
  );
}
