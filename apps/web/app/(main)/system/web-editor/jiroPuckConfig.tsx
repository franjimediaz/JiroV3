
"use client";

import type { ReactNode } from "react";

import {
  AutoField,
  FieldLabel,
  FieldTab,
  type CustomField,
  type Field,
  type Fields,
} from "@puckeditor/core";

import { FieldInput } from "@repo/ui";
import { webPuckConfig } from "@repo/web-puck";

import styles from "./web-editor.module.css";

// =====================================================
// SELECTORES DE COLOR JIRO
// =====================================================

const colorKeys = new Set([
  "background",
  "backgroundColor",
  "color",
  "borderColor",
  "overlayColor",
  "titleColor",
  "subtitleColor",
]);

function normalizeHex(
  value?: string
): string | undefined {
  if (!value) return undefined;

  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }

  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return (
      "#" +
      value
        .slice(1)
        .split("")
        .map((digit) => digit + digit)
        .join("")
    );
  }

  return undefined;
}

export function jiroColorField(
  label: string,
  transparent = false
): CustomField<string | undefined> {
  return {
    type: "custom",
    label,

    render: ({
      value,
      onChange,
      readOnly,
    }) => (
      <FieldLabel label={label}>
        <span className={styles.colorControl}>
          <FieldInput
            field={{
              name: label,
              label,
              type: "color",
            }}
            value={
              normalizeHex(value) ?? "#ffffff"
            }
            readOnly={readOnly}
            onChange={(next) => {
              if (
                typeof next === "string" &&
                /^#[0-9a-f]{6}$/i.test(next)
              ) {
                onChange(next);
              }
            }}
          />

          <output>
            {value === "transparent"
              ? "Transparente"
              : value || "Heredado"}
          </output>

          <button
            type="button"
            disabled={readOnly}
            onClick={() =>
              onChange(
                transparent
                  ? "transparent"
                  : undefined
              )
            }
          >
            Restablecer
          </button>
        </span>
      </FieldLabel>
    ),
  };
}

// =====================================================
// GRUPOS INTERNOS DE VISUAL STYLE
// =====================================================

const styleGroups = [
  {
    label: "Diseño y disposición",
    keys: [
      "display",
      "flexDirection",
      "justifyContent",
      "alignItems",
      "flexWrap",
      "flexGrow",
      "flexShrink",
      "flexBasis",
      "order",
    ],
  },
  {
    label: "Dimensiones",
    keys: [
      "width",
      "height",
      "minWidth",
      "maxWidth",
      "minHeight",
      "maxHeight",
    ],
  },
  {
    label: "Espaciado",
    keys: [
      "gap",
      "padding",
      "margin",
      "paddingSides",
      "marginSides",
    ],
  },
  {
    label: "Colores y bordes",
    keys: [
      "backgroundColor",
      "color",
      "borderColor",
      "borderWidth",
      "borderRadius",
      "boxShadow",
    ],
  },
  {
    label: "Tipografía",
    keys: [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "textAlign",
    ],
  },
  {
    label: "Comportamiento visual",
    keys: [
      "opacity",
      "overflow",
    ],
  },
] as const;

type StyleValues = Record<string, unknown>;

function updateStyleValue(
  current: StyleValues | undefined,
  name: string,
  next: unknown
): StyleValues {
  const updated: StyleValues = {
    ...(current ?? {}),
  };

  if (next === undefined) {
    delete updated[name];
  } else {
    updated[name] = next;
  }

  return updated;
}

// =====================================================
// INSPECTOR DE ESTILOS REUTILIZABLE
// =====================================================

