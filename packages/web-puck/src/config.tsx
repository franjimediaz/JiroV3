
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
      }) => (
        <Section
          background={background}
          spacing={spacing}
          labelledBy={labelledBy}
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
      }) => (
        <Heading
          text={text}
          level={level}
          align={align}
          id={id}
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

      render: ({ text, align }) => (
        <TextBlock text={text} align={align} />
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

      fields: buttonFields,

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
      }) => (
        <ButtonLink
          text={text}
          href={href}
          variant={variant}
          newTab={newTab}
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
  },
};
