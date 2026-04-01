"use client";

import type { Field, FieldType } from "@repo/types";
import { IconPicker } from "./IconPicker";
import Selector from "./Selector";
import RichTextEditor from "./RichTextEditor";
import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  field: Field;
  value: any;
  onChange: (v: any) => void;
  readOnly?: boolean;
};
type UploadedFileValue = {
  bucket: string;
  path: string;
  url: string | null;
  name: string;
  size?: number;
  mimeType?: string;
  kind?: "file" | "image";
};

function toInputDate(value?: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

function toInputDateTimeLocal(value?: string) {
  if (!value) return "";

  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function uploadSingleFile(
  file: File,
  kind: "file" | "image",
  folder = "general"
): Promise<UploadedFileValue> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);
  formData.append("folder", folder);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "No se pudo subir el archivo");
  }

  return {
    bucket: data.bucket,
    path: data.path,
    url: data.url,
    name: data.name || file.name,
    size: data.size || file.size,
    mimeType: data.mimeType || file.type,
    kind,
  };
}
function defaultForType(t: FieldType): any {
  switch (t) {
    case "number":
    case "money":
    case "percent":
      return 0;
    case "boolean":
      return false;
    case "multiselect":
      return [];
    case "file":
    case "image":
      return "";
    default:
      return "";
  }
}

function FileFieldInput({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: Field;
  value: UploadedFileValue | "" | null;
  onChange: (v: any) => void;
  readOnly?: boolean;
}) {
  const [uploading, setUploading] = React.useState(false);
  const isImage = field.type === "image";

  const fileValue =
    value && typeof value === "object" ? value as UploadedFileValue : null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const uploaded = await uploadSingleFile(file, isImage ? "image" : "file");
      onChange(uploaded);
    } catch (err) {
      console.error(err);
      alert("Error al subir el archivo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="d-flex flex-column gap-2">
      {!readOnly && (
        <input
          type="file"
          className="form-control"
          accept={isImage ? "image/*" : undefined}
          onChange={handleFileChange}
          disabled={readOnly || uploading}
        />
      )}

      {uploading && (
        <div className="small text-muted">Subiendo archivo...</div>
      )}

      {fileValue?.url && (
        <div className="border rounded p-2 bg-light">
          <div className="small fw-semibold">{fileValue.name}</div>

          {isImage && (
            <img
              src={fileValue.url}
              alt={fileValue.name || "Imagen subida"}
              style={{
                maxWidth: "220px",
                maxHeight: "220px",
                objectFit: "cover",
                borderRadius: 8,
                marginTop: 8,
              }}
            />
          )}

          {!isImage && (
            <a href={fileValue.url} target="_blank" rel="noreferrer">
              Ver documento
            </a>
          )}

          {!readOnly && (
            <div className="mt-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => onChange("")}
              >
                Quitar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FieldInput({ field, value, onChange, readOnly }: Props) {
  const type = field.type as FieldType;

  if (type === "boolean") {
    return (
      <div className="form-check">
        <input
          type="checkbox"
          className="form-check-input"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          disabled={readOnly}
        />
      </div>
    );
  }

  if (type === "number" || type === "money" || type === "percent") {
    return (
      <input
        type="number"
        className="form-control"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        disabled={readOnly}
      />
    );
  }

  if (type === "date" || type === "datetime") {
    const inputValue = type === "date" ? toInputDate(value) : toInputDateTimeLocal(value);

    return (
      <input
        type={type === "datetime" ? "datetime-local" : "date"}
        className="form-control"
        value={inputValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      />
    );
  }

  if (type === "color") {
    return (
      <input
        type="color"
        className="form-control form-control-color"
        value={value || "#000000"}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      />
    );
  }

  if (type === "select") {
    const opts = field.options || [];
    return (
      <select
        className="form-select"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (type === "multiselect") {
    const opts = field.options || [];
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="d-flex flex-column gap-1">
        {opts.map((o) => {
          const checked = arr.includes(o);
          return (
            <div className="form-check" key={o}>
              <input
                className="form-check-input"
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked ? [...arr, o] : arr.filter((x) => x !== o);
                  onChange(next);
                }}
                disabled={readOnly}
              />
              <label className="form-check-label">{o}</label>
            </div>
          );
        })}
      </div>
    );
  }

  if (type === "file" || type === "image") {
    return (
      <FileFieldInput
      field={field}
      value={value}
      onChange={onChange}
      readOnly={readOnly}
    />
    );
  }

  if (type === "selectorTabla") {
    const ref = field.ref;
    const isMultiple = !!(ref && "multiple" in ref && ref.multiple);
    const moduleSlug = ref && "moduleSlug" in ref ? (ref as any).moduleSlug : "";
    const displayField = ref && "displayField" in ref ? (ref as any).displayField : "id";
    const valueField = ref && "valueField" in ref ? (ref as any).valueField : "id";
    const filters = ref && "filters" in ref ? (ref as any).filters : [];
    const sort = ref && "sort" in ref ? (ref as any).sort : [];
    const hasStyle = ref && "hasStyle" in ref ? (ref as any).hasStyle : false;
    const styleIconField = ref && "styleIconField" in ref ? (ref as any).styleIconField : "icon";
    const styleColorField = ref && "styleColorField" in ref ? (ref as any).styleColorField : "color";

    return (
      <Selector
        moduleSlug={moduleSlug}
        displayField={displayField}
        valueField={valueField}
        value={value ?? ""}
        onChange={onChange}
        readOnly={readOnly}
        filters={filters}
        sort={sort}
        multiple={isMultiple}
        placeholder={field.placeholder || "Selecciona un registro"}
        hasStyle={hasStyle}
        styleIconField={styleIconField}
        styleColorField={styleColorField}
      />
    );
  }

  if (type === "iconpicker") {
    return <IconPicker value={value || ""} onChange={(v) => onChange(v)} />;
  }

  if (field.ui?.variant === "richtext") {
    return (
      <RichTextEditor
        value={String(value ?? "")}
        readOnly={readOnly}
        placeholder={field.placeholder || "Escribe aquí..."}
        onChange={(html) => onChange(html)}
      />
    );
  }

  if (field.ui?.variant === "textarea" || type === "textarea") {
    return (
      <textarea
        rows={4}
        className="form-control"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      />
    );
  }

  return (
    <input
      type="text"
      className="form-control"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
      placeholder={field.placeholder}
    />
  );
}
