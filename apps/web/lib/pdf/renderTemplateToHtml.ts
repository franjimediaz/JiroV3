// /lib/pdf/renderTemplateToHtml.ts
// Renderer “pro” con:
// - theme global (fuente, colores, header bg, tabla, zebra, bordes, márgenes)
// - estilos por bloque (color, fondo, tamaño, negrita, itálica, align, padding, borderRadius)
// - estilos por tabla (dense, zebra, headerBg override, borderColor override)
// - estilos por columna (align, width, color, bold, background, fontSize)
// - bloque budgetPartidas (Partida -> tareas -> materiales)
// - bindings: {{record.xxx}}, {{branding.xxx}}, {{now}}, {{item.xxx}} en tablas (repeat)
import sanitizeHtml from "sanitize-html";

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

function toNum(v: any) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const x = Number(v.replace(",", "."));
    return Number.isFinite(x) ? x : 0;
  }
  return 0;
}

function sumField(rows: any[], field?: string) {
  if (!field) return 0;
  return (rows || []).reduce((acc, r) => acc + toNum(r?.[field]), 0);
}

function groupBy<T = any>(rows: T[], keyFn: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const r of rows || []) {
    const k = keyFn(r);
    const arr = map.get(k) || [];
    arr.push(r);
    map.set(k, arr);
  }
  return map;
}
function unescapeHtml(s: string) {
  return s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");
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

function tplRaw(input: any, ctx: AnyObj) {
  if (typeof input !== "string") return input;

  // {{{ path }}} => raw (sin escapar)
  return input.replace(/\{\{\{\s*([^}]+?)\s*\}\}\}/g, (_m, raw) => {
    const key = String(raw).trim();
    const val = getByPath(ctx, key);
    return val === undefined || val === null ? "" : String(val);
  });
}

function safeHtml(html: any) {
  return sanitizeHtml(String(html ?? ""), {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s",
      "ul", "ol", "li",
      "h1", "h2", "h3", "h4",
      "blockquote",
      "a",
      "table", "thead", "tbody", "tr", "th", "td",
      "span", "div"
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      "*": ["style"],
    },
    // opcional, recomendado:
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });
}

function renderCell(cellTpl: any, ctx: AnyObj, col: any) {
  const isRich = col?.variant === "richtext" || col?.richtext === true;

  // 1) Resolver bindings (funciona con {{...}} y también con {{{...}}} si los usas)
  // Nota: tpl() resuelve {{...}}. Si quieres también {{{...}}}, hacemos un “doble pase”.
  const resolved = tpl(tplRaw(cellTpl ?? "", ctx), ctx);

  if (true) {
    const s = String(resolved ?? "");
    const raw = unescapeHtml(String(resolved ?? ""));
  
    //return `<div style="border:1px solid red ">DEBUG: ${escHtml(s)}</div>`;
    return safeHtml(raw);
  }

  // 3) Texto normal escapado
  return escHtml(resolved);
}



/**
 * ✅ Theme ampliado SIN romper plantillas viejas:
 * - mutedColor nuevo (si no existe, cae a #6b7280)
 * - radius/sombra opcional (pro, pero safe defaults)
 */
