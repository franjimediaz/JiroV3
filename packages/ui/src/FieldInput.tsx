"use client";

import type { Field, FieldType } from "@repo/types";
import { IconPicker } from "./IconPicker";
import Selector from "./Selector";
import RichTextEditor from "./RichTextEditor";

type Props = {
  field: Field;
  value: any;
  onChange: (v: any) => void;
  readOnly?: boolean;
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
      <input
        type="text"
        className="form-control"
        value={value ?? ""}
        placeholder={field.placeholder || "URL de archivo (pendiente uploader)"}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
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
