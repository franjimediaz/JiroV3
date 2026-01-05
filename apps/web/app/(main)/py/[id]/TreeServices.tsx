"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ActionMenu } from "@repo/ui"; // ajusta si tu import real es distinto
import type { ActionMenuItem } from "@repo/types";

type Servicio = {
  id: string;
  title: string;
  icon: string;
  color: string;
};

type Tarea = {
  id: string;
  title: string;
  service: string; // FK a services.id
  obraId: string;  // id del proyecto
  total: number | null;
  description: string | null;
  from: string | null;
  dateto: string | null;
};

type ModalMode = "create" | "view" | "edit";

export default function TreeServices({ proyectoId }: { proyectoId: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [allServicios, setAllServicios] = useState<Servicio[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Accordion controlado por React
  const [openServiceId, setOpenServiceId] = useState<string | null>(null);

  // Modal (solo crear)
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ModalMode>("create");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [service, setService] = useState("");


  const readOnly = mode === "view"; 

  const money = (n: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);

  const serviciosById = useMemo(() => {
    const map = new Map<string, Servicio>();
    for (const s of allServicios) map.set(s.id, s);
    
    return map;
  }, [allServicios]);

  async function fetchAll() {
    setLoading(true);
    setError(null);

    try {
      const { data: t, error: te } = await supabase
            .from("task")
            .select("id,title,service,obraId,total,from,dateto")
            .eq("obraId", proyectoId)
            .order("title", { ascending: true });

            if (te) throw te;
    const serviceIds = Array.from(
        new Set((t ?? []).map((task) => task.service).filter(Boolean))
        );

      const { data: s, error: se } = await supabase
            .from("services")
            .select("id,title,icon,color")
            .in("id", serviceIds)
            .order("title", { ascending: true });

            if (se) throw se;

        const { data: as, error: ase } = await supabase
            .from("services")
            .select("id,title,icon,color")
            
            .order("title", { ascending: true });

            if (ase) throw ase;

      const serviciosList = (s || []) as Servicio[];
      const tareasList = (t || []) as Tarea[];
      const allServiciosList = (as || []) as Servicio[];

      setServicios(serviciosList);
      setTareas(tareasList);
      setAllServicios(allServiciosList);

      // abre el primer servicio con tareas o el primero
      if (!openServiceId) {
        const firstWithTasks = serviciosList.find((sv) =>
          tareasList.some((ta) => ta.service === sv.id)
        );
        setOpenServiceId(firstWithTasks?.id || serviciosList[0]?.id || null);
      }
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
    const map: Record<string, { servicio: Servicio; tareas: Tarea[]; total: number }> = {};

    for (const s of servicios) map[s.id] = { servicio: s, tareas: [], total: 0 };

    for (const t of tareas) {
      if (!t.service || !map[t.service]) continue;
      map[t.service].tareas.push(t);
      map[t.service].total += Number(t.total || 0);
    }

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

  function toggleService(id: string) {
    setOpenServiceId((prev) => (prev === id ? null : id));
  }

  function openCreate(servicePref?: string) {
    setMode("create");
    setTitle("");
    setDescription("");
    setService(servicePref || servicios[0]?.id || "");
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
      const payload = {
        title: title.trim(),
        service,
        obraId: proyectoId,
        total: 0,
        description: description.trim(),
      };

      const { error } = await supabase.from("task").insert(payload);
      if (error) throw error;

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
          <button className="btn btn-success" onClick={() => openCreate()}>
          <i className=" me-2" />
          Generar Presupuesto
        </button>

        </div>

        <button className="btn btn-info" onClick={() => openCreate()}>
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
          {grouped.map((g) => {
            const isOpen = openServiceId === g.servicio.id;

            return (
              <div className="accordion-item" key={g.servicio.id}>
                <h2 className="accordion-header">
                  <button
                    type="button"
                    className={`accordion-button accordion-button-custom ${isOpen ? "" : "collapsed"}`}
                    onClick={() => toggleService(g.servicio.id)}
                  >
                    <div className="d-flex w-100 align-items-center justify-content-between">
                      <div className="fw-bold d-flex align-items-center gap-2">
                            {g.servicio.icon && (
                                <i
                                className={g.servicio.icon}
                                style={{ color: g.servicio.color || "inherit" }}
                                aria-hidden
                                />
                            )}
                            <span className="text-bold">{g.servicio.title}</span>
                            </div>
                      <div className="ms-3">
                        <span className="badge text-bg-light">{g.tareas.length} task</span>
                        <span className="badge bg-dark ms-2">{money(g.total)}</span>
                      </div>
                    </div>
                  </button>
                </h2>

                <div className={`accordion-collapse collapse ${isOpen ? "show" : ""}`}>
                  <div className="accordion-body">
                    <div className="d-flex justify-content-end mb-2">
                      
                    </div>

                    {g.tareas.length === 0 ? (
                      <div className="text-muted small">Sin task todavía.</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table className="table table-hover align-middle mb-0">
                          <thead>
                            <tr className="text-muted small">
                              <th className="table-header-gradient text-light" style={{ width: "25%" }}>Título tarea</th>
                              <th className="table-header-gradient text-light" style={{ width: "25%" }}>Periodo</th>
                              <th className="table-header-gradient text-light" style={{ width: "20%" }}>Coste total</th>
                              <th className="table-header-gradient text-end text-light" style={{ width: "25%" }}>
                                Acciones
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.tareas.map((t) => (
                              <tr key={t.id}>
                                <td className="fw-bold">{t.title}</td>
                                <td className="fw-semibold">{t.from} → {t.dateto}</td>
                                <td>{money(Number(t.total || 0))}</td>

                                <td className="text-end text-nowrap">
                                    <span
                                        className="d-inline-flex align-items-center"
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <ActionMenu
                                        items={[
                                            {
                                            label: "Ver",
                                            icon: <i className="bi bi-eye" />,
                                            onClick: () => router.push(`/py/task/${t.id}`),
                                            },
                                            {
                                            label: "Editar",
                                            icon: <i className="bi bi-pencil" />,
                                            onClick: () => router.push(`/py/task/${t.id}?edit=true`),
                                            },
                                            {
                                            label: "Eliminar",
                                            icon: <i className="bi bi-trash" />,
                                            variant: "danger",
                                            onClick: () => onDelete(t),
                                            },
                                        ]}
                                        />
                                    </span>
                                    </td>


                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                  
                  </div>
                </div>
                
              </div>
              
            );
          })}
        <div className="d-flex justify-content-end align-items-center gap-2 mt-3 pt-3 border-top">
            <div className="text-bold">Total</div>
                <div className="fw-bold fs-5">
                    <span className="badge bg-success rounded-pill">{money(totalProyecto)}</span>
                </div> 
            </div>
        </div>
      )}

      {/* Modal SOLO para crear */}
      {open && (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title mb-0">Crear tarea</h5>
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
                    >
                      <option value="">—</option>
                      {allServicios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>

                    {!!service && (
                      <div className="form-text">{serviciosById.get(service)?.title ?? ""}</div>
                    )}
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Descripción</label>
                    <textarea
                      className="form-control"
                    style={{ resize: "vertical", lineHeight: 1.5 }}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={readOnly}
                      placeholder="Descripción breve de la tarea"
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={closeModal}>
                    Cerrar
                  </button>
                  <button className="btn btn-primary" onClick={onSave}>
                    Guardar
                  </button>
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
