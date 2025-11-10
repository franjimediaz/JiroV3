"use client";

import { useState } from "react";
import {Form} from "@repo/ui";

export default function CustomerFormClient({
  schema,
  initialData,
  readOnly,
  id,
}: {
  schema: any;
  initialData: any;
  readOnly: boolean;
  id: string;
}) {
  const [values, setValues] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      // Ajusta a tu API real (REST/Actions). Ejemplo REST:
      const res = await fetch(`/api/customers/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Error al guardar");
      setMsg({ ok: true, text: "Guardado correctamente" });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || "Error desconocido" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Form
        schema={schema}
        initialData={initialData}
        readOnly={readOnly}
        onChange={setValues}
      />

      {!readOnly && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #2b2b2b",
              background: "#111418",
              color: "#e8eef5",
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          {msg && (
            <span
              style={{
                fontSize: 13,
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${msg.ok ? "#2b8a3e" : "#d94848"}`,
                background: msg.ok ? "#0f2f1c" : "#2f1414",
                color: msg.ok ? "#a6f0b8" : "#ffb3b3",
              }}
            >
              {msg.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
