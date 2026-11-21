
import type {
  ComponentDataMap,
  Data,
  Slot,
} from "@puckeditor/core";

import type {
  ContainerProps,
  SectionProps,
  HeadingProps,
  TextBlockProps,
  ImageBlockProps,
  ButtonLinkProps,
  HeroProps,
  SpacerProps,
  ColumnsProps,
  HeaderProps,
} from "@repo/web-components";

import { jsonValueSchema } from "@repo/web-schema";
import { z } from "zod";

// =====================================================
// TIPOS DE COMPONENTES PUCK
// =====================================================

export type WebPuckProps = {
  Container: Omit<ContainerProps, "children"> & {
    content: Slot;
  };

  Section: Omit<SectionProps, "children" | "id"> & {
    content: Slot;
  };

  Heading: Omit<HeadingProps, "id">;
  TextBlock: TextBlockProps;
  ImageBlock: ImageBlockProps;
  ButtonLink: ButtonLinkProps;
  Hero: HeroProps;
  Spacer: SpacerProps;

  Columns: Required<Omit<ColumnsProps, "children">> & {
    first: Slot;
    second: Slot;
    third: Slot;
  };

  Header: HeaderProps;
};

export type WebPuckRootProps = {
  title?: string;
};

export type WebPuckData = Data<
  WebPuckProps,
  WebPuckRootProps
>;

type WebPuckNode = ComponentDataMap<WebPuckProps>;

// =====================================================
// VALIDADORES GENERALES
// =====================================================

const text = z.string();

const id = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.trim().length > 0 &&
      value !== "root",
    "Invalid component id"
  );

const align = z.enum([
  "left",
  "center",
  "right",
]);

const readOnly = z
  .record(z.boolean())
  .optional();

// =====================================================
// URLS SEGURAS
// =====================================================

function url(image: boolean) {
  return z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => {
        if (
          /[\u0000-\u0020\u007f\\]/u.test(value) ||
          value.startsWith("//")
        ) {
          return false;
        }

        const scheme =
          /^([a-z][a-z0-9+.-]*):/i
            .exec(value)?.[1]
            ?.toLowerCase();

        return (
          !scheme ||
          (
            image
              ? ["http", "https"]
              : ["http", "https", "mailto", "tel"]
          ).includes(scheme)
        );
      },
      "Unsafe or unsupported URL"
    );
}

// =====================================================
// VALIDADORES NUMÉRICOS
// =====================================================

const dimension = z
  .number()
  .finite()
  .min(0)
  .max(4000);

const positiveDimension = z
  .number()
  .int()
  .min(1)
  .max(8000);

const spacing = z
  .number()
  .finite()
  .min(0)
  .max(200);

const signedSpacing = z
  .number()
  .finite()
  .min(-200)
  .max(200);

const opacity = z
  .number()
  .finite()
  .min(0)
  .max(1);

const hexColor = z
  .string()
  .regex(
    /^#[0-9a-f]{6}$/i,
    "El color debe ser HEX de seis dígitos"
  );

// =====================================================
// IMAGE BLOCK V2
// =====================================================

const imageProps = z
  .object({
    // CONTENIDO
    src: url(true),
    alt: text,

    // DIMENSIONES ORIGINALES
    width: positiveDimension.optional(),
    height: positiveDimension.optional(),

    // AJUSTE ORIGINAL
    fit: z
      .enum([
        "cover",
        "contain",
        "fill",
        "none",
        "scale-down",
      ])
      .optional(),

    // NUEVA PROPORCIÓN
    aspectRatio: z
      .enum([
        "auto",
        "square",
        "landscape",
        "portrait",
        "wide",
      ])
      .optional(),

    // POSICIÓN DEL CONTENIDO
    objectPosition: z
      .enum([
        "center",
        "top",
        "bottom",
        "left",
        "right",
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ])
      .optional(),

    // APARIENCIA
    borderRadius: z
      .number()
      .finite()
      .min(0)
      .max(200)
      .optional(),

    shadow: z
      .enum([
        "none",
        "small",
        "medium",
        "large",
      ])
      .optional(),

    opacity: opacity.optional(),

    // ENLACES
    href: url(false).optional(),

    newTab: z
      .boolean()
      .optional(),

    // CARGA
    loading: z
      .enum([
        "lazy",
        "eager",
      ])
      .optional(),
  })
  .strict();

