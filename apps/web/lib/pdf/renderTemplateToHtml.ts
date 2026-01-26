// /lib/pdf/renderTemplateToHtml.ts
// Renderer “pro” con:
// - theme global (fuente, colores, header bg, tabla, zebra, bordes, márgenes)
// - estilos por bloque (color, fondo, tamaño, negrita, itálica, align, padding, borderRadius)
// - estilos por tabla (dense, zebra, headerBg override, borderColor override)
// - estilos por columna (align, width, color, bold, background, fontSize)
// - bindings: {{record.xxx}}, {{branding.xxx}}, {{now}}, {{item.xxx}} en tablas (repeat)

type AnyObj = Record<string, any>;

function getByPath(obj: any, path: string) {
  return String(path)
    .split(".")
    .reduce((acc: any, k: string) => (acc && k in acc ? acc[k] : undefined), obj);
}

function tpl(input: any, ctx: AnyObj) {
  if (typeof input !== "string") return input;
  return input.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, raw) => {
    const key = String(raw).trim();
    const val = getByPath(ctx, key);
    return val === undefined || val === null ? "" : String(val);
  });
}

function escHtml(s: any) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type BlockStyle = {
  fontSize?: number; // px
  color?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  padding?: number; // px
  borderRadius?: number; // px
  borderColor?: string;
  borderWidth?: number; // px
  borderStyle?: "solid" | "dashed" | "dotted" | "none";
};

function styleToInline(style?: BlockStyle) {
  if (!style) return "";
  const css: string[] = [];
  if (style.color) css.push(`color:${style.color}`);
  if (style.background) css.push(`background:${style.background}`);
  if (style.fontSize) css.push(`font-size:${style.fontSize}px`);
  if (style.bold) css.push(`font-weight:700`);
  if (style.italic) css.push(`font-style:italic`);
  if (style.align) css.push(`text-align:${style.align}`);
  if (style.padding !== undefined) css.push(`padding:${style.padding}px`);
  if (style.borderRadius !== undefined) css.push(`border-radius:${style.borderRadius}px`);

  const bw = style.borderWidth ?? (style.borderColor ? 1 : undefined);
  const bs = style.borderStyle ?? (style.borderColor ? "solid" : undefined);
  if (bw !== undefined && bs) css.push(`border:${bw}px ${bs} ${style.borderColor || "#e5e7eb"}`);

  return css.length ? ` style="${css.join(";")}"` : "";
}

type Theme = {
  fontFamily?: "inter" | "roboto" | "times" | "georgia";
  baseFontSize?: number;
  textColor?: string;
  primaryColor?: string;

  pageBg?: string;

  headerBg?: string;
  headerTextColor?: string;
  headerBorderColor?: string;

  table?: {
    headerBg?: string;
    headerTextColor?: string;
    borderColor?: string;
    zebra?: boolean;
    zebraBg?: string;
    dense?: boolean;
  };

  dividerColor?: string;
};

function normalizeTheme(t: any): Required<Theme> & { table: Required<NonNullable<Theme["table"]>> } {
  const theme: Theme = t && typeof t === "object" ? t : {};
  const table = theme.table && typeof theme.table === "object" ? theme.table : {};

  return {
    fontFamily: theme.fontFamily ?? "inter",
    baseFontSize: theme.baseFontSize ?? 12,
    textColor: theme.textColor ?? "#111827",
    primaryColor: theme.primaryColor ?? "#2563eb",
    pageBg: theme.pageBg ?? "#ffffff",
    headerBg: theme.headerBg ?? "transparent",
    headerTextColor: theme.headerTextColor ?? (theme.textColor ?? "#111827"),
    headerBorderColor: theme.headerBorderColor ?? "#e5e7eb",
    dividerColor: theme.dividerColor ?? "#e5e7eb",
    table: {
      headerBg: table.headerBg ?? "#f3f4f6",
      headerTextColor: table.headerTextColor ?? "#111827",
      borderColor: table.borderColor ?? "#e5e7eb",
      zebra: table.zebra ?? false,
      zebraBg: table.zebraBg ?? "#fafafa",
      dense: table.dense ?? false,
    },
  };
}

