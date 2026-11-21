
import type { Config, Field } from "@puckeditor/core";

import {
  Container,
  Section,
  Heading,
  TextBlock,
  ImageBlock,
  ButtonLink,
  Hero,
  Spacer,
  Columns,
  Header,
} from "@repo/web-components";

import type {
  WebPuckProps,
  WebPuckRootProps,
} from "./data.js";

// =====================================================
// UTILIDADES DE CAMPOS
// =====================================================

function selectOptions(values: readonly string[]) {
  return values.map((value) => ({
    label: value,
    value,
  }));
}

const align = {
  type: "select",
  label: "Alineación",
  options: [
    { label: "Izquierda", value: "left" },
    { label: "Centro", value: "center" },
    { label: "Derecha", value: "right" },
  ],
} satisfies Field;

// =====================================================
// IMAGE BLOCK V2
// =====================================================

const imageFields = {
  // GENERAL
  src: {
    type: "text",
    label: "URL de imagen",
  },

  alt: {
    type: "text",
    label: "Texto alternativo",
  },

  href: {
    type: "text",
    label: "Enlace al hacer clic",
  },

  newTab: {
    type: "radio",
    label: "Abrir en nueva pestaña",
    options: [
      { label: "No", value: false },
      { label: "Sí", value: true },
    ],
  },

  loading: {
    type: "select",
    label: "Carga de imagen",
    options: [
      { label: "Diferida (lazy)", value: "lazy" },
      { label: "Prioritaria (eager)", value: "eager" },
    ],
  },

  // ESTILO
  fit: {
    type: "select",
    label: "Ajuste de imagen",
    options: selectOptions([
      "cover",
      "contain",
      "fill",
      "none",
      "scale-down",
    ]),
  },

  width: {
    type: "number",
    label: "Ancho (px)",
    min: 1,
    max: 8000,
  },

  height: {
    type: "number",
    label: "Alto (px)",
    min: 1,
    max: 8000,
  },

  aspectRatio: {
    type: "select",
    label: "Proporción",
    options: [
      { label: "Automática", value: "auto" },
      { label: "Cuadrada 1:1", value: "square" },
      { label: "Horizontal 4:3", value: "landscape" },
      { label: "Vertical 3:4", value: "portrait" },
      { label: "Panorámica 16:9", value: "wide" },
    ],
  },

  objectPosition: {
    type: "select",
    label: "Posición de imagen",
    options: [
      { label: "Centro", value: "center" },
      { label: "Arriba", value: "top" },
      { label: "Abajo", value: "bottom" },
      { label: "Izquierda", value: "left" },
      { label: "Derecha", value: "right" },
      { label: "Superior izquierda", value: "top-left" },
      { label: "Superior derecha", value: "top-right" },
      { label: "Inferior izquierda", value: "bottom-left" },
      { label: "Inferior derecha", value: "bottom-right" },
    ],
  },

  borderRadius: {
    type: "number",
    label: "Radio de borde (px)",
    min: 0,
    max: 200,
  },

  shadow: {
    type: "select",
    label: "Sombra",
    options: [
      { label: "Ninguna", value: "none" },
      { label: "Pequeña", value: "small" },
      { label: "Mediana", value: "medium" },
      { label: "Grande", value: "large" },
    ],
  },

  opacity: {
    type: "number",
    label: "Opacidad",
    min: 0,
    max: 1,
    step: 0.05,
  },
} as const;

// =====================================================
// BOTONES
// =====================================================

const buttonFields = {
  text: {
    type: "text",
    label: "Texto",
  },

  href: {
    type: "text",
    label: "URL",
  },

  variant: {
    type: "select",
    label: "Variante",
    options: selectOptions([
      "primary",
      "secondary",
      "outline",
    ]),
  },

  newTab: {
    type: "radio",
    label: "Nueva pestaña",
    options: [
      { label: "No", value: false },
      { label: "Sí", value: true },
    ],
  },
} as const;

// =====================================================
// ESPACIADO POR LADO
// =====================================================

const paddingSidesFields = {
  top: {
    type: "number",
    label: "Arriba (px)",
    min: 0,
    max: 200,
  },
  right: {
    type: "number",
    label: "Derecha (px)",
    min: 0,
    max: 200,
  },
  bottom: {
    type: "number",
    label: "Abajo (px)",
    min: 0,
    max: 200,
  },
  left: {
    type: "number",
    label: "Izquierda (px)",
    min: 0,
    max: 200,
  },
} as const;

