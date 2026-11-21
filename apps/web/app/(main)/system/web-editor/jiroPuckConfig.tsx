"use client";

import { AutoField, FieldLabel, type CustomField, type Field, type Fields } from "@puckeditor/core";
import { FieldInput } from "@repo/ui";
import { webPuckConfig } from "@repo/web-puck";
import styles from "./web-editor.module.css";

const colorKeys = new Set(["background", "backgroundColor", "color", "borderColor"]);
export function jiroColorField(label: string, transparent = false): CustomField<string | undefined> {
  return { type: "custom", label, render: ({ value, onChange, readOnly }) => (
    <FieldLabel label={label}>
      <span className={styles.colorControl}>
        <FieldInput field={{ name: label, label, type: "color" }} value={value === "transparent" ? "#ffffff" : value?.match(/^#[0-9a-f]{3}$/i) ? `#${value.slice(1).split("").map(digit => digit + digit).join("")}` : value}
          readOnly={readOnly} onChange={next => { if (typeof next === "string" && /^#[0-9a-f]{6}$/i.test(next)) onChange(next); }} />
        <output>{value || "Heredado"}</output>
        <button type="button" disabled={readOnly} onClick={() => onChange(transparent ? "transparent" : undefined)}>Restablecer</button>
      </span>
    </FieldLabel>
  ) };
}

const groups = [
  ["Diseño", ["display", "flexDirection", "justifyContent", "alignItems", "flexWrap", "boxShadow"]],
  ["Dimensiones", ["width", "maxWidth", "minHeight", "borderWidth", "borderRadius"]],
  ["Espaciado", ["gap", "padding", "margin"]],
  ["Colores", ["backgroundColor", "color", "borderColor"]],
  ["Tipografía", ["fontSize", "fontWeight", "lineHeight", "textAlign"]],
] as const;

function adaptFields(fields: Fields): Fields {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => {
    if (colorKeys.has(key)) {
      return [key, jiroColorField(field.label || key, key === "background")];
    }
    if (field.type === "object") {
      const children = adaptFields(field.objectFields);
      if (key === "style") return [key, { type: "custom", label: field.label, render: ({ value, onChange, readOnly }: {value?: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void; readOnly?: boolean}) => (
        <div className={styles.propertyGroups}>{groups.map(([label, keys]) => <details key={label} open>
          <summary>{label}</summary><div className={styles.propertyGrid}>{keys.map(name => {
            const child = children[name]!;
            const input = <AutoField field={child} value={value?.[name]} readOnly={readOnly}
              onChange={next => { const updated = { ...value, [name]: next }; if (next === undefined) delete updated[name]; onChange(updated); }} />;
            return child.type === "custom" ? <div key={name}>{input}</div> : <FieldLabel key={name} label={child.label || name}>{input}</FieldLabel>;
          })}</div>
        </details>)}</div>
      ) } satisfies Field];
      return [key, { ...field, objectFields: children }];
    }
    if (field.type === "array") return [key, { ...field, arrayFields: adaptFields(field.arrayFields) }];
    return [key, field];
  }));
}

export const jiroPuckConfig: typeof webPuckConfig = {
  ...webPuckConfig,
  categories: {
    layout: { title: "Estructura", components: ["Container", "Section", "Columns", "Spacer"] },
    content: { title: "Contenido", components: ["Heading", "TextBlock", "ImageBlock", "ButtonLink"] },
    sections: { title: "Secciones", components: ["Header", "Hero"] },
  },
  components: Object.fromEntries(Object.entries(webPuckConfig.components).map(([name, component]) =>
    [name, { ...component, fields: adaptFields((component.fields || {}) as unknown as Fields) }])) as typeof webPuckConfig.components,
};
