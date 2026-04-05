"use client";

import { IconPicker } from "./IconPicker";
import Selector from "./Selector";
import type { Field, ModuleSchema, FieldType, UiTab, FormSection,TreeViewDataProvider } from "@repo/types";
import RichTextEditor from "./RichTextEditor";
import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  field: Field;
  value: any;
  onChange: (v: any) => void;
  readOnly?: boolean;
  uploadFolder?: string;
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



function FileFieldInput({
  field,
  value,
  onChange,
  readOnly,
  uploadFolder,
}: {
  field: Field;
  value: UploadedFileValue | "" | null;
  onChange: (v: any) => void;
  readOnly?: boolean;
  uploadFolder?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const isImage = field.type === "image";
  const effectiveFolder = uploadFolder
  ? `${uploadFolder}/${field.name}`
  : field.name;

  const fileValue =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return null;
          }
        })()
      : value && typeof value === "object"
      ? (value as UploadedFileValue)
      : null;

  const resolvedUrl =
    fileValue?.url ||
    (fileValue?.bucket && fileValue?.path
      ? buildPublicSupabaseUrl(fileValue.bucket, fileValue.path)
      : null);

  const handleFileChange = async (
  e: React.ChangeEvent<HTMLInputElement>
) => {
  const file = e.target.files?.[0];
  if (!file) return;

  setErrorMsg("");

  const validationError = validateSelectedFile(
    file,
    isImage ? "image" : "file"
  );

  if (validationError) {
    setErrorMsg(validationError);
    e.target.value = "";
    return;
  }

  const previousFile = fileValue || null;

  try {
    setUploading(true);

    const uploaded = await uploadSingleFile(
      file,
      isImage ? "image" : "file",
      effectiveFolder
    );

    // 1) primero actualizamos el valor visible/formulario
    onChange(uploaded);

    // 2) luego intentamos borrar el anterior si existía y no es el mismo
    const isDifferentFile =
      previousFile &&
      (previousFile.bucket !== uploaded.bucket ||
        previousFile.path !== uploaded.path);

    if (isDifferentFile) {
      try {
        await deleteStoredFile(previousFile);
      } catch (deleteError: any) {
        console.error("No se pudo borrar el archivo anterior:", deleteError);
        setErrorMsg(
          "El nuevo archivo se guardó, pero no se pudo borrar el anterior."
        );
      }
    }
  } catch (error: any) {
    console.error(error);
    setErrorMsg(error?.message || "Error al subir el archivo");
  } finally {
    setUploading(false);
    e.target.value = "";
  }
};

  const handleRemove = async () => {
  if (!fileValue?.bucket || !fileValue?.path) {
    onChange("");
    return;
  }

  try {
    setDeleting(true);
    setErrorMsg("");

    await deleteStoredFile(fileValue);

    onChange("");
  } catch (error: any) {
    console.error(error);
    setErrorMsg(error?.message || "Error al eliminar el archivo");
  } finally {
    setDeleting(false);
  }
};

  return (
    <div className="d-flex flex-column gap-2">
      {!readOnly && (
        <input
          type="file"
          className="form-control"
          accept={isImage ? ALLOWED_IMAGE_MIME_TYPES.join(",") : undefined}
          onChange={handleFileChange}
          disabled={readOnly || uploading || deleting}
        />
      )}

      {!readOnly && (
        <div className="small text-muted">
          {isImage
            ? `Máximo ${MAX_IMAGE_SIZE_MB} MB. Formatos: JPG, PNG, WEBP, GIF.`
            : `Máximo ${MAX_FILE_SIZE_MB} MB.`}
        </div>
      )}

      {uploading && (
        <div className="small text-muted">Subiendo archivo...</div>
      )}

      {deleting && (
        <div className="small text-muted">Eliminando archivo...</div>
      )}

      {errorMsg && (
        <div className="small text-danger">{errorMsg}</div>
      )}

      {fileValue && (
        <div className="border rounded p-2 bg-light">
          <div className="small fw-semibold">{fileValue.name}</div>
          {fileValue.size ? (
            <div className="small text-muted">{formatBytes(fileValue.size)}</div>
          ) : null}

          {isImage && resolvedUrl ? (
            <img
              src={resolvedUrl}
              alt={fileValue.name || "Imagen subida"}
              style={{
                maxWidth: "220px",
                maxHeight: "220px",
                objectFit: "cover",
                borderRadius: 8,
                marginTop: 8,
              }}
            />
          ) : (
            <div className="small text-muted mt-1">
              Archivo subido correctamente
            </div>
          )}

          {!readOnly && (
            <div className="mt-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={handleRemove}
                disabled={uploading || deleting}
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
// Componente principal que renderiza el input adecuado según el tipo de campo
export default function FieldInput({ field, value, onChange, readOnly, uploadFolder }: Props) {
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
      uploadFolder={uploadFolder}
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
/// utils para convertir fechas a formato compatible con inputs de tipo date y datetime-local

function toInputDate(value?: string) {
  if (!value) return "";
  return value.slice(0, 10);
}
const MAX_IMAGE_SIZE_MB = 5;
const MAX_FILE_SIZE_MB = 10;

const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

function formatBytes(bytes?: number) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function validateSelectedFile(file: File, kind: "file" | "image") {
  if (kind === "image") {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      return "Formato de imagen no permitido. Usa JPG, PNG, WEBP o GIF.";
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return `La imagen supera el máximo de ${MAX_IMAGE_SIZE_MB} MB.`;
    }
  }

  if (kind === "file") {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `El archivo supera el máximo de ${MAX_FILE_SIZE_MB} MB.`;
    }
  }

  return null;
}
function buildPublicSupabaseUrl(bucket: string, path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !bucket || !path) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}
async function deleteStoredFile(fileValue?: UploadedFileValue | null) {
  if (!fileValue?.bucket || !fileValue?.path) return { ok: true };

  const res = await fetch("/api/upload", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucket: fileValue.bucket,
      path: fileValue.path,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || "No se pudo eliminar el archivo anterior");
  }

  return data;
}

function toInputDateTimeLocal(value?: string) {
  if (!value) return "";

  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// Esta función se encarga de subir un solo archivo al backend y obtener su URL
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

  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text();

  let data: any = null;
  if (contentType.includes("application/json")) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    throw new Error(data?.error || rawText || "No se pudo subir el archivo");
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