function StyleInspector({
  fields,
  value,
  onChange,
  readOnly,
}: {
  fields: Fields;
  value?: StyleValues;
  onChange: (value: StyleValues) => void;
  readOnly?: boolean;
}) {
  return (
    <div className={styles.propertyGroups}>
      {styleGroups.map((group) => {
        const availableKeys = group.keys.filter(
          (key) => fields[key] !== undefined
        );

        if (availableKeys.length === 0) {
          return null;
        }

        return (
          <details key={group.label} open>
            <summary>{group.label}</summary>

            <div className={styles.propertyGrid}>
              {availableKeys.map((name) => {
                const field = fields[name];

                if (!field) return null;

                const input = (
                  <AutoField
                    field={field}
                    value={value?.[name]}
                    readOnly={readOnly}
                    onChange={(next) =>
                      onChange(
                        updateStyleValue(
                          value,
                          name,
                          next
                        )
                      )
                    }
                  />
                );

                if (field.type === "custom") {
                  return (
                    <div key={name}>
                      {input}
                    </div>
                  );
                }

                return (
                  <FieldLabel
                    key={name}
                    el={
                      field.type === "object"
                        ? "div"
                        : "label"
                    }
                    label={field.label || name}
                  >
                    {input}
                  </FieldLabel>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

// =====================================================
// ADAPTADOR DE CAMPOS PUCK
// =====================================================

function adaptFields(fields: Fields): Fields {
  return Object.fromEntries(
    Object.entries(fields).map(
      ([key, field]) => {
        // ---------------------------------------------
        // COLOR
        // ---------------------------------------------

        if (colorKeys.has(key)) {
          return [
            key,
            jiroColorField(
              field.label || key,
              key === "background"
            ),
          ];
        }

        // ---------------------------------------------
        // OBJETOS
        // ---------------------------------------------

        if (field.type === "object") {
          const children = adaptFields(
            field.objectFields
          );

          if (key === "style") {
            const styleField: Field = {
              type: "custom",
              label:
                field.label || "Diseño visual",

              render: ({
                value,
                onChange,
                readOnly,
              }: {
                value?: StyleValues;
                onChange: (
                  value: StyleValues
                ) => void;
                readOnly?: boolean;
              }) => (
                <StyleInspector
                  fields={children}
                  value={value}
                  onChange={onChange}
                  readOnly={readOnly}
                />
              ),
            };

            return [key, styleField];
          }

          return [
            key,
            {
              ...field,
              objectFields: children,
            },
          ];
        }

        // ---------------------------------------------
        // ARRAYS
        // ---------------------------------------------

        if (field.type === "array") {
          return [
            key,
            {
              ...field,
              arrayFields: adaptFields(
                field.arrayFields
              ),
            },
          ];
        }

        return [key, field];
      }
    )
  );
}

// =====================================================
// CLASIFICACIÓN GENERAL / ESTILO
// =====================================================

// Propiedades visuales compartidas entre componentes.
const sharedStyleFields = new Set([
  "style",
  "align",
  "alignment",
  "background",
  "backgroundColor",
  "color",
  "borderColor",
  "borderRadius",
  "borderWidth",
  "padding",
  "paddingX",
  "paddingY",
  "spacing",
  "gap",
  "display",
  "justifyContent",
  "alignItems",
  "flexDirection",
  "maxWidth",
  "minHeight",
  "sticky",
  "fit",
  "width",
  "height",
  "size",
  "variant",
]);

// Campos visuales específicos de cada componente.
// Los campos no incluidos se muestran en General.
const componentStyleFields: Record<
  string,
  readonly string[]
> = {
  // ---------------------------------------------------
  // CONTAINER
  // ---------------------------------------------------

  Container: [
    "maxWidth",
    "backgroundColor",
    "padding",
    "borderRadius",
    "display",
    "gap",
    "justifyContent",
    "alignItems",
    "style",
  ],

  // ---------------------------------------------------
  // SECTION
  // ---------------------------------------------------

  Section: [
    "background",
    "spacing",
    "style",
  ],

  // ---------------------------------------------------
  // HEADING
  // ---------------------------------------------------

  Heading: [
    "align",
    "style",
  ],

  // ---------------------------------------------------
  // TEXT BLOCK
  // ---------------------------------------------------

  TextBlock: [
    "align",
    "style",
  ],

  // ---------------------------------------------------
  // IMAGE BLOCK V2
  // ---------------------------------------------------

  ImageBlock: [
    "fit",
    "width",
    "height",
    "aspectRatio",
    "objectPosition",
    "borderRadius",
    "shadow",
    "opacity",
  ],

  // ---------------------------------------------------
  // BUTTON LINK
  // ---------------------------------------------------

  ButtonLink: [
    "variant",
    "style",
  ],

  // ---------------------------------------------------
  // HERO V2
  // ---------------------------------------------------

  Hero: [
    "align",
    "layout",
    "verticalAlign",
    "minHeight",
    "contentMaxWidth",
    "padding",
    "backgroundColor",
    "backgroundImage",
    "overlayColor",
    "overlayOpacity",
    "titleColor",
    "subtitleColor",
    "borderRadius",
  ],

  // ---------------------------------------------------
  // SPACER
  // ---------------------------------------------------

  Spacer: [
    "size",
  ],

  // ---------------------------------------------------
  // COLUMNS
  // ---------------------------------------------------

  Columns: [
    "columns",
  ],

  // ---------------------------------------------------
  // HEADER
  // ---------------------------------------------------

  Header: [
    "backgroundColor",
    "color",
    "minHeight",
    "paddingX",
    "paddingY",
    "maxWidth",
    "alignment",
    "sticky",
  ],
};

// =====================================================
// PESTAÑAS GENERAL / ESTILO
// =====================================================

type RenderedFields = Record<
  string,
  ReactNode
>;

function renderComponentTabs(
  componentName: string,
  fields: RenderedFields
) {
  const componentStyles = new Set(
    componentStyleFields[componentName] ?? []
  );

  const generalFields: ReactNode[] = [];
  const styleFields: ReactNode[] = [];

  Object.entries(fields).forEach(
    ([name, element]) => {
      const isStyle =
        componentStyles.has(name) ||
        sharedStyleFields.has(name);

      if (isStyle) {
        styleFields.push(
          <div key={name}>{element}</div>
        );
      } else {
        generalFields.push(
          <div key={name}>{element}</div>
        );
      }
    }
  );

  return (
    <>
      <FieldTab
        label="General"
        value="general"
      >
        <div className={styles.propertyGroups}>
          {generalFields.length > 0 ? (
            generalFields
          ) : (
            <p className="text-muted small p-2">
              Este componente no tiene
              propiedades generales.
            </p>
          )}
        </div>
      </FieldTab>

      <FieldTab
        label="Estilo"
        value="style"
      >
        <div className={styles.propertyGroups}>
          {styleFields.length > 0 ? (
            styleFields
          ) : (
            <p className="text-muted small p-2">
              Este componente no tiene
              propiedades visuales.
            </p>
          )}
        </div>
      </FieldTab>
    </>
  );
}

// =====================================================
// CONFIGURACIÓN FINAL DE PUCK
// =====================================================

export const jiroPuckConfig: typeof webPuckConfig = {
  ...webPuckConfig,

  categories: {
    layout: {
      title: "Estructura",
      components: [
        "Container",
        "Section",
        "Columns",
        "Spacer",
      ],
    },

    content: {
      title: "Contenido",
      components: [
        "Heading",
        "TextBlock",
        "ImageBlock",
        "ButtonLink",
      ],
    },

    sections: {
      title: "Secciones",
      components: [
        "Header",
        "Hero",
      ],
    },
  },

  components: Object.fromEntries(
    Object.entries(
      webPuckConfig.components
    ).map(([name, component]) => [
      name,
      {
        ...component,

        // Adaptar los campos de forma recursiva:
        // colores, objetos y arrays.
        fields: adaptFields(
          (component.fields || {}) as unknown as Fields
        ),

        // Mostrar General y Estilo.
        renderFields: ({
          fields,
        }: {
          fields: RenderedFields;
        }) => renderComponentTabs(
          name,
          fields
        ),
      },
    ])
  ) as typeof webPuckConfig.components,
};