function fontStack(f: Theme["fontFamily"]) {
  switch (f) {
    case "times":
      return `"Times New Roman", Times, serif`;
    case "georgia":
      return `Georgia, "Times New Roman", serif`;
    case "roboto":
      return `Roboto, Arial, system-ui, -apple-system, Segoe UI, sans-serif`;
    case "inter":
    default:
      return `Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  }
}

type ColumnStyle = {
  align?: "left" | "center" | "right";
  width?: string; // e.g. "30%", "120px"
  color?: string;
  background?: string;
  bold?: boolean;
  fontSize?: number;
};

function colStyleToInline(style?: ColumnStyle) {
  if (!style) return "";
  const css: string[] = [];
  if (style.align) css.push(`text-align:${style.align}`);
  if (style.width) css.push(`width:${style.width}`);
  if (style.color) css.push(`color:${style.color}`);
  if (style.background) css.push(`background:${style.background}`);
  if (style.bold) css.push(`font-weight:700`);
  if (style.fontSize) css.push(`font-size:${style.fontSize}px`);
  return css.length ? ` style="${css.join(";")}"` : "";
}

type TableStyle = {
  dense?: boolean;
  zebra?: boolean;
  headerBg?: string;
  headerTextColor?: string;
  borderColor?: string;
};

function renderBlock(block: any, ctx: AnyObj, theme: ReturnType<typeof normalizeTheme>): string {
  const type = block?.type;

  if (type === "header") {
    const title = escHtml(tpl(block.title ?? "", ctx));
    const subtitle = escHtml(tpl(block.subtitle ?? "", ctx));
    const rightText = escHtml(tpl(block.rightText ?? "", ctx));

    // Header “pro”: permite fondo y estilo por bloque
    // Si no hay style.background, usa theme.headerBg (via class). Si hay, inline manda.
    return `
      <div class="hdr"${styleToInline(block.style)}>
        <div class="hdr-left">
          <div class="hdr-title">${title}</div>
          ${subtitle ? `<div class="hdr-sub">${subtitle}</div>` : ""}
        </div>
        <div class="hdr-right">${rightText}</div>
      </div>
    `;
  }

  if (type === "text") {
    const value = escHtml(tpl(block.value ?? "", ctx));
    const variant = block.variant || block.styleVariant || block.style || block.textStyle; // tolerante
    const v = typeof variant === "string" ? variant : block?.stylePreset;
    const cls =
      v === "h1"
        ? "txt-h1"
        : v === "h2"
          ? "txt-h2"
          : v === "muted"
            ? "txt-muted"
            : v === "small"
              ? "txt-small"
              : "txt-normal";

    return `<div class="txt ${cls}"${styleToInline(block.style)}>${value}</div>`;
  }

  if (type === "divider") {
    return `<hr class="div" />`;
  }

  if (type === "section") {
    const title = escHtml(tpl(block.title ?? "", ctx));
    const children = Array.isArray(block.blocks) ? block.blocks : [];
    return `
      <div class="sec"${styleToInline(block.style)}>
        ${title ? `<div class="sec-title">${title}</div>` : ""}
        <div class="sec-body">
          ${children.map((b: any) => renderBlock(b, ctx, theme)).join("")}
        </div>
      </div>
    `;
  }

  if (type === "table") {
    const title = escHtml(tpl(block.title ?? "", ctx));
    const repeatPath = String(block.repeat || "");
    const rows = (getByPath(ctx, repeatPath) as any[]) || [];
    const cols = Array.isArray(block.columns) ? block.columns : [];

    const tableStyle: TableStyle = (block.tableStyle && typeof block.tableStyle === "object") ? block.tableStyle : {};

    const dense = tableStyle.dense ?? theme.table.dense;
    const zebra = tableStyle.zebra ?? theme.table.zebra;

    const headerBg = tableStyle.headerBg ?? theme.table.headerBg;
    const headerText = tableStyle.headerTextColor ?? theme.table.headerTextColor;
    const borderColor = tableStyle.borderColor ?? theme.table.borderColor;

    const tableCls = [
      "tbl-table",
      dense ? "tbl-dense" : "",
      zebra ? "tbl-zebra" : "",
    ].filter(Boolean).join(" ");

    const thead = cols
      .map((c: any) => {
        const colStyle: ColumnStyle = (c.style && typeof c.style === "object") ? c.style : {};
        // header colors can be overridden by column style background/color
        const thInline = colStyleToInline({
          ...colStyle,
          background: colStyle.background ?? headerBg,
          color: colStyle.color ?? headerText,
        });
        const label = escHtml(tpl(c.label ?? "", ctx));
        return `<th${thInline}>${label}</th>`;
      })
      .join("");

    const tbody = rows
      .map((row: any) => {
        const rowCtx = { ...ctx, item: row };
        const tds = cols
          .map((c: any) => {
            const colStyle: ColumnStyle = (c.style && typeof c.style === "object") ? c.style : {};
            const v = escHtml(tpl(c.value ?? "", rowCtx));
            const tdInline = colStyleToInline(colStyle);
            return `<td${tdInline}>${v}</td>`;
          })
          .join("");
        return `<tr>${tds}</tr>`;
      })
      .join("");

    // borderColor se aplica a la tabla via style inline en wrapper (no reescribir CSS global)
    return `
      <div class="tbl"${styleToInline(block.style)}>
        ${title ? `<div class="tbl-title">${title}</div>` : ""}
        <div class="tbl-wrap" style="--tbl-border:${borderColor}; --tbl-headbg:${headerBg}; --tbl-headfg:${headerText};">
          <table class="${tableCls}">
            <thead><tr>${thead}</tr></thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (type === "totalsBox") {
    const rows = Array.isArray(block.rows) ? block.rows : [];
    return `
      <div class="totals"${styleToInline(block.style)}>
        ${rows
          .map((r: any) => {
            const label = escHtml(tpl(r.label ?? "", ctx));
            const value = escHtml(tpl(r.value ?? "", ctx));
            return `<div class="totals-row"><span>${label}</span><strong>${value}</strong></div>`;
          })
          .join("")}
      </div>
    `;
  }

  // fallback
  return `<div class="txt txt-muted">Bloque no soportado: ${escHtml(type)}</div>`;
}

export function renderTemplateToHtml(template: any, ctx: AnyObj) {
  const tplObj = template && typeof template === "object" ? template : {};
  const blocks = Array.isArray(tplObj?.blocks) ? tplObj.blocks : [];
  const page = tplObj?.page && typeof tplObj.page === "object" ? tplObj.page : {};
  const margin = typeof page.margin === "number" ? page.margin : 24;

  const theme = normalizeTheme(tplObj?.theme);

  const css = `
<style>
  :root{
    --page-bg:${theme.pageBg};
    --text:${theme.textColor};
    --primary:${theme.primaryColor};
    --hdr-bg:${theme.headerBg};
    --hdr-fg:${theme.headerTextColor};
    --hdr-bd:${theme.headerBorderColor};
    --div:${theme.dividerColor};
    --tbl-border:${theme.table.borderColor};
    --tbl-headbg:${theme.table.headerBg};
    --tbl-headfg:${theme.table.headerTextColor};
    --tbl-zebra:${theme.table.zebraBg};
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page-bg);
    color: var(--text);
    font-family: ${fontStack(theme.fontFamily)};
    font-size: ${theme.baseFontSize}px;
    padding: ${margin}px;
  }

  /* Header */
  .hdr {
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:16px;
    background: var(--hdr-bg);
    color: var(--hdr-fg);
    border: 1px solid var(--hdr-bd);
    padding: 12px;
    border-radius: 12px;
  }
  .hdr-title { font-size: 20px; font-weight: 700; line-height: 1.15; }
  .hdr-sub { font-size: 12px; opacity: .85; margin-top: 4px; }
  .hdr-right { font-size: 12px; opacity: .9; text-align:right; white-space: pre-wrap; }

  /* Divider */
  .div { border:0; border-top: 1px solid var(--div); margin: 14px 0; }

  /* Text */
  .txt { white-space: pre-wrap; }
  .txt-normal { font-size: ${theme.baseFontSize}px; }
  .txt-small { font-size: ${Math.max(10, theme.baseFontSize - 2)}px; }
  .txt-muted { color: #6b7280; }
  .txt-h1 { font-size: ${theme.baseFontSize + 10}px; font-weight: 800; line-height: 1.1; }
  .txt-h2 { font-size: ${theme.baseFontSize + 6}px; font-weight: 800; line-height: 1.15; }

  /* Section */
  .sec { margin-top: 14px; }
  .sec-title {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: #6b7280;
    margin-bottom: 8px;
  }
  .sec-body { display:flex; flex-direction:column; gap:8px; }

  /* Table */
  .tbl { margin-top: 10px; }
  .tbl-title { font-weight: 700; margin-bottom: 8px; }

  .tbl-wrap { width: 100%; }
  .tbl-table {
    width: 100%;
    border-collapse: collapse;
    font-size: ${Math.max(10, theme.baseFontSize - 1)}px;
  }

  .tbl-table th {
    text-align: left;
    background: var(--tbl-headbg);
    color: var(--tbl-headfg);
    padding: 8px;
    border: 1px solid var(--tbl-border);
    font-weight: 700;
  }

  .tbl-table td {
    padding: 8px;
    border: 1px solid var(--tbl-border);
    vertical-align: top;
  }

  .tbl-dense th, .tbl-dense td { padding: 6px; }

  .tbl-zebra tbody tr:nth-child(even) td {
    background: var(--tbl-zebra);
  }

  /* Totals */
  .totals {
    margin-top: 14px;
    border: 1px solid var(--tbl-border);
    border-radius: 12px;
    padding: 10px 12px;
  }
  .totals-row {
    display:flex;
    justify-content:space-between;
    gap: 16px;
    padding: 6px 0;
    border-bottom: 1px dashed var(--tbl-border);
  }
  .totals-row:last-child { border-bottom: 0; }

</style>
`;

  const body = blocks.map((b: any) => renderBlock(b, ctx, theme)).join("");

  return `<!doctype html><html><head><meta charset="utf-8">${css}</head><body>${body}</body></html>`;
}