const marginSidesFields = {
  top: {
    type: "number",
    label: "Arriba (px)",
    min: -200,
    max: 200,
  },
  right: {
    type: "number",
    label: "Derecha (px)",
    min: -200,
    max: 200,
  },
  bottom: {
    type: "number",
    label: "Abajo (px)",
    min: -200,
    max: 200,
  },
  left: {
    type: "number",
    label: "Izquierda (px)",
    min: -200,
    max: 200,
  },
} as const;

// =====================================================
// VISUAL STYLE V2
// =====================================================

const visualStyleFields = {
  display: {
    type: "select",
    label: "Display",
    options: selectOptions([
      "block",
      "flex",
      "grid",
      "none",
    ]),
  },

  flexDirection: {
    type: "select",
    label: "Dirección Flex",
    options: [
      { label: "Horizontal", value: "row" },
      { label: "Vertical", value: "column" },
    ],
  },

  justifyContent: {
    type: "select",
    label: "Distribución",
    options: [
      { label: "Inicio", value: "start" },
      { label: "Centro", value: "center" },
      { label: "Final", value: "end" },
      { label: "Espacio entre", value: "between" },
    ],
  },

  alignItems: {
    type: "select",
    label: "Alineación",
    options: [
      { label: "Inicio", value: "start" },
      { label: "Centro", value: "center" },
      { label: "Final", value: "end" },
      { label: "Estirar", value: "stretch" },
    ],
  },

  flexWrap: {
    type: "select",
    label: "Salto de línea",
    options: [
      { label: "Sin salto", value: "nowrap" },
      { label: "Permitir salto", value: "wrap" },
    ],
  },

  flexGrow: {
    type: "number",
    label: "Flex Grow",
    min: 0,
    max: 20,
  },

  flexShrink: {
    type: "number",
    label: "Flex Shrink",
    min: 0,
    max: 20,
  },

  flexBasis: {
    type: "number",
    label: "Flex Basis (px)",
    min: 0,
    max: 4000,
  },

  order: {
    type: "number",
    label: "Orden",
    min: -100,
    max: 100,
  },

  width: {
    type: "select",
    label: "Ancho",
    options: [
      { label: "Automático", value: "auto" },
      { label: "Completo", value: "full" },
    ],
  },

  height: {
    type: "number",
    label: "Alto (px)",
    min: 0,
    max: 4000,
  },

  minWidth: {
    type: "number",
    label: "Ancho mínimo (px)",
    min: 0,
    max: 4000,
  },

  maxWidth: {
    type: "number",
    label: "Ancho máximo (px)",
    min: 0,
    max: 4000,
  },

  minHeight: {
    type: "number",
    label: "Alto mínimo (px)",
    min: 0,
    max: 4000,
  },

  maxHeight: {
    type: "number",
    label: "Alto máximo (px)",
    min: 0,
    max: 4000,
  },

  gap: {
    type: "number",
    label: "Separación (px)",
    min: 0,
    max: 200,
  },

  padding: {
    type: "number",
    label: "Padding general (px)",
    min: 0,
    max: 200,
  },

  margin: {
    type: "number",
    label: "Margen general (px)",
    min: 0,
    max: 200,
  },

  paddingSides: {
    type: "object",
    label: "Padding por lado",
    objectFields: paddingSidesFields,
  },

  marginSides: {
    type: "object",
    label: "Margen por lado",
    objectFields: marginSidesFields,
  },

  backgroundColor: {
    type: "text",
    label: "Color de fondo HEX",
  },

  color: {
    type: "text",
    label: "Color de texto HEX",
  },

  borderWidth: {
    type: "number",
    label: "Grosor del borde (px)",
    min: 0,
    max: 20,
  },

  borderColor: {
    type: "text",
    label: "Color del borde HEX",
  },

  borderRadius: {
    type: "number",
    label: "Radio del borde (px)",
    min: 0,
    max: 100,
  },

  boxShadow: {
    type: "select",
    label: "Sombra",
    options: [
      { label: "Sin sombra", value: "none" },
      { label: "Pequeña", value: "small" },
      { label: "Mediana", value: "medium" },
      { label: "Grande", value: "large" },
    ],
  },

  fontFamily: {
    type: "select",
    label: "Familia tipográfica",
    options: [
      { label: "Heredada", value: "inherit" },
      { label: "Sans Serif", value: "sans" },
      { label: "Serif", value: "serif" },
      { label: "Monoespaciada", value: "mono" },
    ],
  },

  fontSize: {
    type: "number",
    label: "Tamaño de fuente (px)",
    min: 8,
    max: 160,
  },

  fontWeight: {
    type: "select",
    label: "Peso de fuente",
    options: [
      { label: "Normal (400)", value: 400 },
      { label: "Medio (500)", value: 500 },
      { label: "Semibold (600)", value: 600 },
      { label: "Negrita (700)", value: 700 },
    ],
  },

  lineHeight: {
    type: "number",
    label: "Interlineado",
    min: 0.8,
    max: 3,
  },

  letterSpacing: {
    type: "number",
    label: "Espaciado de letras (px)",
    min: -10,
    max: 30,
  },

  textAlign: align,

  opacity: {
    type: "number",
    label: "Opacidad (0 a 1)",
    min: 0,
    max: 1,
    step: 0.05,
  },

  overflow: {
    type: "select",
    label: "Overflow",
    options: [
      { label: "Visible", value: "visible" },
      { label: "Oculto", value: "hidden" },
      { label: "Automático", value: "auto" },
    ],
  },
} as const;

