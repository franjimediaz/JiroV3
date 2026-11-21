
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

import type { WebPuckProps, WebPuckRootProps } from "./data.js";

// ============================================
// CAMPOS REUTILIZABLES
// ============================================

const align = {
  type: "select",
  label: "Alineación",
  options: [
    { label: "Izquierda", value: "left" },
    { label: "Centro", value: "center" },
    { label: "Derecha", value: "right" },
  ],
} satisfies Field;

const imageFields = {
  src: {
    type: "text",
    label: "URL de imagen",
  },
  alt: {
    type: "text",
    label: "Texto alternativo",
  },
  fit: {
    type: "select",
    label: "Ajuste",
    options: [
      "cover",
      "contain",
      "fill",
      "none",
      "scale-down",
    ].map((value) => ({
      label: value,
      value,
    })),
  },
  width: {
    type: "number",
    label: "Ancho",
    min: 1,
  },
  height: {
    type: "number",
    label: "Alto",
    min: 1,
  },
} as const;

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
    options: [
      "primary",
      "secondary",
      "outline",
    ].map((value) => ({
      label: value,
      value,
    })),
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

const visualStyleFields = {
  display: { type: "select", label: "Display", options: ["block", "flex"].map(value => ({ label: value, value })) },
  flexDirection: { type: "select", label: "Dirección flex", options: ["row", "column"].map(value => ({ label: value, value })) },
  justifyContent: { type: "select", label: "Distribución", options: ["start", "center", "end", "between"].map(value => ({ label: value, value })) },
  alignItems: { type: "select", label: "Alineación", options: ["start", "center", "end", "stretch"].map(value => ({ label: value, value })) },
  flexWrap: { type: "select", label: "Salto de línea", options: ["nowrap", "wrap"].map(value => ({ label: value, value })) },
  gap: { type: "number", label: "Separación (px)", min: 0, max: 200 },
  width: { type: "select", label: "Ancho", options: [{ label: "Automático", value: "auto" }, { label: "Completo", value: "full" }] },
  maxWidth: { type: "number", label: "Ancho máximo (px)", min: 0, max: 2400 },
  minHeight: { type: "number", label: "Altura mínima (px)", min: 0, max: 2000 },
  padding: { type: "number", label: "Padding (px)", min: 0, max: 200 },
  margin: { type: "number", label: "Margen (px)", min: 0, max: 200 },
  backgroundColor: { type: "text", label: "Color de fondo HEX" }, color: { type: "text", label: "Color de texto HEX" },
  borderWidth: { type: "number", label: "Grosor de borde (px)", min: 0, max: 20 }, borderColor: { type: "text", label: "Color de borde HEX" },
  borderRadius: { type: "number", label: "Radio (px)", min: 0, max: 100 },
  boxShadow: { type: "select", label: "Sombra", options: ["none", "small", "medium", "large"].map(value => ({ label: value, value })) },
  fontSize: { type: "number", label: "Tamaño de fuente (px)", min: 8, max: 160 },
  fontWeight: { type: "select", label: "Peso", options: [400, 500, 600, 700].map(value => ({ label: String(value), value })) },
  lineHeight: { type: "number", label: "Interlineado", min: 0.8, max: 3 }, textAlign: align,
} as const;
const visualStyleField = { type: "object", label: "Diseño visual", objectFields: visualStyleFields } as const;
const headerLinkFields = { label: { type: "text", label: "Texto" }, href: { type: "text", label: "URL" } } as const;

// ============================================
// CONFIGURACIÓN GENERAL DE PUCK
// ============================================

export const webPuckConfig: Config<
  WebPuckProps,
  WebPuckRootProps
