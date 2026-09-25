"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { permissionGranted } from "./auth/permissionRules";

export type Accion =
  | "ver"
  | "crear"
  | "actualizar"
  | "eliminar"
  | "importar"
  | "exportar"
  | "*";
export type Permiso = { modulo: string; accion: Accion | string };

type Ctx = {
  loading: boolean;
  permisos: Permiso[];
  hasPermiso: (modulo: string, accion?: Accion) => boolean;
  refresh: () => Promise<void>;
};

const PermsContext = createContext<Ctx | null>(null);

export function PermisosProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setPermisos([]);
    try {
      const res = await fetch("/api/perms", {
        credentials: "include",
        cache: "no-store",
      });
      if (current !== requestId.current) return;

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
      if (current !== requestId.current) return;
      const raw = Array.isArray(data?.permisos) ? data.permisos : [];

      const norm: Permiso[] = raw.filter(
        (p: unknown): p is Permiso =>
          !!p &&
          typeof p === "object" &&
          "modulo" in p &&
          typeof p.modulo === "string" &&
          "accion" in p &&
          typeof p.accion === "string",
      );
      setPermisos(norm);
    } catch {
      if (current === requestId.current) setPermisos([]);
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  const invalidatePendingRequest = useCallback(() => {
    requestId.current++;
  }, []);
  useEffect(() => {
    load();
    return invalidatePendingRequest;
  }, [load, pathname, invalidatePendingRequest]);

  const hasPermiso = useCallback(
    (modulo: string, accion: Accion = "ver") => {
      return permissionGranted(permisos, modulo, accion);
    },
    [permisos],
  );

  const value = useMemo<Ctx>(
    () => ({ loading, permisos, hasPermiso, refresh: load }),
    [loading, permisos, hasPermiso, load],
  );

  return (
    <PermsContext.Provider value={value}>{children}</PermsContext.Provider>
  );
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
