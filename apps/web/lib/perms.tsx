"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export type Accion = "ver" | "crear" | "actualizar" | "eliminar" |"importar"|"exportar"| "*";
export type Permiso = { modulo: string; accion: Accion | string };

type Ctx = {
  loading: boolean;
  permisos: Permiso[];
  hasPermiso: (modulo: string, accion?: Accion) => boolean;
  refresh: () => Promise<void>;
};

const PermsContext = createContext<Ctx | null>(null);

// Normalización “de verdad”
const aliasAccion: Record<string, Accion> = {
  read: "ver",
  view: "ver",
  list: "ver",
  get: "ver",
  create: "crear",
  add: "crear",
  new: "crear",
  edit: "actualizar",
  update: "actualizar",
  delete: "eliminar",
  remove: "eliminar",
};

function normalizarModulo(input: string): string {
  if (!input) return "";
  let m = String(input).trim().toLowerCase();
  m = m.split("?")[0].split("#")[0];
  m = m.replace(/^\/+/, "");
  m = m.replace(/^public\./, "");
  m = m.replace(/\\/g, "/");

  // si viene como ruta, nos quedamos con el último segmento
  if (m.includes("/")) m = m.split("/").filter(Boolean).pop() || m;
  if (m.includes(".")) m = m.split(".").filter(Boolean).pop() || m;

  return m;
}

function normalizarAccion(a: any): Accion {
  const k = String(a || "ver").trim().toLowerCase();
  return aliasAccion[k] || (k as Accion);
}

export function PermisosProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [permisos, setPermisos] = useState<Permiso[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/perms", { credentials: "include" });

      const ct = res.headers.get("content-type") || "";
      if (!res.ok) {
        // fail closed
        setPermisos([]);
        return;
      }
      if (!ct.includes("application/json")) {
        setPermisos([]);
        return;
      }

      const data = await res.json();
      const raw = Array.isArray(data?.permisos) ? data.permisos : [];

      const norm: Permiso[] = raw.map((p: any) => ({
        modulo: normalizarModulo(p.modulo),
        accion: normalizarAccion(p.accion),
      }));

      setPermisos(norm);
    } catch {
      setPermisos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const hasPermiso = (modulo: string, accion: Accion = "ver") => {
    const m = normalizarModulo(modulo);
    const a = normalizarAccion(accion);

    return permisos.some((p) => {
      const pm = normalizarModulo(p.modulo);
      const pa = normalizarAccion(p.accion);

      const matchModulo = pm === "*" || pm === m;
      const matchAccion = pa === "*" || pa === a;
      return matchModulo && matchAccion;
    });
  };

  const value = useMemo<Ctx>(
    () => ({ loading, permisos, hasPermiso, refresh: load }),
    [loading, permisos]
  );

  return <PermsContext.Provider value={value}>{children}</PermsContext.Provider>;
}


export function usePerms() {
  const ctx = useContext(PermsContext);
  if (!ctx) throw new Error("usePerms debe usarse dentro de PermisosProvider");
  return ctx;
}

export function RequirePerms({
  modulo,
  accion = "ver",
  children,
}: {
  modulo: string;
  accion?: Accion;
  children: React.ReactNode;
}) {
  const { loading, hasPermiso } = usePerms();
  const router = useRouter();
  const pathname = usePathname();

  const allowed = useMemo(() => {
    if (loading) return false;
    return hasPermiso(modulo, accion);
  }, [loading, hasPermiso, modulo, accion]);

  useEffect(() => {
    if (loading) return;
    if (pathname === "/403") return;

    if (!allowed) router.replace("/403");
  }, [loading, allowed, router, pathname]);

  if (loading) return null;
  if (!allowed) return null;

  return <>{children}</>;
}