type Theme = {
  fontFamily?: "inter" | "roboto" | "times" | "georgia";
  baseFontSize?: number;

  textColor?: string;
  mutedColor?: string; // ✅ nuevo
  primaryColor?: string;

  pageBg?: string;

  headerBg?: string;
  headerTextColor?: string;
  headerBorderColor?: string;

  dividerColor?: string;

  radius?: number; // ✅ nuevo opcional
  shadow?: "none" | "sm" | "md"; // ✅ nuevo opcional

  table?: {
    headerBg?: string;
    headerTextColor?: string;
    borderColor?: string;
    zebra?: boolean;
    zebraBg?: string;
    dense?: boolean;
  };

  // estilos para partidas
  budget?: {
    chapterBg?: string;
    chapterBorder?: string;
    taskMuted?: string;
    materialMuted?: string;
    totalBg?: string;
  };
  budgetPartidas?: {
    variants?: Record<
      string,
      {
        chapterBg?: string;
        chapterBorder?: string;
        taskMuted?: string;
        materialMuted?: string;
        totalBg?: string;

        // extras “pro” opcionales
        taskBorder?: string;
        taskBg?: string;
        taskRadius?: number;
        chapterRadius?: number;
        showTaskBox?: boolean; // si quieres tareas “en cards” o plano
      }
    >;
  };
};
function normalizeTheme(t: any): Required<Theme> & {
  table: Required<NonNullable<Theme["table"]>>;
  budget: Required<NonNullable<Theme["budget"]>>;
  budgetPartidas: Required<NonNullable<Theme["budgetPartidas"]>>;
} {
  const theme: Theme = t && typeof t === "object" ? t : {};
  const table = theme.table && typeof theme.table === "object" ? theme.table : {};
  const budget = theme.budget && typeof theme.budget === "object" ? theme.budget : {};
  const bp = theme.budgetPartidas && typeof theme.budgetPartidas === "object"
  ? theme.budgetPartidas
  : {};

const variants = (bp.variants && typeof bp.variants === "object") ? bp.variants : {};

const defaultVariant = {
  chapterBg: "#f8fafc",
  chapterBorder: "#e5e7eb",
  taskMuted: "#374151",
  materialMuted: theme.mutedColor ?? "#6b7280",
  totalBg: "#f3f4f6",
  taskBorder: "#e5e7eb",
  taskBg: "#ffffff",
  taskRadius: (typeof theme.radius === "number" ? theme.radius : 12) - 2,
  chapterRadius: (typeof theme.radius === "number" ? theme.radius : 12),
  showTaskBox: true,
};

const mergedVariants: Record<string, any> = {
  classic: defaultVariant,
  compact: { ...defaultVariant, showTaskBox: false },
  boxed: { ...defaultVariant, taskBg: "#f9fafb", taskBorder: "#d1d5db" },
  minimal: { ...defaultVariant, chapterBg: "transparent", totalBg: "transparent", showTaskBox: false },
  ...variants, // el usuario puede añadir los suyos
};

  return {
    fontFamily: theme.fontFamily ?? "inter",
    baseFontSize: theme.baseFontSize ?? 12,

    textColor: theme.textColor ?? "#111827",
    mutedColor: theme.mutedColor ?? "#6b7280", // ✅
    primaryColor: theme.primaryColor ?? "#2563eb",

    pageBg: theme.pageBg ?? "#ffffff",

    headerBg: theme.headerBg ?? "transparent",
    headerTextColor: theme.headerTextColor ?? (theme.textColor ?? "#111827"),
    headerBorderColor: theme.headerBorderColor ?? "#e5e7eb",

    dividerColor: theme.dividerColor ?? "#e5e7eb",

    radius: typeof theme.radius === "number" ? theme.radius : 12, // ✅ default pro
    shadow: theme.shadow ?? "none", // ✅ default seguro

    table: {
      headerBg: table.headerBg ?? "#f3f4f6",
      headerTextColor: table.headerTextColor ?? "#111827",
      borderColor: table.borderColor ?? "#e5e7eb",
      zebra: table.zebra ?? false,
      zebraBg: table.zebraBg ?? "#fafafa",
      dense: table.dense ?? false,
    },

    budget: {
      chapterBg: budget.chapterBg ?? "#f8fafc",
      chapterBorder: budget.chapterBorder ?? "#e5e7eb",
      taskMuted: budget.taskMuted ?? "#374151",
      materialMuted: budget.materialMuted ?? (theme.mutedColor ?? "#6b7280"),
      totalBg: budget.totalBg ?? "#f3f4f6",
    },
    budgetPartidas: {
      variants: mergedVariants
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
  width?: string;
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

function renderBudgetPartidas(block: any, ctx: AnyObj, theme: ReturnType<typeof normalizeTheme>) {
  const title = escHtml(tpl(block.title ?? "", ctx));

  const tareasKey = String(block.tareasKey || "tareas");
  const groupByField = String(block.groupByField || "service");
  const groupTitleTpl = String(block.groupTitleTpl || "Partida {{groupLabel}}");

  const materialesKey = block.materialesKey ? String(block.materialesKey) : "";
  const materialesFkToTarea = String(block.materialesFkToTarea || "taskId");

  const tareaTitleTpl = String(block.tareaTitleTpl || "– {{item.nombre}}");
  const materialLineTpl = String(block.materialLineTpl || "• {{item.nombre}}");

  const tareaTotalField = block.tareaTotalField ? String(block.tareaTotalField) : "";
  const materialTotalField = block.materialTotalField ? String(block.materialTotalField) : "";
  const showSubtotals = !!block.showSubtotals;

  const tareas = (ctx?.related?.[tareasKey] as any[]) || [];
  const materiales = materialesKey ? ((ctx?.related?.[materialesKey] as any[]) || []) : [];

  // materiales por tarea
  const materialesByTarea = groupBy(materiales, (m) => String(m?.[materialesFkToTarea] ?? ""));

  // tareas por groupByField
  const tareasGrouped = groupBy(tareas, (t) => String(t?.[groupByField] ?? "Sin partida"));

  

  const o = (block.variantOverrides && typeof block.variantOverrides === "object")
    ? block.variantOverrides
    : {};




  // total general
  const totalTareas = tareaTotalField ? sumField(tareas, tareaTotalField) : 0;
  const totalMateriales = materialTotalField ? sumField(materiales, materialTotalField) : 0;
  const totalGeneral =
    (tareaTotalField ? totalTareas : 0) + (materialTotalField ? totalMateriales : 0);

  const body = Array.from(tareasGrouped.entries())
    .map(([groupValue, groupTasks]) => {
      const labelField = `${groupByField}__label`;
      const groupLabel = groupTasks?.[0]?.[labelField]
        ? String(groupTasks[0][labelField])
        : groupValue;

      const groupCtx = { ...ctx, groupValue, groupLabel };
      const chapterTitle = escHtml(tpl(groupTitleTpl, groupCtx));

      const tareasHtml = groupTasks
        .map((t: any) => {
          const tId = String(t?.id ?? "");
          const tCtx = { ...ctx, item: t };
          const tTitle = escHtml(tpl(tareaTitleTpl, tCtx));

          const mats = materialesByTarea.get(tId) || [];
          const matsHtml = mats.length
            ? `<div class="bp-mats">
                ${mats
                  .map((m: any) => {
                    const mCtx = { ...ctx, item: m };
                    const line = escHtml(tpl(materialLineTpl, mCtx));
                    return `<div class="bp-mat">${line}</div>`;
                  })
                  .join("")}
              </div>`
            : "";

          const tTotal = tareaTotalField ? toNum(t?.[tareaTotalField]) : 0;
          const tTotalHtml = tareaTotalField
          

            ? `<div class="bp-t-total">${escHtml(tTotal.toFixed(2))} €</div>`
            : "";

          return `
            <div class="bp-task">
              <div class="bp-task-head">
                <div class="bp-task-title">${tTitle}</div>
                ${tTotalHtml}
              </div>
              ${matsHtml}
            </div>
          `;
        })
        .join("");

      // subtotal grupo
      let subtotal = 0;
      if (showSubtotals) {
        if (tareaTotalField) subtotal += sumField(groupTasks, tareaTotalField);
        if (materialTotalField && materiales.length) {
          const tIds = new Set(groupTasks.map((x: any) => String(x?.id ?? "")));
          const matsForGroup = materiales.filter((m: any) =>
            tIds.has(String(m?.[materialesFkToTarea] ?? ""))
          );
          subtotal += sumField(matsForGroup, materialTotalField);
        }
      }

      const subtotalHtml =
        showSubtotals && (tareaTotalField || materialTotalField)
          ? `<div class="bp-subtotal">
               <span>Subtotal</span>
               <strong>${escHtml(subtotal.toFixed(2))} €</strong>
             </div>`
          : "";

      return `
        <div class="bp-chapter">
          <div class="bp-chapter-title">${chapterTitle}</div>
          <div class="bp-chapter-body">
            ${tareasHtml || `<div class="bp-empty">Sin tareas</div>`}
            ${subtotalHtml}
          </div>
        </div>
      `;
    })
    .join("");

  const grandTotalHtml =
    tareaTotalField || materialTotalField
      ? `<div class="bp-grand">
           <span>Total</span>
           <strong>${escHtml(totalGeneral.toFixed(2))} €</strong>
         </div>`
      : "";
  const variant = String(block.variant || "classic");

  // 1) preset base (del theme) + override (del bloque)
  const preset = (theme as any)?.budgetPartidas?.variants?.[variant]
    ?? (theme as any)?.budgetPartidas?.variants?.classic
    ?? {};

  const override =
    block.variantOverrides && typeof block.variantOverrides === "object"
      ? block.variantOverrides
      : {};

  const bpStyle = { ...preset, ...override };

  // 2) variables CSS por bloque (scoped)
  const vars = [
    bpStyle.chapterBg ? `--bp-chapter-bg:${bpStyle.chapterBg}` : "",
    bpStyle.chapterBorder ? `--bp-chapter-bd:${bpStyle.chapterBorder}` : "",
    bpStyle.taskMuted ? `--bp-task-muted:${bpStyle.taskMuted}` : "",
    bpStyle.materialMuted ? `--bp-mat-muted:${bpStyle.materialMuted}` : "",
    bpStyle.totalBg ? `--bp-total-bg:${bpStyle.totalBg}` : "",
    bpStyle.taskBorder ? `--bp-task-bd:${bpStyle.taskBorder}` : "",
    bpStyle.taskBg ? `--bp-task-bg:${bpStyle.taskBg}` : "",
    typeof bpStyle.taskRadius === "number" ? `--bp-task-r:${bpStyle.taskRadius}px` : "",
    typeof bpStyle.chapterRadius === "number" ? `--bp-chapter-r:${bpStyle.chapterRadius}px` : "",
  ]
    .filter(Boolean)
    .join(";");

  const bpInline = vars ? ` style="${vars}"` : "";

  return `
    <div class="bp bp-${escHtml(variant)}"${bpInline}${styleToInline(block.style)}>
      ${title ? `<div class="bp-title">${title}</div>` : ""}
      ${body}
      ${grandTotalHtml}
    </div>
  `;
}

function renderBlock(block: any, ctx: AnyObj, theme: ReturnType<typeof normalizeTheme>): string {
  const type = block?.type;

  if (type === "header") {
    const title = escHtml(tpl(block.title ?? "", ctx));
    const subtitle = escHtml(tpl(block.subtitle ?? "", ctx));
    const rightText = escHtml(tpl(block.rightText ?? "", ctx));
    

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
  const isRich =
    block.ui?.variant === "richtext" ||
    block.variant === "richtext" ||
    block.richtext === true;

  const resolved = tpl(tplRaw(block.value ?? "", ctx), ctx);

  if (isRich) {
    return `
      <div class="txt txt-rich"${styleToInline(block.style)}>
        <div class="rte">
          ${safeHtml(resolved)}
        </div>
      </div>
    `;
  }

  // TEXTO NORMAL (aquí sí es texto)
  const value = escHtml(resolved);
  return `
    <div class="txt txt-normal"${styleToInline(block.style)}>
      ${value}
    </div>
  `;
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
    const repeatRows = (getByPath(ctx, repeatPath) as any[]) || [];
    const cols = Array.isArray(block.columns) ? block.columns : [];

    // ✅ NUEVO: layout de tabla (ancho + align)
    const layout = block.layout && typeof block.layout === "object" ? block.layout : {};
    const widthPctRaw = layout.widthPct;
    const widthPct =
      typeof widthPctRaw === "number" && Number.isFinite(widthPctRaw)
        ? Math.min(100, Math.max(10, widthPctRaw))
        : 100;

    const align: "left" | "center" | "right" =
      layout.align === "center" || layout.align === "right" ? layout.align : "left";

    const wrapInline =
      align === "right"
        ? `style="width:${widthPct}%; margin-left:auto;"`
        : align === "center"
        ? `style="width:${widthPct}%; margin:0 auto;"`
        : `style="width:${widthPct}%;"`;

    const tableStyle: TableStyle =
      block.tableStyle && typeof block.tableStyle === "object" ? block.tableStyle : {};

    const dense = tableStyle.dense ?? theme.table.dense;
    const zebra = tableStyle.zebra ?? theme.table.zebra;

    const headerBg = tableStyle.headerBg ?? theme.table.headerBg;
    const headerText = tableStyle.headerTextColor ?? theme.table.headerTextColor;
    const borderColor = tableStyle.borderColor ?? theme.table.borderColor;

    const tableCls = ["tbl-table", dense ? "tbl-dense" : "", zebra ? "tbl-zebra" : ""]
      .filter(Boolean)
      .join(" ");

    const thead = cols
      .map((c: any) => {
        const colStyle: ColumnStyle = c.style && typeof c.style === "object" ? c.style : {};
        const thInline = colStyleToInline({
          ...colStyle,
          background: colStyle.background ?? headerBg,
          color: colStyle.color ?? headerText,
        });
        const label = escHtml(tpl(c.label ?? "", ctx));
        return `<th${thInline}>${label}</th>`;
      })
      .join("");

    // ✅ NUEVO: filas manuales
    const manualRows = Array.isArray(block.rows) ? block.rows : [];
    const hasManual = manualRows.length > 0;

    const tbody = hasManual
      ? // ---- MODO MANUAL: block.rows manda ----
        manualRows
          .map((r: any) => {
            const values: Array<string | null> = Array.isArray(r?.values) ? r.values : [];
            const tds = cols
              .map((c: any, i: number) => {
                const colStyle: ColumnStyle = c.style && typeof c.style === "object" ? c.style : {};

                // ✅ regla: si la celda es null/undefined => fallback a value de la columna
                const override = values[i];
                const cellTpl = override === null || override === undefined ? (c.value ?? "") : override;

                // En manual NO hay item, solo ctx (record/branding/now...)
                const v = renderCell(cellTpl, ctx, c);
                
                const tdInline = colStyleToInline(colStyle);
                return `<td${tdInline}>${v}</td>`;
              })
              .join("");
            return `<tr>${tds}</tr>`;
          })
          .join("")
      : 
        repeatRows
          .map((row: any) => {
            const rowCtx = { ...ctx, item: row };
            const tds = cols
              .map((c: any) => {
                const colStyle: ColumnStyle = c.style && typeof c.style === "object" ? c.style : {};
                const v = renderCell(c.value ?? "", rowCtx, c);
                const tdInline = colStyleToInline(colStyle);
                return `<td${tdInline}>${v}</td>`;
              })
              .join("");
            return `<tr>${tds}</tr>`;
          })
          .join("")

            return `
              <div class="tbl"${styleToInline(block.style)}>
                ${title ? `<div class="tbl-title">${title}</div>` : ""}
                <div class="tbl-wrap" ${wrapInline}>
                  <div style="--tbl-border:${borderColor}; --tbl-headbg:${headerBg}; --tbl-headfg:${headerText};">
                    <table class="${tableCls}">
                      <thead><tr>${thead}</tr></thead>
                      <tbody>${tbody}</tbody>
                    </table>
                  </div>
                </div>
              </div>
            `;
          }


  if (type === "budgetPartidas") {
    return renderBudgetPartidas(block, ctx, theme);
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

  return `<div class="txt txt-muted">Bloque no soportado: ${escHtml(type)}</div>`;
}

export function renderTemplateToHtml(template: any, ctx: AnyObj) {
  const tplObj = template && typeof template === "object" ? template : {};
  const blocks = Array.isArray(tplObj?.blocks) ? tplObj.blocks : [];
  const page = tplObj?.page && typeof tplObj.page === "object" ? tplObj.page : {};
  const margin = typeof page.margin === "number" ? page.margin : 24;

  const theme = normalizeTheme(tplObj?.theme);

  const shadowCss =
    theme.shadow === "sm"
      ? "0 1px 2px rgba(0,0,0,.08)"
      : theme.shadow === "md"
      ? "0 8px 20px rgba(0,0,0,.10)"
      : "none";

  const css = `
<style>
  :root{
    --page-bg:${theme.pageBg};
    --text:${theme.textColor};
    --muted:${theme.mutedColor};
    --primary:${theme.primaryColor};

    --radius:${theme.radius}px;
    --shadow:${shadowCss};

    --hdr-bg:${theme.headerBg};
    --hdr-fg:${theme.headerTextColor};
    --hdr-bd:${theme.headerBorderColor};

    --div:${theme.dividerColor};

    --tbl-border:${theme.table.borderColor};
    --tbl-headbg:${theme.table.headerBg};
    --tbl-headfg:${theme.table.headerTextColor};
    --tbl-zebra:${theme.table.zebraBg};

    --bp-chapter-bg:${theme.budget.chapterBg};
    --bp-chapter-bd:${theme.budget.chapterBorder};
    --bp-task-muted:${theme.budget.taskMuted};
    --bp-mat-muted:${theme.budget.materialMuted};
    --bp-total-bg:${theme.budget.totalBg};
    
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

  /* Links (por si metes URLs o emails) */
  a { color: var(--primary); text-decoration: none; }
  a:hover { text-decoration: underline; }

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
    border-radius: var(--radius);
    box-shadow: var(--shadow);
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
  .txt-muted { color: var(--muted); }
  .txt-h1 { font-size: ${theme.baseFontSize + 10}px; font-weight: 800; line-height: 1.1; }
  .txt-h2 { font-size: ${theme.baseFontSize + 6}px; font-weight: 800; line-height: 1.15; }
  .txt-rich { white-space: normal; }
  .txt-rich p { margin: 0 0 8px; }
  .txt-rich ul, .txt-rich ol { margin: 6px 0 6px 18px; padding: 0; }
  .txt-rich li { margin: 2px 0; }
  .txt-rich table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .txt-rich th, .txt-rich td { border: 1px solid var(--tbl-border); padding: 6px; }
  .txt-rich th { background: var(--tbl-headbg); color: var(--tbl-headfg); }

  /* Section */
  .sec { margin-top: 14px; }
  .sec-title {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .sec-body { display:flex; flex-direction:column; gap:8px; }

  .rte { white-space: normal; }

.rte p { margin: 0 0 8px; }
.rte p:last-child { margin-bottom: 0; }

.rte ul, .rte ol {
  margin: 6px 0 6px 18px;
  padding: 0;
}

.rte li { margin: 2px 0; }

.rte table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
}

.rte th, .rte td {
  border: 1px solid var(--tbl-border);
  padding: 6px;
}

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
    border-radius: var(--radius);
    padding: 10px 12px;
    box-shadow: var(--shadow);
  }
  .totals-row {
    display:flex;
    justify-content:space-between;
    gap: 16px;
    padding: 6px 0;
    border-bottom: 1px dashed var(--tbl-border);
  }
  .totals-row:last-child { border-bottom: 0; }

  /* Budget Partidas */
  /* Budget Partidas (usa variables por bloque) */
  .bp { margin-top: 12px; }
  .bp-title { font-weight: 800; margin: 2px 0 10px; font-size: ${theme.baseFontSize + 2}px; }

  .bp-chapter{
    border: 1px solid var(--bp-chapter-bd, #e5e7eb);
    border-radius: var(--bp-chapter-r, 12px);
    overflow: hidden;
    margin-bottom: 10px;
  }
  .bp-chapter-title{
    background: var(--bp-chapter-bg, #f8fafc);
    padding: 10px 12px;
    font-weight: 800;
    border-bottom: 1px solid var(--bp-chapter-bd, #e5e7eb);
  }
  .bp-chapter-body{ padding: 10px 12px; }

  .bp-task{
    padding: 8px 10px;
    border: 1px solid var(--bp-task-bd, #e5e7eb);
    background: var(--bp-task-bg, #ffffff);
    border-radius: var(--bp-task-r, 10px);
    margin-bottom: 8px;
  }

  .bp-task-head{
    display:flex;
    justify-content:space-between;
    gap: 10px;
    align-items: flex-start;
  }
  .bp-task-title{
    font-weight: 700;
    color: var(--bp-task-muted, #374151);
    white-space: pre-wrap;
  }
  .bp-t-total{ font-weight: 800; white-space: nowrap; }

  .bp-mats{
    margin-top: 6px;
    padding-left: 10px;
    border-left: 2px solid var(--tbl-border, #e5e7eb);
  }
  .bp-mat{
    color: var(--bp-mat-muted, #6b7280);
    font-size: ${Math.max(10, theme.baseFontSize - 1)}px;
    margin-top: 2px;
    white-space: pre-wrap;
  }

  .bp-empty{
    color:#6b7280;
    font-size:${Math.max(10, theme.baseFontSize - 1)}px;
    font-style: italic;
    padding: 6px 0;
  }

  .bp-subtotal{
    margin-top: 10px;
    display:flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    background: var(--bp-total-bg, #f3f4f6);
    border-radius: 10px;
    border: 1px solid var(--tbl-border, #e5e7eb);
  }

  .bp-grand{
    margin-top: 12px;
    display:flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    background: var(--bp-total-bg, #f3f4f6);
    border-radius: 12px;
    border: 1px solid var(--tbl-border, #e5e7eb);
    font-size: ${theme.baseFontSize + 1}px;
  }

  /* Variantes (opcionales, por clase) */
  .bp-compact .bp-task{
    border: 0;
    background: transparent;
    padding: 0;
    margin-bottom: 10px;
  }
  .bp-minimal .bp-chapter{
    border: 0;
    border-radius: 0;
  }
  .bp-minimal .bp-chapter-title{
    background: transparent;
    padding: 0 0 8px;
    border-bottom: 1px solid var(--tbl-border, #e5e7eb);
  }

</style>
`;

  const body = blocks.map((b: any) => renderBlock(b, ctx, theme)).join("");
  return `<!doctype html><html><head><meta charset="utf-8">${css}</head><body>${body}</body></html>`;
}
