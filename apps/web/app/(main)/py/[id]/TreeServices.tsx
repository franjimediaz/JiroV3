"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Servicio = {
  id: string;
  title: string;
};

type Tarea = {
  id: string;
  title: string;
  service: string;   // FK a services.id
  obraId: string;    // id del proyecto/obra
  total: number | null;
};

type ModalMode = "create" | "view" | "edit";

export default function TreeServices({ proyectoId }: { proyectoId: string }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ModalMode>("create");
  const [current, setCurrent] = useState<Tarea | null>(null);

  // Form
  const [title, setTitle] = useState("");
  const [service, setService] = useState("");

  const readOnly = mode === "view";

  const money = (n: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);

  const serviciosById = useMemo(() => {
    const m = new Map<string, Servicio>();
    for (const s of servicios) m.set(s.id, s);
    return m;
  }, [servicios]);

  async function fetchAll() {
    setLoading(true);
    setError(null);

    try {
      // Servicios (si tu app los filtra por proyecto, añade .eq("obraId", proyectoId) aquí,
      // pero tú has dicho mantener nombres/campos y actualmente no lo filtras)
      const { data: s, error: se } = await supabase
        .from("services")
        .select("id,title")
        .order("title", { ascending: true });

      if (se) throw se;

      // Tareas del proyecto
      const { data: t, error: te } = await supabase
        .from("task")
        .select("id,title,service,obraId,total")
        .eq("obraId", proyectoId)
        .order("title", { ascending: true });

      if (te) throw te;

      setServicios((s || []) as Servicio[]);
      setTareas((t || []) as Tarea[]);
    } catch (e: any) {
      setError(e?.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!proyectoId) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId]);

  const grouped = useMemo(() => {
    const map: Record<
      string,
      { servicio: Servicio; tareas: Tarea[]; total: number }
    > = {};

    for (const s of servicios) {
      map[s.id] = { servicio: s, tareas: [], total: 0 };
    }

    for (const t of tareas) {
      if (!t.service || !map[t.service]) continue;
      map[t.service].tareas.push(t);
      map[t.service].total += Number(t.total || 0);
    }

    // Orden interno
    for (const sid of Object.keys(map)) {
      map[sid].tareas.sort((a, b) => a.title.localeCompare(b.title));
    }

    return Object.values(map).sort((a, b) =>
      a.servicio.title.localeCompare(b.servicio.title)
    );
  }, [servicios, tareas]);

  const totalProyecto = useMemo(
    () => tareas.reduce((acc, t) => acc + Number(t.total || 0), 0),
    [tareas]
  );

  function openCreate(servicePref?: string) {
    setMode("create");
    setCurrent(null);
    setTitle("");
    setService(servicePref || servicios[0]?.id || "");
    setOpen(true);
  }

  function openView(t: Tarea) {
    setMode("view");
    setCurrent(t);
    setTitle(t.title || "");
    setService(t.service || "");
    setOpen(true);
  }

  function openEdit(t: Tarea) {
    setMode("edit");
    setCurrent(t);
    setTitle(t.title || "");
    setService(t.service || "");
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setError(null);
  }

  async function onSave() {
    setError(null);

    if (!title.trim()) return setError("El nombre (title) es obligatorio");
    if (!service) return setError("Selecciona un servicio");

    try {
      if (mode === "create") {
        const payload = {
          title: title.trim(),
          service,
          obraId: proyectoId,
          total: 0, // puedes quitarlo si prefieres null por defecto
        };

        const { error } = await supabase.from("task").insert(payload);
        if (error) throw error;
      }

      if (mode === "edit" && current?.id) {
        const payload = {
          title: title.trim(),
          service,
        };

        const { error } = await supabase.from("task").update(payload).eq("id", current.id);
        if (error) throw error;
      }

      closeModal();
      await fetchAll();
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar");
    }
  }

  async function onDelete(t: Tarea) {
    const ok = window.confirm(`¿Eliminar la tarea "${t.title}"?`);
    if (!ok) return;

    setError(null);
    try {
      const { error } = await supabase.from("task").delete().eq("id", t.id);
      if (error) throw error;
      await fetchAll();
    } catch (e: any) {
      setError(e?.message || "No se pudo eliminar");
    }
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <div className="fw-semibold">services → task</div>
          <div className="text-muted small">
            Total del proyecto: <span className="fw-semibold">{money(totalProyecto)}</span>
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => openCreate()}>
          <i className="bi bi-plus-lg me-2" />
          Crear tarea
        </button>
      </div>

      {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}

      {loading ? (
        <div className="alert alert-secondary mb-0">Cargando árbol…</div>
      ) : grouped.length === 0 ? (
        <div className="alert alert-secondary mb-0">
          No hay services o no hay task asociadas a este proyecto.
        </div>
      ) : (
        <div className="accordion" id="acc-servicios">
          {grouped.map((g, idx) => (
            <div className="accordion-item" key={g.servicio.id}>
              <h2 className="accordion-header" id={`h-${g.servicio.id}`}>
                <button
                  className={`accordion-button ${idx === 0 ? "" : "collapsed"}`}
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target={`#c-${g.servicio.id}`}
                  aria-expanded={idx === 0 ? "true" : "false"}
                  aria-controls={`c-${g.servicio.id}`}
                >
                  <div className="d-flex w-100 align-items-center justify-content-between">
                    <div className="fw-semibold">{g.servicio.title}</div>
                    <div className="ms-3">
                      <span className="badge text-bg-light">{g.tareas.length} task</span>
                      <span className="badge text-bg-primary ms-2">{money(g.total)}</span>
                    </div>
                  </div>
                </button>
              </h2>

              <div
                id={`c-${g.servicio.id}`}
                className={`accordion-collapse collapse ${idx === 0 ? "show" : ""}`}
                aria-labelledby={`h-${g.servicio.id}`}
                data-bs-parent="rgba(58, 94, 94, 1)-servicios"
              >
                <div className="accordion-body">
                  <div className="d-flex justify-content-end mb-2">
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => openCreate(g.servicio.id)}
                    >
                      <i className="bi bi-plus-lg me-2" />
                      Crear tarea en {g.servicio.title}
                    </button>
                  </div>

                  {g.tareas.length === 0 ? (
                    <div className="text-muted small">Sin task todavía.</div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead>
                          <tr className="text-muted small">
                            <th style={{ width: "55%" }}>Tarea (title)</th>
                            <th style={{ width: "20%" }}>Coste (total)</th>
                            <th style={{ width: "25%" }} className="text-end">
                              Acciones
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.tareas.map((t) => (
                            <tr key={t.id}>
                              <td className="fw-semibold">{t.title}</td>
                              <td>{money(Number(t.total || 0))}</td>
                              <td className="text-end">
                                <div className="btn-group">
                                  <button
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => openView(t)}
                                    title="Ver"
                                  >
                                    <i className="bi bi-eye" />
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline-warning"
                                    onClick={() => openEdit(t)}
                                    title="Editar"
                                  >
                                    <i className="bi bi-pencil" />
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => onDelete(t)}
                                    title="Eliminar"
                                  >
                                    <i className="bi bi-trash" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="d-flex justify-content-end mt-3">
                    <div className="text-muted small me-2">Total servicio:</div>
                    <div className="fw-semibold">{money(g.total)}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal sin JS bootstrap */}
      {open && (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog">
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title mb-0">
                    {mode === "create" && "Crear tarea"}
                    {mode === "view" && "Ver tarea"}
                    {mode === "edit" && "Editar tarea"}
                  </h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
                </div>

                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Nombre de la tarea (title)</label>
                    <input
                      className="form-control"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={readOnly}
                      placeholder="Ej. Cambiar grifería"
                    />
                  </div>

                  <div className="mb-2">
                    <label className="form-label">Servicio (service)</label>
                    <select
                      className="form-select"
                      value={service}
                      onChange={(e) => setService(e.target.value)}
                      disabled={readOnly}
                    >
                      <option value="">—</option>
                      {servicios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>

                    {!!service && (
                      <div className="form-text">{serviciosById.get(service)?.title ?? ""}</div>
                    )}
                  </div>
                </div>

                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={closeModal}>
                    Cerrar
                  </button>

                  {(mode === "create" || mode === "edit") && (
                    <button className="btn btn-primary" onClick={onSave}>
                      Guardar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="modal-backdrop fade show" onClick={closeModal} />
        </>
      )}
    </div>
  );
}
