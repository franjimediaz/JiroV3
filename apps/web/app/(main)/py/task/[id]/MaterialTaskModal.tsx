"use client";

import React, { useEffect, useMemo, useState } from "react";
// Ajusta este import a tu cliente real
import { createClient } from "@/lib/supabase/client";

// Ajusta este import al tuyo (tú ya tienes SelectorTabla en JiRo)
import {SelectorTabla} from "@repo/ui";

type Props = {
  open: boolean;
  onClose: () => void;
  taskId: string;                 // <-- inyección directa (campo "task")
  onCreated?: () => void;         // para refrescar listado
};

function pickId(val: any) {
  if (typeof val === "string") return val === "id" ? "" : val;
  if (val && typeof val === "object") return val.id || val.value || "";
  return "";
}

export default function MaterialTaskModal({
  open,
  onClose,
  taskId,
  onCreated,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [materialId, setMaterialId] = useState<string>("");
  const [materialTitle, setMaterialTitle] = useState<string>("");

  const [ud, setUd] = useState<number>(1);     // campo "ud"
  const [pu, setPu] = useState<number>(0);
  const [description, setDescription] = useState<string>("");     // campo "description"

  const total = useMemo(() => {
    const u = Number.isFinite(ud) ? ud : 0;
    const p = Number.isFinite(pu) ? pu : 0;
    return Math.round(u * p * 100) / 100;
  }, [ud, pu]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>("");

  // Reset al abrir/cerrar
  useEffect(() => {
    if (!open) return;
    setErr("");
    setMaterialId("");
    setMaterialTitle("");
    setUd(1);
    setPu(0);
  }, [open]);

  // Si seleccionas material: autocompleta pu desde materials.pu
  const handleSelectMaterial = async (val: any) => {
  // Si viene objeto
  const id =
    typeof val === "string"
      ? val
      : val?.id ?? val?.value ?? "";

  if (!id || id === "id") {
    setErr("Material inválido seleccionado");
    return;
  }

  setMaterialId(id);

  const { data, error } = await supabase
    .from("materials")
    .select("id,title,pu")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    setErr(error.message);
    return;
  }

  setMaterialTitle(data?.title ?? "");
  setPu(Number(data?.pu ?? 0));
};


  const canSave =
    !!taskId &&
    !!materialId &&
    Number.isFinite(ud) &&
    ud > 0 &&
    Number.isFinite(pu) &&
    pu >= 0;

  const handleSave = async () => {
    if (!canSave) {
      setErr("Faltan datos: material obligatorio y ud > 0.");
      return;
    }

    setSaving(true);
    setErr("");

    try {
      const payload = {
        task: taskId,
        material: materialId,
        ud,
        pu,
        description,
        total, // snapshot
      };
      
      const { error } = await supabase.from("materialstask").insert(payload);

      if (error) throw error;
      console.log("payload", payload);
      onCreated?.();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Error guardando material en la tarea");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop fade show"
        onClick={saving ? undefined : onClose}
      />

      {/* Modal */}
      <div className="modal fade show" style={{ display: "block" }} role="dialog">
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content">

            <div className="modal-header">
              <div className="d-flex flex-column">
                <h5 className="modal-title mb-0">Añadir material a tarea</h5>
                <small className="text-muted">
                  task: <code>{taskId}</code>
                </small>
              </div>

              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={saving ? undefined : onClose}
              />
            </div>

            <div className="modal-body">
              {err && (
                <div className="alert alert-danger py-2">{err}</div>
              )}

              {/* Material (selectorTabla) */}
              <div className="mb-3">
                <label className="form-label">Material</label>

                {/* AJUSTA a tu API de SelectorTabla */}
                <SelectorTabla
                  moduleSlug="materials"
                  value={materialId}
                  displayField="title"
                  valueField="id"
                  placeholder="Selecciona material..."
                  readOnly={saving}
                  multiple={false}
                  limit={20}
                  onChange={(val: any) => {
                    const id = pickId(val);
                    handleSelectMaterial(id);
                    }}
                />

                {materialTitle && (
                  <div className="form-text">
                    Seleccionado: <strong>{materialTitle}</strong>
                  </div>
                )}
              </div>

              <div className="row g-3">
                <div className="col-6">
                  <label className="form-label text-dark">Cantidad (ud)</label>
                  <input
                    type="number"
                    className="form-control "
                    min={0}
                    step={1}
                    value={ud}
                    onChange={(e) => setUd(Number(e.target.value))}
                    disabled={saving}
                  />
                </div>

                <div className="col-6">
                  <label className="form-label text-dark">Precio unidad (pu)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    step={0.01}
                    value={pu}
                    onChange={(e) => setPu(Number(e.target.value))}
                    disabled={saving}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label text-dark">Total</label>
                  <input
                    type="number"
                    className="form-control"
                    value={total}
                    readOnly
                  />
                  <div className="form-text text-dark">
                    total = ud × pu
                  </div>

                  <div className="col-14">
                  <label className="form-label text-dark">Descripción</label>
                  <input
                    type="text"
                    className="form-control"
                    min={0}
                    step={0.01}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={saving}
                  />
                </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={saving}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!canSave || saving}
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
