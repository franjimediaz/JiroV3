"use client";

import { useState } from "react";
import { RequirePermiso } from "@/lib/perms";

type DbUser = {
  uid: string;
  email: string | null;
  name: string | null;
  role_id: string | null;
};

type DbRole = {
  id: string;
  title: string;
};

type Props = {
  users: DbUser[];
  roles: DbRole[];
};

export default function UsersAdminClient({ users, roles }: Props) {
  const [localUsers, setLocalUsers] = useState(users);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function handleChangeRole(userId: string, roleId: string) {
    setSavingId(userId);
    setErrorMsg(null);
    setOkMsg(null);

    try {
      const res = await fetch("/api/admin/users/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, roleId }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Error cambiando rol:", data);
        setErrorMsg(data.error || "No se pudo actualizar el rol.");
        return;
      }

      setLocalUsers((prev) =>
        prev.map((u) =>
          u.uid === userId ? { ...u, role_id: roleId } : u
        )
      );

      setOkMsg("Rol actualizado correctamente.");
    } catch (err) {
      console.error("Error en handleChangeRole:", err);
      setErrorMsg("Error de red al actualizar el rol.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <RequirePermiso modulo="usuarios" accion="actualizar">
      <div className="mb-3">
        <h1 className="h4 mb-1">Administración de usuarios</h1>
        <p className="text-muted small mb-0">
          Asigna roles a los usuarios para controlar el acceso por módulos.
        </p>
      </div>

      {errorMsg && (
        <div className="alert alert-danger py-2 small" role="alert">
          {errorMsg}
        </div>
      )}

      {okMsg && (
        <div className="alert alert-success py-2 small" role="alert">
          {okMsg}
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-dark table-striped table-sm align-middle">
          <thead>
            <tr>
              <th style={{ width: "32%" }}>Email</th>
              <th style={{ width: "28%" }}>Nombre</th>
              <th style={{ width: "24%" }}>Rol</th>
              <th style={{ width: "16%" }} className="text-end">
                Acción
              </th>
            </tr>
          </thead>
          <tbody>
            {localUsers.map((user) => {
              const currentRole = roles.find((r) => r.id === user.role_id);

              return (
                <tr key={user.uid}>
                  <td className="small">{user.email ?? "-"}</td>
                  <td className="small">{user.name ?? "-"}</td>
                  <td>
                    <select
                      className="form-select form-select-sm bg-dark text-light"
                      value={user.role_id ?? ""}
                      onChange={(e) =>
                        handleChangeRole(user.uid, e.target.value)
                      }
                    >
                      <option value="">Sin rol</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.title}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-end">
                    {savingId === user.uid ? (
                      <span className="small text-muted">
                        Guardando...
                      </span>
                    ) : currentRole ? (
                      <span className="badge bg-secondary">
                        {currentRole.title}
                      </span>
                    ) : (
                      <span className="badge bg-warning text-dark">
                        Sin rol
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {localUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted small py-4">
                  No hay usuarios en la tabla pública <code>users</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </RequirePermiso>
  );
}