const visualStyleField = {
  type: "object",
  label: "Diseño visual",
  objectFields: visualStyleFields,
} as const;

// =====================================================
// ENLACES HEADER
// =====================================================

const headerLinkFields = {
  label: {
    type: "text",
    label: "Texto",
  },

  href: {
    type: "text",
    label: "URL",
  },
} as const;

// =====================================================
// CONFIGURACIÓN GENERAL PUCK
// =====================================================

export const webPuckConfig: Config<
  WebPuckProps,
  WebPuckRootProps
> = {
  root: {
    label: "Página",

    fields: {
      title: {
        type: "text",
        label: "Título",
      },
    },

    defaultProps: {
      title: "Página",
    },

    render: ({ children }) => (
      <Container
        as="main"
        maxWidth="full"
        padding={0}
      >
        {children}
      </Container>
    ),
  },

  components: {
    // =================================================
    // CONTAINER
    // =================================================

    Container: {
      label: "Contenedor",

      fields: {
        maxWidth: {
          type: "select",
          label: "Ancho máximo",
          options: [
            { label: "Estrecho", value: "narrow" },
            { label: "Normal", value: "default" },
            { label: "Ancho", value: "wide" },
            { label: "Completo", value: "full" },
          ],
        },

        as: {
          type: "select",
          label: "Elemento HTML",
          options: [
            { label: "Div", value: "div" },
            { label: "Main", value: "main" },
          ],
        },

        backgroundColor: {
          type: "text",
          label: "Color de fondo (HEX)",
        },

        padding: {
          type: "number",
          label: "Padding (px)",
          min: 0,
          max: 200,
        },

        borderRadius: {
          type: "number",
          label: "Bordes redondeados (px)",
          min: 0,
          max: 100,
        },

        display: {
          type: "select",
          label: "Tipo de disposición",
          options: [
            { label: "Block", value: "block" },
            { label: "Flexbox", value: "flex" },
            { label: "Grid", value: "grid" },
          ],
        },

        gap: {
          type: "number",
          label: "Separación entre elementos (px)",
          min: 0,
          max: 200,
        },

        justifyContent: {
          type: "select",
          label: "Distribución del contenido",
          options: [
            { label: "Inicio", value: "start" },
            { label: "Centro", value: "center" },
            { label: "Final", value: "end" },
            { label: "Espacio entre", value: "between" },
          ],
        },

        alignItems: {
          type: "select",
          label: "Alineación de elementos",
          options: [
            { label: "Inicio", value: "start" },
            { label: "Centro", value: "center" },
            { label: "Final", value: "end" },
            { label: "Estirar", value: "stretch" },
          ],
        },

        content: {
          type: "slot",
          label: "Contenido",
        },

        style: visualStyleField,
      },

      defaultProps: {
        maxWidth: "default",
        as: "div",
        backgroundColor: "#f8f1f1",
        padding: 0,
        borderRadius: 0,
        display: "block",
        gap: 0,
        justifyContent: "start",
        alignItems: "stretch",
        content: [],
      },

      render: ({
        content: Content,
        maxWidth,
        as,
        backgroundColor,
        padding,
        borderRadius,
        display,
        gap,
        justifyContent,
        alignItems,
        style,
      }) => (
        <Container
          maxWidth={maxWidth}
          as={as}
          backgroundColor={backgroundColor}
          padding={padding}
          borderRadius={borderRadius}
          display={display}
          gap={gap}
          justifyContent={justifyContent}
          alignItems={alignItems}
          style={style}
        >
          <Content />
        </Container>
      ),
    },

    // =================================================
    // SECTION
    // =================================================

    Section: {
      label: "Sección",

      fields: {
        background: {
          type: "text",
          label: "Color de fondo",
        },

        spacing: {
          type: "select",
          label: "Espaciado",
          options: selectOptions([
            "none",
            "small",
            "medium",
            "large",
          ]),
        },

        labelledBy: {
          type: "text",
          label: "ID del encabezado accesible",
        },

        content: {
          type: "slot",
          label: "Contenido",
        },

        style: visualStyleField,
      },

      defaultProps: {
        background: "transparent",
        spacing: "medium",
        content: [],
      },

      render: ({
        content: Content,
        background,
        spacing,
        labelledBy,
        style,
      }) => (
        <Section
          background={background}
          spacing={spacing}
          labelledBy={labelledBy}
          style={style}
        >
          <Content />
        </Section>
      ),
    },

    // =================================================
    // HEADING
    // =================================================

    Heading: {
      label: "Encabezado",

      fields: {
        text: {
          type: "text",
          label: "Texto",
        },

        align,

        level: {
          type: "select",
          label: "Nivel",
          options: [1, 2, 3, 4, 5, 6].map(
            (value) => ({
              label: `H${value}`,
              value,
            })
          ),
        },

        style: visualStyleField,
      },

      defaultProps: {
        text: "Encabezado",
        level: 2,
        align: "left",
      },

      render: ({
        text,
        level,
        align,
        id,
        style,
      }) => (
        <Heading
          text={text}
          level={level}
          align={align}
          id={id}
          style={style}
        />
      ),
    },

    // =================================================
    // TEXT BLOCK
    // =================================================

    TextBlock: {
      label: "Texto",

      fields: {
        text: {
          type: "textarea",
          label: "Contenido",
        },

        align,

        style: visualStyleField,
      },

      defaultProps: {
        text: "Escribe tu contenido aquí.",
        align: "left",
      },

      render: ({ text, align, style }) => (
        <TextBlock
          text={text}
          align={align}
          style={style}
        />
      ),
    },

    // =================================================
    // IMAGE BLOCK V2
    // =================================================

    ImageBlock: {
      label: "Imagen",

      fields: imageFields,

      defaultProps: {
        src: "/image-placeholder.svg",
        alt: "Imagen de ejemplo",
        fit: "cover",
      },

      // Las props se pasan completas, incluidas
      // las nuevas opciones de ImageBlock.
      render: (props) => (
        <ImageBlock {...props} />
      ),
    },

    // =================================================
    // BUTTON LINK
    // =================================================

    ButtonLink: {
      label: "Botón",

      fields: {
        ...buttonFields,
        style: visualStyleField,
      },

      defaultProps: {
        text: "Contacto",
        href: "/contacto",
        variant: "primary",
        newTab: false,
      },

      render: ({
        text,
        href,
        variant,
        newTab,
        style,
      }) => (
        <ButtonLink
          text={text}
          href={href}
          variant={variant}
          newTab={newTab}
          style={style}
        />
      ),
    },

    // =================================================
    // HERO V2
    // =================================================

    Hero: {
      label: "Hero",

      fields: {
        // GENERAL
        title: {
          type: "text",
          label: "Título",
        },

        subtitle: {
          type: "textarea",
          label: "Subtítulo",
        },

        image: {
          type: "object",
          label: "Imagen opcional",
          objectFields: imageFields,
        },

        button: {
          type: "object",
          label: "Botón principal",
          objectFields: buttonFields,
        },

        secondButton: {
          type: "object",
          label: "Segundo botón",
          objectFields: buttonFields,
        },

        // ESTILO
        align,

        layout: {
          type: "select",
          label: "Distribución",
          options: [
            {
              label: "Texto e imagen lateral",
              value: "split",
            },
            {
              label: "Contenido apilado",
              value: "stacked",
            },
          ],
        },

        verticalAlign: {
          type: "select",
          label: "Alineación vertical",
          options: [
            { label: "Arriba", value: "start" },
            { label: "Centro", value: "center" },
            { label: "Abajo", value: "end" },
          ],
        },

        minHeight: {
          type: "number",
          label: "Altura mínima (px)",
          min: 0,
          max: 4000,
        },

        contentMaxWidth: {
          type: "number",
          label: "Ancho máximo del contenido (px)",
          min: 0,
          max: 4000,
        },

        padding: {
          type: "number",
          label: "Padding (px)",
          min: 0,
          max: 200,
        },

        backgroundColor: {
          type: "text",
          label: "Color de fondo HEX",
        },

        backgroundImage: {
          type: "text",
          label: "URL de imagen de fondo",
        },

        overlayColor: {
          type: "text",
          label: "Color de superposición HEX",
        },

        overlayOpacity: {
          type: "number",
          label: "Opacidad de superposición",
          min: 0,
          max: 1,
          step: 0.05,
        },

        titleColor: {
          type: "text",
          label: "Color del título HEX",
        },

        subtitleColor: {
          type: "text",
          label: "Color del subtítulo HEX",
        },

        borderRadius: {
          type: "number",
          label: "Bordes redondeados (px)",
          min: 0,
          max: 200,
        },
      },

      defaultProps: {
        title: "Jiro Web Static",
        subtitle: "Tu página web estática.",
        align: "left",
      },

      render: (props) => (
        <Hero {...props} />
      ),
    },

    // =================================================
    // SPACER
    // =================================================

    Spacer: {
      label: "Espacio",

      fields: {
        size: {
          type: "select",
          label: "Altura",
          options: selectOptions([
            "none",
            "small",
            "medium",
            "large",
            "xlarge",
          ]),
        },
      },

      defaultProps: {
        size: "medium",
      },

      render: ({ size }) => (
        <Spacer size={size} />
      ),
    },

    // =================================================
    // COLUMNS
    // =================================================

    Columns: {
      label: "Columnas",

      fields: {
        columns: {
          type: "select",
          label: "Columnas",
          options: [
            { label: "Dos", value: 2 },
            { label: "Tres", value: 3 },
          ],
        },

        first: {
          type: "slot",
          label: "Columna 1",
        },

        second: {
          type: "slot",
          label: "Columna 2",
        },

        third: {
          type: "slot",
          label: "Columna 3",
        },
      },

      defaultProps: {
        columns: 2,
        first: [],
        second: [],
        third: [],
      },

      render: ({
        columns,
        first: First,
        second: Second,
        third: Third,
      }) => (
        <Columns columns={columns}>
          <First />
          <Second />
          {columns === 3 && <Third />}
        </Columns>
      ),
    },

    // =================================================
    // HEADER
    // =================================================

    Header: {
      label: "Header",

      fields: {
        brandText: {
          type: "text",
          label: "Marca",
        },

        logoSrc: {
          type: "text",
          label: "URL del logo",
        },

        logoAlt: {
          type: "text",
          label: "Texto alternativo",
        },

        homeHref: {
          type: "text",
          label: "Enlace de inicio",
        },

        links: {
          type: "array",
          label: "Navegación",
          arrayFields: headerLinkFields,
          defaultItemProps: {
            label: "Enlace",
            href: "/",
          },
          getItemSummary: (item) =>
            item.label || "Enlace",
        },

        cta: {
          type: "object",
          label: "Llamada a la acción",
          objectFields: headerLinkFields,
        },

        backgroundColor: {
          type: "text",
          label: "Color de fondo HEX",
        },

        color: {
          type: "text",
          label: "Color de texto HEX",
        },

        minHeight: {
          type: "number",
          label: "Altura mínima",
          min: 48,
          max: 200,
        },

        paddingX: {
          type: "number",
          label: "Padding horizontal",
          min: 0,
          max: 120,
        },

        paddingY: {
          type: "number",
          label: "Padding vertical",
          min: 0,
          max: 80,
        },

        maxWidth: {
          type: "number",
          label: "Ancho máximo",
          min: 320,
          max: 2400,
        },

        alignment: {
          type: "select",
          label: "Alineación",
          options: selectOptions([
            "start",
            "center",
            "end",
          ]),
        },

        sticky: {
          type: "radio",
          label: "Fijo al desplazar",
          options: [
            { label: "No", value: false },
            { label: "Sí", value: true },
          ],
        },
      },

      defaultProps: {
        brandText: "Jiro",
        homeHref: "/",
        links: [
          {
            label: "Inicio",
            href: "/",
          },
          {
            label: "Contacto",
            href: "/contacto",
          },
        ],
        cta: {
          label: "Contacto",
          href: "/contacto",
        },
        backgroundColor: "#ffffff",
        color: "#172033",
        minHeight: 72,
        paddingX: 24,
        paddingY: 12,
        maxWidth: 1200,
        alignment: "end",
        sticky: false,
      },

      render: (props) => (
        <Header {...props} />
      ),
    },
  },
};
