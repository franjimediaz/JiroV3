"use client";

import { IconPicker } from "./IconPicker";
import Selector from "./Selector";
import type { Field, ModuleSchema, FieldType } from "@repo/types";
import RichTextEditor from "./RichTextEditor";
import React, { useEffect, useState } from "react";
import {
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGE_SIZE_MB,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_IMAGE_MIME_TYPES,
  buildPublicSupabaseUrl,
  deleteStoredFile,
  getAcceptValue,
  getAllowedTypesHint,
  getSignedFileUrl,
  uploadSingleFile,
  validateSelectedFile,
  type UploadedFileValue,
} from "./fileUploadUtils";

type Props = {
  field: Field;
  value: any;
  onChange: (v: any) => void;
  readOnly?: boolean;
  uploadFolder?: string;
  displayValue?: string;
  isDisplayLoading?: boolean;
  displayIcon?: string;
  displayColor?: string;
  formValues?: Record<string, any>;
};
type FileDisplayInfo = {
  icon: string;
  label: string;
};



function FileFieldInput({
  field,
  value,
  onChange,
  readOnly,
  uploadFolder,
  multiple,
  maxFiles,
}: {
  field: Field;
  value: UploadedFileValue | "" | null;
  onChange: (v: any) => void;
  readOnly?: boolean;
  uploadFolder?: string;
  multiple?: boolean;
  maxFiles?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [opening, setOpening] = useState(false);
  const isImage = field.type === "image";

    const parsedValue =
      typeof value === "string"
        ? (() => {
            try {
              return JSON.parse(value);
            } catch {
              return value;
            }
          })()
        : value;

    const files: UploadedFileValue[] = multiple
      ? Array.isArray(parsedValue)
        ? parsedValue
        : parsedValue
        ? [parsedValue as UploadedFileValue]
        : []
      : parsedValue && !Array.isArray(parsedValue)
      ? [parsedValue as UploadedFileValue]
      : [];

    const singleFile = files[0] || null;

function setFiles(nextFiles: UploadedFileValue[]) {
  if (multiple) {
    onChange(nextFiles);
  } else {
    onChange(nextFiles[0] || "");
  }
}
  const handleOpenFile = async (fileToOpen: UploadedFileValue) => {
  if (!fileToOpen?.bucket || !fileToOpen?.path) return;

  try {
    setOpening(true);
    setErrorMsg("");

    let fileUrl = fileToOpen.url;

    if (!fileUrl) {
      fileUrl = await getSignedFileUrl(
        fileToOpen.bucket,
        fileToOpen.path,
        120
      );
    }

    window.open(fileUrl, "_blank", "noopener,noreferrer");
  } catch (error: any) {
    console.error(error);
    setErrorMsg(error?.message || "No se pudo abrir el archivo");
  } finally {
    setOpening(false);
  }
};
  const effectiveFolder = uploadFolder ? `${uploadFolder}/${field.name}` : field.name;

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
        const selectedFiles = Array.from(e.target.files || []);
        if (!selectedFiles.length) return;

        setErrorMsg("");

        const remainingSlots = multiple
          ? Math.max(0, (maxFiles || Infinity) - files.length)
          : 1;

        if (multiple && selectedFiles.length > remainingSlots) {
          setErrorMsg(
            maxFiles
              ? `Solo puedes subir ${maxFiles} archivo(s) en este campo.`
              : "Has seleccionado demasiados archivos."
          );
          e.target.value = "";
          return;
        }

        try {
          setUploading(true);

          if (multiple) {
            const uploadedBatch: UploadedFileValue[] = [];

            for (const file of selectedFiles) {
              const validationError = validateSelectedFile(
                file,
                field,
                isImage ? "image" : "file"
              );

              if (validationError) {
                throw new Error(`${file.name}: ${validationError}`);
              }

              const uploaded = await uploadSingleFile(
                file,
                isImage ? "image" : "file",
                effectiveFolder,
                field.allowedMimeTypes || []
              );

              uploadedBatch.push(uploaded);
            }

            setFiles([...files, ...uploadedBatch]);
          } else {
            const file = selectedFiles[0];

            const validationError = validateSelectedFile(
              file,
              field,
              isImage ? "image" : "file"
            );

            if (validationError) {
              throw new Error(validationError);
            }

            const previousFile = singleFile;

            const uploaded = await uploadSingleFile(
              file,
              isImage ? "image" : "file",
              effectiveFolder,
              field.allowedMimeTypes || []
            );

            setFiles([uploaded]);

            const isDifferentFile =
              previousFile &&
              (previousFile.bucket !== uploaded.bucket ||
                previousFile.path !== uploaded.path);

            if (isDifferentFile) {
              try {
                await deleteStoredFile(previousFile);
              } catch (deleteError) {
                console.error("No se pudo borrar el archivo anterior", deleteError);
                setErrorMsg(
                  "El nuevo archivo se guardó, pero no se pudo borrar el anterior."
                );
              }
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

const handleRemoveOne = async (fileToRemove: UploadedFileValue) => {
        try {
          setDeleting(true);
          setErrorMsg("");

          await deleteStoredFile(fileToRemove);

          const next = files.filter(
            (f) =>
              !(
                f.bucket === fileToRemove.bucket &&
                f.path === fileToRemove.path
              )
          );

          setFiles(next);
        } catch (error: any) {
          console.error(error);
          setErrorMsg(error?.message || "Error al eliminar el archivo");
        } finally {
          setDeleting(false);
        }
      };

const fileInfo = getFileDisplayInfo(fileValue?.mimeType, fileValue?.name);

useEffect(() => {
  if (multiple && maxFiles && files.length > maxFiles) {
    setErrorMsg(`Este campo permite un máximo de ${maxFiles} archivos.`);
  }
}, [multiple, maxFiles, files.length]);

  return (
  <div className="d-flex flex-column gap-2">
    {!readOnly && (
      <input
        type="file"
        className="form-control"
        accept={getAcceptValue(field, isImage)}
        onChange={handleFileChange}
        disabled={readOnly || uploading || deleting}
        multiple={!!multiple}
      />
    )}

     {!readOnly && (
          <div className="small text-white">
            {isImage
              ? `Máximo ${MAX_IMAGE_SIZE_MB} MB.`
              : `Máximo ${MAX_FILE_SIZE_MB} MB.`}
            {" "}
            {getAllowedTypesHint(field, isImage)}
            {multiple && maxFiles ? ` Máximo ${maxFiles} archivos.` : ""}
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

    {multiple ? (
      
      <div className="upload-grid">
        
       
        {files.length === 0 && (
          <div className="small text-muted">No hay archivos subidos.</div>
        )}

        {files.map((fileItem) => {
          const itemInfo = getFileDisplayInfo(fileItem.mimeType, fileItem.name);
          const itemResolvedUrl =
            fileItem.url ||
            (fileItem.bucket && fileItem.path
              ? buildPublicSupabaseUrl(fileItem.bucket, fileItem.path)
              : null);

          return (
            
            <div
              key={`${fileItem.bucket}-${fileItem.path}`}
              className="upload-card"
            >
              
              <div className="d-flex align-items-center gap-2">
                <span style={{ fontSize: "1.25rem" }}>{itemInfo.icon}</span>
                <div>
                  <div className="upload-card__title">{fileItem.name}</div>
                  <div className="upload-card__subtitle">
                    {itemInfo.label}
                    {fileItem.size ? ` · ${formatBytes(fileItem.size)}` : ""}
                  </div>
               <div className="mt-2 d-flex gap-2 flex-wrap">
                </div>
                </div>
              </div>

              {isImage && itemResolvedUrl ? (
                <div className="upload-card">
                    <div className="upload-card__preview">
                      <img
                        src={itemResolvedUrl}
                        alt={fileItem.name || "Imagen subida"}
                        className="upload-card__image"
                      />
                    </div>

                    <div className="upload-card__body">
                        <div className="upload-card__actions">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleOpenFile(fileItem)}
                            disabled={opening || uploading || deleting}
                          >
                            Ver
                          </button>


                          {!readOnly && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleRemoveOne(fileItem)}
                              disabled={uploading || deleting || opening}
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                    </div>
                  </div>
                
                
                
              ) : (
                <div className="upload-card__body">
                  <div className="upload-card__actions">

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() => handleOpenFile(fileItem)}
                          disabled={opening || uploading || deleting}
                        >
                          Descargar
                        </button>

                        {!readOnly && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleRemoveOne(fileItem)}
                            disabled={uploading || deleting || opening}
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      </div>

            
              )}
         
            </div>
          );
        })}
      </div>
    ) : (
      fileValue && (
        <div className="upload-card upload-card--single">
          <div className="d-flex align-items-center gap-2">
            <span style={{ fontSize: "1.25rem" }}>{fileInfo.icon}</span>
            <div>
              <div className="upload-card__title">{fileValue.name}</div>
              <div className="upload-card__subtitle">
                {fileInfo.label}
                {fileValue.size ? ` · ${formatBytes(fileValue.size)}` : ""}
              </div>
            </div>
          </div>

          {isImage && resolvedUrl ? (
            <div className="upload-card__body">
       
            <img
              src={resolvedUrl}
              alt={fileValue.name || "Imagen subida"}
              className="upload-card__image"
            />
            
            </div>
          ) : (
            <div className="upload-card__body">
            
            </div>
          )}
          <div className="upload-card__body">
          <div className="upload-card__actions">
            <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => handleOpenFile(fileValue)}
                  disabled={opening || uploading || deleting}
                >
                  Ver
                </button>
          {!readOnly && (
             <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => handleRemoveOne(fileValue)}
                disabled={uploading || deleting || opening}
              >
                Quitar
              </button>
            
          )}
          </div>
        </div>
        </div>
      )
    )}
  </div>
);
}
// Componente principal que renderiza el input adecuado según el tipo de campo
export default function FieldInput({
  field,
  value,
  onChange,
  readOnly,
  uploadFolder,
  displayValue,
  isDisplayLoading,
  displayIcon,
  displayColor,
  formValues,
}: Props) {
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
  if (type === "percent") {
    return (
      <div className="input-group">
        <input
          type="number"
          className="form-control"
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
          disabled={readOnly}
        />
        <span className="input-group-text">%</span>
      </div>
    );
  }
  if (type === "money") {
    return (
      <div className="input-group">
        <input
          type="number"
          className="form-control"
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
          disabled={readOnly}
        />
        <span className="input-group-text">€</span>
      </div>
    );
  }

  return (
    <input
      type="number"
      className="form-control"
      value={value ?? ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? "" : Number(e.target.value))
      }
      disabled={readOnly}
    />
  );
}

  if (type === "date" || type === "datetime") {
    const inputValue = type === "date" ? toInputDate(value) : toInputDateTimeLocal(value);

    return (
      <div className="date-input-wrapper">
      <input
        type={type === "datetime" ? "datetime-local" : "date"}
        className="form-control date-input"
        
        value={inputValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
      />
      <span className="date-input-icon">
        <i className="bi bi-calendar3"></i>
      </span>
    </div>
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
      multiple={!!(field as any).multiple}
      maxFiles={(field as any).maxFiles}
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
        displayValue={displayValue}
        isDisplayLoading={isDisplayLoading}
        displayIcon={displayIcon}
        displayColor={displayColor}
        filterContext={{ record: formValues, values: formValues }}
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
function toInputDateTimeLocal(value?: string) {
  if (!value) return "";

  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// Funciones relacionadas con la gestión de archivos: validación, subida, eliminación, generación de URLs, etc.
// Esta función formatea un tamaño en bytes a una cadena legible (B, KB, MB)
function formatBytes(bytes?: number) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function getExtension(filename?: string) {
  if (!filename) return "";
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() || "" : "";
}
function isMultipleFileField(field: Field) {
  return (
    (field.type === "file" || field.type === "image") &&
    !!(field as any).multiple
  );
}

function getFileDisplayInfo(
  mimeType?: string,
  filename?: string
): FileDisplayInfo {
  const mime = (mimeType || "").toLowerCase();
  const ext = getExtension(filename);

  if (mime === "application/pdf" || ext === "pdf") {
    return { icon: "📄", label: "PDF" };
  }

  if (
    mime.includes("word") ||
    mime === "application/msword" ||
    ext === "doc" ||
    ext === "docx"
  ) {
    return { icon: "📝", label: "Word" };
  }

  if (
    mime.includes("excel") ||
    mime.includes("spreadsheet") ||
    ext === "xls" ||
    ext === "xlsx" ||
    ext === "csv"
  ) {
    return { icon: "📊", label: "Excel / hoja" };
  }

  if (
    mime.includes("powerpoint") ||
    mime.includes("presentation") ||
    ext === "ppt" ||
    ext === "pptx"
  ) {
    return { icon: "📈", label: "Presentación" };
  }

  if (mime.startsWith("image/")) {
    return { icon: "🖼️", label: "Imagen" };
  }

  if (mime.startsWith("video/")) {
    return { icon: "🎬", label: "Vídeo" };
  }

  if (mime.startsWith("audio/")) {
    return { icon: "🎵", label: "Audio" };
  }

  if (
    mime.includes("zip") ||
    mime.includes("rar") ||
    mime.includes("7z") ||
    ext === "zip" ||
    ext === "rar" ||
    ext === "7z"
  ) {
    return { icon: "🗜️", label: "Comprimido" };
  }

  if (
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("text/plain") ||
    ext === "json" ||
    ext === "xml" ||
    ext === "js" ||
    ext === "ts" ||
    ext === "txt"
  ) {
    return { icon: "💻", label: "Archivo de texto / código" };
  }

  return { icon: "📎", label: "Documento" };
}
// Esta función valida un archivo seleccionado según su tipo (imagen o genérico) y devuelve un mensaje de error si no es válido, o null si es correcto

function legacyValidateSelectedFile(
  file: File,
  field: Field,
  kind: "file" | "image"
) {
  const allowedMimeTypes = field.allowedMimeTypes || [];

  if (allowedMimeTypes.length > 0) {
    if (!allowedMimeTypes.includes(file.type)) {
      return `Tipo de archivo no permitido: ${file.type || "desconocido"}`;
    }
  } else if (kind === "image") {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      return "Formato de imagen no permitido. Usa JPG, PNG, WEBP o GIF.";
    }
  }

  if (kind === "image") {
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
function legacyBuildPublicSupabaseUrl(bucket: string, path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !bucket || !path) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

// Esta función se encarga de eliminar un archivo almacenado dado su bucket y path
async function legacyDeleteStoredFile(fileValue?: UploadedFileValue | null) {
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
// Esta función se encarga de obtener una URL firmada para un archivo privado, dado su bucket y path
async function legacyGetSignedFileUrl(bucket: string, path: string, expiresIn = 60) {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucket,
      path,
      expiresIn,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "No se pudo obtener la URL firmada");
  }

  return data.signedUrl as string;
}
function legacyGetAllowedTypesHint(field: Field, isImage: boolean) {
  if (field.allowedMimeTypes?.length) {
    return `Tipos permitidos: ${field.allowedMimeTypes.join(", ")}.`;
  }

  if (isImage) {
    return "Formatos: JPG, PNG, WEBP, GIF.";
  }

  return "";
}
function legacyGetAcceptValue(field: Field, isImage: boolean) {
  const allowedMimeTypes = field.allowedMimeTypes || [];

  if (allowedMimeTypes.length > 0) {
    return allowedMimeTypes.join(",");
  }

  if (isImage) {
    return ALLOWED_IMAGE_MIME_TYPES.join(",");
  }

  return undefined;
}

// Esta función se encarga de subir un solo archivo al backend y obtener su URL
async function legacyUploadSingleFile(
  file: File,
  kind: "file" | "image",
  folder = "general",
  allowedMimeTypes: string[] = []
): Promise<UploadedFileValue> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);
  formData.append("folder", folder);
  formData.append("allowedMimeTypes", JSON.stringify(allowedMimeTypes));

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