// =====================================================
// BUTTON LINK
// =====================================================

const buttonProps = z
  .object({
    text,

    href: url(false),

    variant: z
      .enum([
        "primary",
        "secondary",
        "outline",
      ])
      .optional(),

    newTab: z
      .boolean()
      .optional(),
  })
  .strict();

// =====================================================
// HERO V2
// =====================================================

const heroProps = z
  .object({
    // CONTENIDO ORIGINAL
    title: text,
    subtitle: text,

    image: imageProps.optional(),
    button: buttonProps.optional(),
    align: align.optional(),

    // DISTRIBUCIÓN
    layout: z
      .enum([
        "split",
        "stacked",
      ])
      .optional(),

    verticalAlign: z
      .enum([
        "start",
        "center",
        "end",
      ])
      .optional(),

    // DIMENSIONES
    minHeight: dimension.optional(),

    contentMaxWidth: dimension.optional(),

    padding: spacing.optional(),

    // FONDO
    backgroundColor: hexColor.optional(),

    backgroundImage: url(true).optional(),

    // OVERLAY
    overlayColor: hexColor.optional(),
    overlayOpacity: opacity.optional(),

    // TIPOGRAFÍA
    titleColor: hexColor.optional(),
    subtitleColor: hexColor.optional(),

    // SEGUNDO BOTÓN
    secondButton: buttonProps.optional(),

    // APARIENCIA
    borderRadius: z
      .number()
      .finite()
      .min(0)
      .max(200)
      .optional(),
  })
  .strict();

// =====================================================
// ESPACIADO POR LADO
// =====================================================

const spacingSidesSchema = z
  .object({
    top: spacing.optional(),
    right: spacing.optional(),
    bottom: spacing.optional(),
    left: spacing.optional(),
  })
  .strict();

const marginSidesSchema = z
  .object({
    top: signedSpacing.optional(),
    right: signedSpacing.optional(),
    bottom: signedSpacing.optional(),
    left: signedSpacing.optional(),
  })
  .strict();

// =====================================================
// ESTILOS LEGACY DEL CONTENEDOR
// =====================================================

const containerStyleProps = {
  backgroundColor: z
    .string()
    .regex(
      /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/,
      "El color debe ser HEX"
    )
    .optional(),

  padding: spacing.optional(),

  borderRadius: z
    .number()
    .min(0)
    .max(100)
    .optional(),

  display: z
    .enum([
      "block",
      "flex",
      "grid",
    ])
    .optional(),

  gap: spacing.optional(),

  justifyContent: z
    .enum([
      "start",
      "center",
      "end",
      "between",
    ])
    .optional(),

  alignItems: z
    .enum([
      "start",
      "center",
      "end",
      "stretch",
    ])
    .optional(),
};

// =====================================================
// VISUAL STYLE V2
// =====================================================

