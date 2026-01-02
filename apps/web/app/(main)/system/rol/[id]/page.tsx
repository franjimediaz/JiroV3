"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { PermisosPorModulo, AccionModulo } from "@repo/types";
import styles from "./RolDetalle.module.css";

type ModuloLite = {
  id: string;
  nombre: string;
  slug: string;
  actions: AccionModulo[];
};

type RoleDetail = {
  id: string;
  title: string;
  slug: string;
  perms: PermisosPorModulo;
};

const BASE_ACTIONS: AccionModulo[] = [
  "ver",
  "crear",
  "actualizar",
  "eliminar",
  "importar",
  "exportar",
];

export default function RoleDetailPage() {
  const router = useRouter();
  const params = useParams() as { id?: string };
  const id = params?.id;

  const [role, setRole] = useState<RoleDetail | null>(null);
  const [modulos, setModulos] = useState<ModuloLite[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [loadingModulos, setLoadingModulos] = useState(true);

  // Cargar rol
  useEffect(() => {
    if (!id) {
      setLoadingRole(false);
      setError("Falta el id en la URL");
      return;
    }

    const loadRole = async () => {
      setLoadingRole(true);
      setError(null);
      try {
        const res = await fetch(`/api/roles/${id}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json.detail || "No se pudo cargar el rol");
          setRole(null);
          return;
        }
        setRole(json.data);
      } catch (e) {
        console.error(e);
        setError("Error de red cargando el rol");
        setRole(null);
      } finally {
        setLoadingRole(false);
      }
    };

    loadRole();
  }, [id]);

  // Cargar módulos
  useEffect(() => {
    const loadModules = async () => {
      setLoadingModulos(true);
      try {
        const res = await fetch("/api/modulos?flat=1", {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.ok) return;

        const mods: ModuloLite[] = json.data
          .filter((m: any) => m.tipo !== "carpeta")
          .map((m: any) => {
            const actions: AccionModulo[] =
              m.props?.permissions?.actions ?? BASE_ACTIONS;
            return {
              id: m.id,
              nombre: m.nombre,
              slug: m.slug,
              actions,
            };
          });

        setModulos(mods);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingModulos(false);
      }
    };

    loadModules();
  }, []);

  const updatePermiso = (
    moduloSlug: string,
    accion: AccionModulo,
    value: boolean
  ) => {
    if (!role) return;

    setRole((prev) => {
      if (!prev) return prev;
      const prevPerms = prev.perms || {};
      const moduloPerms = prevPerms[moduloSlug] || {};
      return {
        ...prev,
        perms: {
          ...prevPerms,
          [moduloSlug]: {
            ...moduloPerms,
            [accion]: value,
          },
        },
      };
    });
  };

  const toggleAllForAction = (accion: AccionModulo, value: boolean) => {
    if (!role) return;
    setRole((prev) => {
      if (!prev) return prev;
      const newPerms: PermisosPorModulo = { ...prev.perms };

      for (const m of modulos) {
        const currentModulo = newPerms[m.slug] || {};
        newPerms[m.slug] = {
          ...currentModulo,
          [accion]: value,
        };
      }

      return { ...prev, perms: newPerms };
    });
  };

  const handleSave = async () => {
    if (!role) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/roles/${role.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: role.title,
          slug: role.slug,
          perms: role.perms,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        console.error(json);
        setError(json.detail || "No se pudo guardar el rol");
        return;
      }

      router.push("/system/rol");
    } catch (e) {
      console.error(e);
      setError("Error de red guardando el rol");
    } finally {
      setSaving(false);
    }
  };

  if (!id) {
    return (
      <div className={styles.page}>
        <p className={styles.errorText}>Falta el parámetro de rol en la URL.</p>
      </div>
    );
  }

  if (loadingRole) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Cargando rol…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Error</h1>
          <p className={styles.errorText}>{error}</p>
          <button
            className={styles.btnSecondary}
            type="button"
            onClick={() => router.back()}
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.errorText}>Rol no encontrado.</p>
          <button
            className={styles.btnSecondary}
            type="button"
            onClick={() => router.back()}
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerBar}>
        <div>
          <div className={styles.breadcrumb}>System / Roles / Detalle</div>
          <h1 className={styles.label}>{role.title}</h1>
          <div className={styles.subtitle}>
            <span className={styles.slugBadge}>{role.slug}</span>
          </div>
        </div>
        <div>
          
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.btnSecondary}
            type="button"
            onClick={() => router.back()}
          >
            ← Volver
          </button>
          <button
            className={styles.btnPrimary}
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>

      <div className={styles.contentGrid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Permisos por módulo</h2>
              <p className={styles.cardSubtitle}>
                Define qué puede hacer este rol en cada módulo del sistema.
              </p>
            </div>
            <div className={styles.actionsRow}>
              {BASE_ACTIONS.map((accion) => (
                <button
                  key={accion}
                  type="button"
                  className={styles.chipAction}
                  onClick={() => toggleAllForAction(accion, true)}
                >
                  Dar todos: {accion}
                </button>
              ))}
            </div>
          </div>

          {loadingModulos ? (
            <div className={styles.loadingInner}>Cargando módulos…</div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Módulo</th>
                    <th>Slug</th>
                    <th className={styles.colAcciones}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {modulos.map((m) => {
                    const moduloPerms = role.perms?.[m.slug] || {};
                    return (
                      <tr key={m.id}>
                        <td>{m.nombre}</td>
                        <td>
                          <code className={styles.slugCode}>{m.slug}</code>
                        </td>
                        <td>
                          <div className={styles.accionesRow}>
                            {m.actions.map((accion) => (
                              <label
                                key={accion}
                                className={styles.checkboxLabel}
                              >
                                <input
                                  type="checkbox"
                                  className={styles.checkbox}
                                  checked={!!moduloPerms[accion]}
                                  onChange={(e) =>
                                    updatePermiso(
                                      m.slug,
                                      accion,
                                      e.target.checked
                                    )
                                  }
                                />
                                <span className={styles.accionChip}>
                                  {accion}
                                </span>
                              </label>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {modulos.length === 0 && (
                <p className={styles.emptyText}>
                  No hay módulos configurados todavía.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
