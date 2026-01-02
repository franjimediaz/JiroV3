"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

export type Accion = "ver" | "crear" | "actualizar" | "eliminar" | "*";
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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [permisos, setPermisos] = useState<Permiso[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/perms", { credentials: "include" });

      // ✅ Si no hay sesión, esto NO es “sin permisos”, es “sin login”
      if (res.status === 401) {
        setPermisos([]);
        router.replace("/login");
        return;
      }

      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.includes("application/json")) {
        // fail closed
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
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const hasPermiso = useCallback(
    (modulo: string, accion: Accion = "ver") => {
      const m = normalizarModulo(modulo);
      const a = normalizarAccion(accion);

      return permisos.some((p) => {
        const pm = normalizarModulo(p.modulo);
        const pa = normalizarAccion(p.accion);

        const matchModulo = pm === "*" || pm === m;
        const matchAccion = pa === "*" || pa === a;
        return matchModulo && matchAccion;
      });
    },
    [permisos]
  );

  const value = useMemo<Ctx>(
    () => ({ loading, permisos, hasPermiso, refresh: load }),
    [loading, permisos, hasPermiso, load]
  );

  return <PermsContext.Provider value={value}>{children}</PermsContext.Provider>;
}

export function RequirePermiso({
  modulo,
  accion = "ver",
  children,
}: {
  modulo: string;
  accion?: "ver" | "crear" | "actualizar" | "eliminar";
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { loading, hasPermiso } = usePerms();

  useEffect(() => {
    if (loading) return;
    if (!hasPermiso(modulo, accion)) router.replace("/403");
  }, [loading, modulo, accion, hasPermiso, router]);

  if (loading) return null; // o spinner
  if (!hasPermiso(modulo, accion)) return null; // evita flash
  return <>{children}</>;
}

export function usePerms() {
  const ctx = useContext(PermsContext);
  if (!ctx) throw new Error("usePerms debe usarse dentro de PermisosProvider");
  return ctx;
}
