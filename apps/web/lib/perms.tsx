"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

/* ----------------------------------------------
   Tipos base
---------------------------------------------- */

export type Accion = "ver" | "crear" | "actualizar" | "eliminar" | "*";

export interface Permiso {
  modulo: string;
  accion: Accion;
}

interface PermisosContextValue {
  permisos: Permiso[];
  hasPermiso: (modulo: string, accion?: Accion) => boolean;
  loading: boolean;
}

/* ----------------------------------------------
   Contexto
---------------------------------------------- */

const PermisosContext = createContext<PermisosContextValue | null>(null);

/* ----------------------------------------------
   Normalización de nombres
---------------------------------------------- */

const aliasModulo: Record<string, string> = {
  // Roles
  roles: "roles",
  role: "roles",
  "system/roles": "roles",

  // Clientes / Customers
  clientes: "customers",
  customer: "customers",
  customers: "customers",

  // Resto de módulos
  obras: "py", // si en tu tabla modulos el slug es "py", esto está bien
  usuarios: "usuarios",
  servicios: "servicios",
  tareas: "tareas",
  materiales: "materiales",
  presupuestos: "presupuestos",
  modulos: "modulos",
};

const aliasAccion: Record<string, Accion> = {
  read: "ver",
  view: "ver",
  ver: "ver",

  create: "crear",
  add: "crear",
  nuevo: "crear",
  crear: "crear",

  update: "actualizar",
  edit: "actualizar",
  actualizar: "actualizar",

  delete: "eliminar",
  remove: "eliminar",
  eliminar: "eliminar",
};

/* ----------------------------------------------
   Helpers
---------------------------------------------- */

function normalizarModulo(m: string): string {
  return aliasModulo[m.toLowerCase()] || m.toLowerCase();
}

function normalizarAccion(a: string | undefined): Accion {
  if (!a) return "ver";
  return aliasAccion[a.toLowerCase()] || (a as Accion);
}

/* ----------------------------------------------
   Provider
---------------------------------------------- */

export function PermisosProvider({ children }: { children: React.ReactNode }) {
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargarPermisos() {
      try {
        const res = await fetch("/api/perms", { credentials: "include" });

        if (!res.ok) {
          console.warn("No se pudo cargar /api/perms, activando acceso total en dev");
          setPermisos([{ modulo: "*", accion: "*" }]);
          setLoading(false);
          return;
        }

        const data = await res.json();

        // Normalizamos permisos que vienen de la API
        const normalizados = (data?.permisos || []).map((p: any) => ({
          modulo: normalizarModulo(p.modulo),
          accion: normalizarAccion(p.accion),
        }));

        // Fallback: si no hay permisos definidos, acceso total en dev
        const efectivos = normalizados.length
          ? normalizados
          : [{ modulo: "*", accion: "*" }];

        setPermisos(efectivos);
      } catch (err) {
        console.error(
          "Error cargando permisos desde /api/perms, activando acceso total en dev:",
          err
        );
        setPermisos([{ modulo: "*", accion: "*" }]);
      } finally {
        setLoading(false);
      }
    }

    cargarPermisos();
  }, []);

  /* ----------------------------------------------
     Función hasPermiso (con wildcard en módulo y acción)
  ---------------------------------------------- */
  function hasPermiso(modulo: string, accion: Accion = "ver"): boolean {
    const mod = normalizarModulo(modulo);
    const acc = normalizarAccion(accion);

    return permisos.some((p) => {
      const pm = normalizarModulo(p.modulo);
      const pa = normalizarAccion(p.accion);

      const moduloOK = pm === "*" || pm === mod;
      const accionOK = pa === "*" || pa === acc || acc === "*";

      return moduloOK && accionOK;
    });
  }

  const value: PermisosContextValue = {
    permisos,
    hasPermiso,
    loading,
  };

  return (
    <PermisosContext.Provider value={value}>
      {children}
    </PermisosContext.Provider>
  );
}

/* ----------------------------------------------
   Hook de acceso
---------------------------------------------- */

export function usePerms() {
  const ctx = useContext(PermisosContext);
  if (!ctx)
    throw new Error("usePerms debe usarse dentro de <PermisosProvider>.");
  return ctx;
}

/* ----------------------------------------------
   RequirePermiso — para proteger páginas y componentes
---------------------------------------------- */

export function RequirePermiso({
  modulo,
  accion = "ver",
  children,
}: {
  modulo: string;
  accion?: Accion;
  children: React.ReactNode;
}) {
  const { hasPermiso, loading } = usePerms();
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (loading) return;

    const ok = hasPermiso(modulo, accion);
    setAllowed(ok);

    if (!ok) {
      console.warn(
        `🚫 Acceso denegado a ${pathname}: falta permiso ${modulo}:${accion}: Acceso:`,
        hasPermiso.toString()
      );
      router.push("/403");
    }
  }, [loading, modulo, accion, hasPermiso, router, pathname]);

  // Mientras carga o aún no hemos evaluado permisos -> no pintamos nada
  if (loading || allowed === null) return null;

  // Si no tiene permiso, ya hemos hecho push en el efecto, aquí no renderizamos nada
  if (!allowed) return null;

  return <>{children}</>;
}