> = {
  // ==========================================
  // PÁGINA RAÍZ
  // ==========================================

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
      <Container as="main" maxWidth="full" padding={0}>
        {children}
      </Container>
    ),
  },

  // ==========================================
  // COMPONENTES DISPONIBLES
  // ==========================================

  components: {
    // ========================================
    // CONTENEDOR CON ESTILOS EDITABLES
    // ========================================

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

    // ========================================
    // SECCIÓN
    // ========================================

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
          options: [
            "none",
            "small",
            "medium",
            "large",
          ].map((value) => ({
            label: value,
            value,
          })),
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

    // ========================================
    // ENCABEZADO
    // ========================================

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
        style: visualStyleField,
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

    // ========================================
    // BLOQUE DE TEXTO
    // ========================================

    TextBlock: {
      label: "Texto",

      fields: {
        text: {
          type: "textarea",
          label: "Contenido",
        },

        align,
      },

      defaultProps: {
        text: "Escribe tu contenido aquí.",
        align: "left",
      },

      render: ({ text, align, style }) => (
        <TextBlock text={text} align={align} style={style} />
      ),
    },

    // ========================================
    // IMAGEN
    // ========================================

    ImageBlock: {
      label: "Imagen",

      fields: imageFields,

      defaultProps: {
        src: "/image-placeholder.svg",
        alt: "Imagen de ejemplo",
        fit: "cover",
      },

      render: ({
        src,
        alt,
        fit,
        width,
        height,
      }) => (
        <ImageBlock
          src={src}
          alt={alt}
          fit={fit}
          width={width}
          height={height}
        />
      ),
    },

    // ========================================
    // BOTÓN
    // ========================================

    ButtonLink: {
      label: "Botón",

      fields: { ...buttonFields, style: visualStyleField },

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

    // ========================================
    // HERO
    // ========================================

    Hero: {
      label: "Hero",

      fields: {
        title: {
          type: "text",
          label: "Título",
        },

        subtitle: {
          type: "textarea",
          label: "Subtítulo",
        },

        align,

        image: {
          type: "object",
          label: "Imagen opcional",
          objectFields: imageFields,
        },

        button: {
          type: "object",
          label: "Botón opcional",
          objectFields: buttonFields,
        },
      },

      defaultProps: {
        title: "Jiro Web Static",
        subtitle: "Tu página web estática.",
        align: "left",
      },

      render: ({
        title,
        subtitle,
        image,
        button,
        align,
      }) => (
        <Hero
          title={title}
          subtitle={subtitle}
          image={image}
          button={button}
          align={align}
        />
      ),
    },

    // ========================================
    // ESPACIADOR
    // ========================================

    Spacer: {
      label: "Espacio",

      fields: {
        size: {
          type: "select",
          label: "Altura",
          options: [
            "none",
            "small",
            "medium",
            "large",
            "xlarge",
          ].map((value) => ({
            label: value,
            value,
          })),
        },
      },

      defaultProps: {
        size: "medium",
      },

      render: ({ size }) => (
        <Spacer size={size} />
      ),
    },

    // ========================================
    // COLUMNAS
    // ========================================

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
    Header: {
      label: "Header",
      fields: {
        brandText: { type: "text", label: "Marca" }, logoSrc: { type: "text", label: "URL del logo" },
        logoAlt: { type: "text", label: "Texto alternativo" }, homeHref: { type: "text", label: "Enlace de inicio" },
        links: { type: "array", label: "Navegación", arrayFields: headerLinkFields, defaultItemProps: { label: "Enlace", href: "/" }, getItemSummary: item => item.label || "Enlace" },
        cta: { type: "object", label: "Llamada a la acción", objectFields: headerLinkFields },
        backgroundColor: { type: "text", label: "Color de fondo HEX" }, color: { type: "text", label: "Color de texto HEX" },
        minHeight: { type: "number", label: "Altura mínima", min: 48, max: 200 }, paddingX: { type: "number", label: "Padding horizontal", min: 0, max: 120 },
        paddingY: { type: "number", label: "Padding vertical", min: 0, max: 80 }, maxWidth: { type: "number", label: "Ancho máximo", min: 320, max: 2400 },
        alignment: { type: "select", label: "Alineación", options: ["start", "center", "end"].map(value => ({ label: value, value })) },
        sticky: { type: "radio", label: "Fijo al desplazar", options: [{ label: "No", value: false }, { label: "Sí", value: true }] },
      },
      defaultProps: { brandText: "Jiro", homeHref: "/", links: [{ label: "Inicio", href: "/" }, { label: "Contacto", href: "/contacto" }],
        cta: { label: "Contacto", href: "/contacto" }, backgroundColor: "#ffffff", color: "#172033", minHeight: 72,
        paddingX: 24, paddingY: 12, maxWidth: 1200, alignment: "end", sticky: false },
      render: props => <Header {...props} />,
    },
  },
};