const visualStyleSchema = z
  .object({
    // DISPLAY
    display: z
      .enum(["block", "flex", "grid", "none"])
      .optional(),

    // FLEXBOX
    flexDirection: z
      .enum(["row", "column"])
      .optional(),

    justifyContent: z
      .enum([
        "start",
        "center",
        "end",
        "between",
      ])
      .optional(),

    alignItems: z
      .enum([
        "start",
        "center",
        "end",
        "stretch",
      ])
      .optional(),

    flexWrap: z
      .enum(["nowrap", "wrap"])
      .optional(),

    flexGrow: z
      .number()
      .finite()
      .min(0)
      .max(20)
      .optional(),

    flexShrink: z
      .number()
      .finite()
      .min(0)
      .max(20)
      .optional(),

    flexBasis: dimension.optional(),

    order: z
      .number()
      .int()
      .min(-100)
      .max(100)
      .optional(),

    // ESPACIADO
    gap: spacing.optional(),

    // DIMENSIONES
    width: z
      .enum(["auto", "full"])
      .optional(),

    height: dimension.optional(),
    minWidth: dimension.optional(),
    maxWidth: dimension.optional(),
    minHeight: dimension.optional(),
    maxHeight: dimension.optional(),

    // ESPACIADO ORIGINAL
    padding: spacing.optional(),
    margin: spacing.optional(),

    // ESPACIADO POR LADO
    paddingSides: spacingSidesSchema.optional(),
    marginSides: marginSidesSchema.optional(),

    // COLORES
    backgroundColor: hexColor.optional(),
    color: hexColor.optional(),

    // BORDES
    borderWidth: z
      .number()
      .finite()
      .min(0)
      .max(20)
      .optional(),

    borderColor: hexColor.optional(),

    borderRadius: z
      .number()
      .finite()
      .min(0)
      .max(100)
      .optional(),

    boxShadow: z
      .enum([
        "none",
        "small",
        "medium",
        "large",
      ])
      .optional(),

    // TIPOGRAFÍA
    fontFamily: z
      .enum([
        "inherit",
        "sans",
        "serif",
        "mono",
      ])
      .optional(),

    fontSize: z
      .number()
      .finite()
      .min(8)
      .max(160)
      .optional(),

    fontWeight: z
      .union([
        z.literal(400),
        z.literal(500),
        z.literal(600),
        z.literal(700),
      ])
      .optional(),

    lineHeight: z
      .number()
      .finite()
      .min(0.8)
      .max(3)
      .optional(),

    letterSpacing: z
      .number()
      .finite()
      .min(-10)
      .max(30)
      .optional(),

    textAlign: align.optional(),

    // COMPORTAMIENTO
    opacity: opacity.optional(),

    overflow: z
      .enum([
        "visible",
        "hidden",
        "auto",
      ])
      .optional(),
  })
  .strict()
  .superRefine((style, context) => {
    if (
      style.minWidth !== undefined &&
      style.maxWidth !== undefined &&
      style.minWidth > style.maxWidth
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minWidth"],
        message:
          "El ancho mínimo no puede superar el máximo.",
      });
    }

    if (
      style.minHeight !== undefined &&
      style.maxHeight !== undefined &&
      style.minHeight > style.maxHeight
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minHeight"],
        message:
          "El alto mínimo no puede superar el máximo.",
      });
    }
  });

// =====================================================
// HEADER
// =====================================================

const headerLinkSchema = z
  .object({
    label: text,
    href: url(false),
  })
  .strict();

// =====================================================
// ESQUEMA RECURSIVO DE COMPONENTES
// =====================================================

