import type { ComponentDataMap, Data, Slot } from "@puckeditor/core";
import type {
  ContainerProps, SectionProps, HeadingProps, TextBlockProps, ImageBlockProps,
  ButtonLinkProps, HeroProps, SpacerProps, ColumnsProps,
} from "@repo/web-components";
import { jsonValueSchema } from "@repo/web-schema";
import { z } from "zod";

export type WebPuckProps = {
  Container: Omit<ContainerProps, "children"> & { content: Slot };
  Section: Omit<SectionProps, "children" | "id"> & { content: Slot };
  Heading: Omit<HeadingProps, "id">;
  TextBlock: TextBlockProps;
  ImageBlock: ImageBlockProps;
  ButtonLink: ButtonLinkProps;
  Hero: HeroProps;
  Spacer: SpacerProps;
  Columns: Required<Omit<ColumnsProps, "children">> & { first: Slot; second: Slot; third: Slot };
};
export type WebPuckRootProps = { title?: string };
export type WebPuckData = Data<WebPuckProps, WebPuckRootProps>;
type WebPuckNode = ComponentDataMap<WebPuckProps>;

const text = z.string();
const id = z.string().min(1).refine((value) => value.trim().length > 0 && value !== "root", "Invalid component id");
const align = z.enum(["left", "center", "right"]);
const readOnly = z.record(z.boolean()).optional();
function url(image: boolean) {
  return z.string().trim().min(1).refine((value) => {
    if (/[\u0000-\u0020\u007f\\]/u.test(value) || value.startsWith("//")) return false;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase();
    return !scheme || (image ? ["http", "https"] : ["http", "https", "mailto", "tel"]).includes(scheme);
  }, "Unsafe or unsupported URL");
}
const imageProps = z.object({
  src: url(true), alt: text, fit: z.enum(["cover", "contain", "fill", "none", "scale-down"]).optional(),
  width: z.number().int().positive().optional(), height: z.number().int().positive().optional(),
}).strict();
const buttonProps = z.object({
  text, href: url(false), variant: z.enum(["primary", "secondary", "outline"]).optional(), newTab: z.boolean().optional(),
}).strict();

// This schema is assignable to Puck's actual recursive data type, without casting JSON to Data.
const nodeSchema: z.ZodType<WebPuckNode> = z.lazy(() => z.discriminatedUnion("type", [
  z.object({ type: z.literal("Container"), readOnly, props: z.object({
    id, maxWidth: z.enum(["narrow", "default", "wide", "full"]).optional(),
    as: z.enum(["div", "main"]).optional(), content: z.array(nodeSchema),
  }).strict() }).strict(),
  z.object({ type: z.literal("Section"), readOnly, props: z.object({
    id, background: text.optional(), spacing: z.enum(["none", "small", "medium", "large"]).optional(),
    labelledBy: text.optional(), content: z.array(nodeSchema),
  }).strict() }).strict(),
  z.object({ type: z.literal("Heading"), readOnly, props: z.object({
    id, text, level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).optional(), align: align.optional(),
  }).strict() }).strict(),
  z.object({ type: z.literal("TextBlock"), readOnly, props: z.object({ id, text, align: align.optional() }).strict() }).strict(),
  z.object({ type: z.literal("ImageBlock"), readOnly, props: imageProps.extend({ id }).strict() }).strict(),
  z.object({ type: z.literal("ButtonLink"), readOnly, props: buttonProps.extend({ id }).strict() }).strict(),
  z.object({ type: z.literal("Hero"), readOnly, props: z.object({
    id, title: text, subtitle: text, align: align.optional(), image: imageProps.optional(), button: buttonProps.optional(),
  }).strict() }).strict(),
  z.object({ type: z.literal("Spacer"), readOnly, props: z.object({
    id, size: z.enum(["none", "small", "medium", "large", "xlarge"]).optional(),
  }).strict() }).strict(),
  z.object({ type: z.literal("Columns"), readOnly, props: z.object({
    id, columns: z.union([z.literal(2), z.literal(3)]),
    first: z.array(nodeSchema), second: z.array(nodeSchema), third: z.array(nodeSchema),
  }).strict() }).strict(),
]));

const dataSchema = jsonValueSchema.pipe(z.object({
  root: z.object({ props: z.object({ title: text.optional() }).strict(), readOnly }).strict(),
  content: z.array(nodeSchema),
  // Slots replace legacy zones. Nonempty zones would otherwise be silently ignored by this config.
  zones: z.object({}).strict().optional(),
}).strict()).superRefine((data, context) => {
  const ids = new Set<string>();
  function visit(nodes: WebPuckNode[], path: (string | number)[]) {
    nodes.forEach((node, index) => {
      const location = [...path, index, "props"];
      if (ids.has(node.props.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate component id", path: [...location, "id"] });
      ids.add(node.props.id);
      if (node.type === "Container" || node.type === "Section") visit(node.props.content, [...location, "content"]);
      if (node.type === "Columns") {
        visit(node.props.first, [...location, "first"]);
        visit(node.props.second, [...location, "second"]);
        visit(node.props.third, [...location, "third"]);
        if (node.props.columns === 2 && node.props.third.length) context.addIssue({
          code: z.ZodIssueCode.custom, message: "Third slot must be empty for two columns", path: [...location, "third"],
        });
      }
    });
  }
  visit(data.content, ["content"]);
});

/** Validate every node and nested slot before passing publication data to Render. */
export function validateWebPuckData(value: unknown): WebPuckData {
  return dataSchema.parse(value);
}
