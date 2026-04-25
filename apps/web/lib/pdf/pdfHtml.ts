import sanitizeHtml from "sanitize-html";

type AnyObj = Record<string, any>;

const PDF_ALLOWED_TAGS = [
  "p",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "br",
  "div",
  "img",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
];

const safeCssValue = /^(?!.*(?:expression|url\s*\(|javascript:|vbscript:|data:)).{0,240}$/i;
const safeCssValues = [safeCssValue];

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&#39;", "'");
}

export function sanitizePdfHtml(html: any) {
  return sanitizeHtml(String(html ?? ""), {
    allowedTags: PDF_ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel", "title", "style"],
      img: ["src", "alt", "width", "height", "style"],
      table: ["style"],
      thead: ["style"],
      tbody: ["style"],
      tr: ["style"],
      td: ["colspan", "rowspan", "style"],
      th: ["colspan", "rowspan", "style"],
      "*": ["style", "title"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
    },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        "font-size": safeCssValues,
        "font-weight": safeCssValues,
        color: safeCssValues,
        "background-color": safeCssValues,
        background: safeCssValues,
        "text-align": safeCssValues,
        width: safeCssValues,
        height: safeCssValues,
        "max-width": safeCssValues,
        "max-height": safeCssValues,
        margin: safeCssValues,
        "margin-top": safeCssValues,
        "margin-right": safeCssValues,
        "margin-bottom": safeCssValues,
        "margin-left": safeCssValues,
        padding: safeCssValues,
        "padding-top": safeCssValues,
        "padding-right": safeCssValues,
        "padding-bottom": safeCssValues,
        "padding-left": safeCssValues,
        border: safeCssValues,
        "border-top": safeCssValues,
        "border-right": safeCssValues,
        "border-bottom": safeCssValues,
        "border-left": safeCssValues,
        display: safeCssValues,
        "vertical-align": safeCssValues,
      },
    },
    transformTags: {
      a: (tagName, attribs) =>
        sanitizeHtml.simpleTransform(tagName, {
          ...attribs,
          target: attribs.target || "_blank",
          rel: attribs.rel || "noopener noreferrer",
        })(tagName, attribs),
      img: (tagName, attribs) => {
        const src = String(attribs.src || "").trim();
        if (/^data:/i.test(src) && !/^data:image\//i.test(src)) {
          const { src: _removed, ...rest } = attribs;
          return { tagName, attribs: rest };
        }
        return { tagName, attribs };
      },
    },
  });
}

export function resolveAndSanitizePdfHtml(args: {
  input: any;
  ctx: AnyObj;
  resolveTemplate: (input: any, ctx: AnyObj) => any;
}) {
  const resolved = args.resolveTemplate(args.input ?? "", args.ctx);
  return sanitizePdfHtml(decodeHtmlEntities(String(resolved ?? "")));
}