const nodeSchema: z.ZodType<WebPuckNode> =
  z.lazy(() =>
    z.discriminatedUnion("type", [

      // ======================================
      // CONTAINER
      // ======================================

      z.object({
        type: z.literal("Container"),
        readOnly,

        props: z.object({
          id,

          maxWidth: z
            .enum([
              "narrow",
              "default",
              "wide",
              "full",
            ])
            .optional(),

          as: z
            .enum(["div", "main"])
            .optional(),

          ...containerStyleProps,

          style: visualStyleSchema.optional(),

          content: z.array(nodeSchema),
        }).strict(),
      }).strict(),

      // ======================================
      // SECTION
      // ======================================

      z.object({
        type: z.literal("Section"),
        readOnly,

        props: z.object({
          id,

          background: text.optional(),

          spacing: z
            .enum([
              "none",
              "small",
              "medium",
              "large",
            ])
            .optional(),

          labelledBy: text.optional(),

          style: visualStyleSchema.optional(),

          content: z.array(nodeSchema),
        }).strict(),
      }).strict(),

      // ======================================
      // HEADING
      // ======================================

      z.object({
        type: z.literal("Heading"),
        readOnly,

        props: z.object({
          id,
          text,

          level: z
            .union([
              z.literal(1),
              z.literal(2),
              z.literal(3),
              z.literal(4),
              z.literal(5),
              z.literal(6),
            ])
            .optional(),

          align: align.optional(),

          style: visualStyleSchema.optional(),
        }).strict(),
      }).strict(),

      // ======================================
      // TEXT BLOCK
      // ======================================

      z.object({
        type: z.literal("TextBlock"),
        readOnly,

        props: z.object({
          id,
          text,
          align: align.optional(),
          style: visualStyleSchema.optional(),
        }).strict(),
      }).strict(),

      // ======================================
      // IMAGE BLOCK V2
      // ======================================

      z.object({
        type: z.literal("ImageBlock"),
        readOnly,

        props: imageProps
          .extend({ id })
          .strict(),
      }).strict(),

      // ======================================
      // BUTTON LINK
      // ======================================

      z.object({
        type: z.literal("ButtonLink"),
        readOnly,

        props: buttonProps
          .extend({
            id,
            style: visualStyleSchema.optional(),
          })
          .strict(),
      }).strict(),

      // ======================================
      // HEADER
      // ======================================

      z.object({
        type: z.literal("Header"),
        readOnly,

        props: z.object({
          id,

          brandText: text.optional(),
          logoSrc: url(true).optional(),
          logoAlt: text.optional(),
          homeHref: url(false).optional(),

          links: z
            .array(headerLinkSchema)
            .max(20)
            .optional(),

          cta: headerLinkSchema.optional(),

          backgroundColor: hexColor.optional(),
          color: hexColor.optional(),

          minHeight: z
            .number()
            .int()
            .min(48)
            .max(200)
            .optional(),

          paddingX: z
            .number()
            .int()
            .min(0)
            .max(120)
            .optional(),

          paddingY: z
            .number()
            .int()
            .min(0)
            .max(80)
            .optional(),

          maxWidth: z
            .number()
            .int()
            .min(320)
            .max(2400)
            .optional(),

          alignment: z
            .enum([
              "start",
              "center",
              "end",
            ])
            .optional(),

          sticky: z.boolean().optional(),
        }).strict(),
      }).strict(),

      // ======================================
      // HERO V2
      // ======================================

      z.object({
        type: z.literal("Hero"),
        readOnly,

        props: heroProps
          .extend({ id })
          .strict(),
      }).strict(),

      // ======================================
      // SPACER
      // ======================================

      z.object({
        type: z.literal("Spacer"),
        readOnly,

        props: z.object({
          id,

          size: z
            .enum([
              "none",
              "small",
              "medium",
              "large",
              "xlarge",
            ])
            .optional(),
        }).strict(),
      }).strict(),

      // ======================================
      // COLUMNS
      // ======================================

      z.object({
        type: z.literal("Columns"),
        readOnly,

        props: z.object({
          id,

          columns: z.union([
            z.literal(2),
            z.literal(3),
          ]),

          first: z.array(nodeSchema),
          second: z.array(nodeSchema),
          third: z.array(nodeSchema),
        }).strict(),
      }).strict(),
    ])
  );

// =====================================================
// VALIDACIÓN COMPLETA DE LA PÁGINA
// =====================================================

const dataSchema = jsonValueSchema
  .pipe(
    z.object({
      root: z.object({
        props: z.object({
          title: text.optional(),
        }).strict(),

        readOnly,
      }).strict(),

      content: z.array(nodeSchema),

      zones: z.object({}).strict().optional(),
    }).strict()
  )
  .superRefine((data, context) => {
    const ids = new Set<string>();

    function visit(
      nodes: WebPuckNode[],
      path: (string | number)[]
    ) {
      nodes.forEach((node, index) => {
        const location = [
          ...path,
          index,
          "props",
        ];

        if (ids.has(node.props.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Duplicate component id",
            path: [...location, "id"],
          });
        }

        ids.add(node.props.id);

        if (
          node.type === "Container" ||
          node.type === "Section"
        ) {
          visit(
            node.props.content,
            [...location, "content"]
          );
        }

        if (node.type === "Columns") {
          visit(
            node.props.first,
            [...location, "first"]
          );

          visit(
            node.props.second,
            [...location, "second"]
          );

          visit(
            node.props.third,
            [...location, "third"]
          );

          if (
            node.props.columns === 2 &&
            node.props.third.length > 0
          ) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                "Third slot must be empty for two columns",
              path: [...location, "third"],
            });
          }
        }
      });
    }

    visit(data.content, ["content"]);
  });

// =====================================================
// VALIDACIÓN PÚBLICA
// =====================================================

/**
 * Valida todos los componentes y sus slots
 * antes de guardar o publicar una página.
 */
export function validateWebPuckData(
  value: unknown
): WebPuckData {
  return dataSchema.parse(value);
}
