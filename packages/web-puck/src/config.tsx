import type { Config, Field } from "@puckeditor/core";
import {
  Container, Section, Heading, TextBlock, ImageBlock, ButtonLink, Hero, Spacer, Columns,
} from "@repo/web-components";
import type { WebPuckProps, WebPuckRootProps } from "./data.js";

const align = { type: "select", label: "Alineación", options: [
  { label: "Izquierda", value: "left" }, { label: "Centro", value: "center" }, { label: "Derecha", value: "right" },
] } satisfies Field;
const imageFields = {
  src: { type: "text", label: "URL de imagen" }, alt: { type: "text", label: "Texto alternativo" },
  fit: { type: "select", label: "Ajuste", options: ["cover", "contain", "fill", "none", "scale-down"].map(value => ({ label: value, value })) },
  width: { type: "number", label: "Ancho", min: 1 }, height: { type: "number", label: "Alto", min: 1 },
} as const;
const buttonFields = {
  text: { type: "text", label: "Texto" }, href: { type: "text", label: "URL" },
  variant: { type: "select", label: "Variante", options: ["primary", "secondary", "outline"].map(value => ({ label: value, value })) },
  newTab: { type: "radio", label: "Nueva pestaña", options: [{ label: "No", value: false }, { label: "Sí", value: true }] },
} as const;

export const webPuckConfig: Config<WebPuckProps, WebPuckRootProps> = {
  root: {
    label: "Página", fields: { title: { type: "text", label: "Título" } }, defaultProps: { title: "Página" },
    render: ({ children }) => <Container as="main" maxWidth="wide">{children}</Container>,
  },
  components: {
    Container: {
      label: "Contenedor",
      fields: {
        maxWidth: { type: "select", label: "Ancho máximo", options: ["narrow", "default", "wide", "full"].map(value => ({ label: value, value })) },
        as: { type: "select", label: "Elemento", options: [{ label: "Div", value: "div" }, { label: "Main", value: "main" }] },
        content: { type: "slot", label: "Contenido" },
      },
      defaultProps: { maxWidth: "default", as: "div", content: [] },
      render: ({ content: Content, maxWidth, as }) => <Container maxWidth={maxWidth} as={as}><Content /></Container>,
    },
    Section: {
      label: "Sección",
      fields: {
        background: { type: "text", label: "Color de fondo" },
        spacing: { type: "select", label: "Espaciado", options: ["none", "small", "medium", "large"].map(value => ({ label: value, value })) },
        labelledBy: { type: "text", label: "ID del encabezado accesible" }, content: { type: "slot", label: "Contenido" },
      },
      defaultProps: { background: "transparent", spacing: "medium", content: [] },
      render: ({ content: Content, background, spacing, labelledBy }) => <Section background={background} spacing={spacing} labelledBy={labelledBy}><Content /></Section>,
    },
    Heading: {
      label: "Encabezado", fields: {
        text: { type: "text", label: "Texto" }, align,
        level: { type: "select", label: "Nivel", options: [1, 2, 3, 4, 5, 6].map(value => ({ label: `H${value}`, value })) },
      },
      defaultProps: { text: "Encabezado", level: 2, align: "left" },
      render: ({ text, level, align, id }) => <Heading text={text} level={level} align={align} id={id} />,
    },
    TextBlock: {
      label: "Texto", fields: { text: { type: "textarea", label: "Contenido" }, align },
      defaultProps: { text: "Escribe tu contenido aquí.", align: "left" },
      render: ({ text, align }) => <TextBlock text={text} align={align} />,
    },
    ImageBlock: {
      label: "Imagen", fields: imageFields,
      defaultProps: { src: "/image-placeholder.svg", alt: "Imagen de ejemplo", fit: "cover" },
      render: ({ src, alt, fit, width, height }) => <ImageBlock src={src} alt={alt} fit={fit} width={width} height={height} />,
    },
    ButtonLink: {
      label: "Botón", fields: buttonFields,
      defaultProps: { text: "Contacto", href: "/contacto", variant: "primary", newTab: false },
      render: ({ text, href, variant, newTab }) => <ButtonLink text={text} href={href} variant={variant} newTab={newTab} />,
    },
    Hero: {
      label: "Hero", fields: {
        title: { type: "text", label: "Título" }, subtitle: { type: "textarea", label: "Subtítulo" }, align,
        image: { type: "object", label: "Imagen opcional", objectFields: imageFields },
        button: { type: "object", label: "Botón opcional", objectFields: buttonFields },
      },
      defaultProps: { title: "Jiro Web Static", subtitle: "Tu página web estática.", align: "left" },
      render: ({ title, subtitle, image, button, align }) => <Hero title={title} subtitle={subtitle} image={image} button={button} align={align} />,
    },
    Spacer: {
      label: "Espacio", fields: { size: { type: "select", label: "Altura", options: ["none", "small", "medium", "large", "xlarge"].map(value => ({ label: value, value })) } },
      defaultProps: { size: "medium" }, render: ({ size }) => <Spacer size={size} />,
    },
    Columns: {
      label: "Columnas", fields: {
        columns: { type: "select", label: "Columnas", options: [{ label: "Dos", value: 2 }, { label: "Tres", value: 3 }] },
        first: { type: "slot", label: "Columna 1" }, second: { type: "slot", label: "Columna 2" }, third: { type: "slot", label: "Columna 3" },
      },
      defaultProps: { columns: 2, first: [], second: [], third: [] },
      render: ({ columns, first: First, second: Second, third: Third }) => <Columns columns={columns}><First /><Second />{columns === 3 && <Third />}</Columns>,
    },
  },
};
