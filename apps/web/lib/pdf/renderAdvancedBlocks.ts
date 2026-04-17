import type { PdfBusinessBlock, PdfBusinessColumn, PdfChartBlock } from "./templateExtensions";

type AnyObj = Record<string, any>;

type RenderHelpers = {
  escHtml: (value: any) => string;
  tpl: (value: any, ctx: AnyObj) => any;
  styleToInline: (style?: Record<string, any>) => string;
  renderCell: (value: any, ctx: AnyObj) => string;
};

function getByPath(source: AnyObj, path?: string) {
  if (!path) return undefined;
  return String(path)
    .split(".")
    .filter(Boolean)
    .reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), source);
}

function resolveRows(ctx: AnyObj, datasetId?: string, repeat?: string): AnyObj[] {
  if (datasetId && Array.isArray(ctx?.datasets?.[datasetId]?.rows)) {
    return ctx.datasets[datasetId].rows as AnyObj[];
  }

  const resolved = getByPath(ctx, repeat || "");
  if (Array.isArray(resolved)) return resolved;
  if (resolved && typeof resolved === "object" && Array.isArray(resolved.rows)) return resolved.rows;
  return [];
}

function renderBusinessRows(block: PdfBusinessBlock, ctx: AnyObj, helpers: RenderHelpers) {
  const rows = Array.isArray(block.rows) ? block.rows : [];
  if (!rows.length) return "";

  return `<div class="pdf-business-rows">${rows
    .map((row: AnyObj) => {
      const label = helpers.escHtml(helpers.tpl(row.label ?? "", ctx));
      const value = helpers.renderCell(row.value ?? "", ctx);
      const cls =
        row.emphasis === "strong" ? "is-strong" : row.emphasis === "muted" ? "is-muted" : "is-normal";
      return `<div class="pdf-business-row ${cls}"><span class="pdf-business-label">${label}</span><span class="pdf-business-value">${value}</span></div>`;
    })
    .join("")}</div>`;
}

function renderBusinessMetrics(block: PdfBusinessBlock, ctx: AnyObj, helpers: RenderHelpers) {
  const metrics = Array.isArray(block.metrics) ? block.metrics : [];
  if (!metrics.length) return "";

  return `<div class="pdf-kpi-grid">${metrics
    .map((metric) => {
      const label = helpers.escHtml(helpers.tpl(metric.label ?? "", ctx));
      const value = helpers.renderCell(metric.value ?? "", ctx);
      const accent = metric.accent ? ` style="border-top:3px solid ${helpers.escHtml(metric.accent)}"` : "";
      const help = metric.help ? `<div class="pdf-kpi-help">${helpers.escHtml(helpers.tpl(metric.help, ctx))}</div>` : "";
      return `<div class="pdf-kpi-card"${accent}><div class="pdf-kpi-label">${label}</div><div class="pdf-kpi-value">${value}</div>${help}</div>`;
    })
    .join("")}</div>`;
}

function renderBusinessTable(block: PdfBusinessBlock, ctx: AnyObj, helpers: RenderHelpers) {
  const columns = Array.isArray(block.columns) ? block.columns : [];
  const rows = resolveRows(ctx, block.datasetId, block.repeat);

  if (!columns.length) return "";
  if (!rows.length) return `<div class="pdf-empty">${helpers.escHtml(block.emptyText || "Sin datos.")}</div>`;

  const thead = columns.map((column) => `<th>${helpers.escHtml(column.label)}</th>`).join("");
  const tbody = rows
    .map((row) => {
      const rowCtx = { ...ctx, item: row };
      return `<tr>${columns
        .map((column) => {
          const alignClass = column.align ? ` class="is-${column.align}"` : "";
          return `<td${alignClass}>${helpers.renderCell(column.value, rowCtx)}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");

  return `<div class="pdf-table-wrap"><table class="pdf-table-advanced"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

function renderCategoryGroup(block: PdfBusinessBlock, ctx: AnyObj, helpers: RenderHelpers) {
  const rows = resolveRows(ctx, block.datasetId, block.repeat);
  const groupByField = block.groupByField || "";
  if (!groupByField || !rows.length) return `<div class="pdf-empty">${helpers.escHtml(block.emptyText || "Sin agrupaciones.")}</div>`;

  const grouped = new Map<string, AnyObj[]>();
  for (const row of rows) {
    const key = String(row?.[groupByField] ?? "");
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  return `<div class="pdf-category-groups">${Array.from(grouped.entries())
    .map(([key, items]) => {
      const summary = items.length === 1 ? "1 elemento" : `${items.length} elementos`;
      return `<div class="pdf-category-group"><div class="pdf-category-title">${helpers.escHtml(key || "Sin categoria")}</div><div class="pdf-category-count">${helpers.escHtml(summary)}</div></div>`;
    })
    .join("")}</div>`;
}

function renderComparison(block: PdfBusinessBlock, ctx: AnyObj, helpers: RenderHelpers) {
  const rows = resolveRows(ctx, block.datasetId, block.repeat);
  const labelField = block.compareLabelField || "label";
  const valueField = block.compareValueField || "value";
  if (!rows.length) return `<div class="pdf-empty">${helpers.escHtml(block.emptyText || "Sin comparativas.")}</div>`;

  return `<div class="pdf-business-rows">${rows
    .map((row: AnyObj) => {
      const label = helpers.escHtml(row?.[labelField] ?? "");
      const value = helpers.escHtml(row?.[valueField] ?? "");
      return `<div class="pdf-business-row is-normal"><span class="pdf-business-label">${label}</span><span class="pdf-business-value">${value}</span></div>`;
    })
    .join("")}</div>`;
}

function buildPalette(colors?: string[]) {
  const fallback = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];
  return Array.isArray(colors) && colors.length ? colors : fallback;
}

function renderBarOrLineChart(block: PdfChartBlock, rows: AnyObj[], helpers: RenderHelpers) {
  const height = Math.max(180, Number(block.height || 240));
  const width = 720;
  const padding = { top: 28, right: 24, bottom: 42, left: 42 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const values = rows.map((row) => Number(row?.[block.valueField] ?? 0));
  const maxValue = Math.max(...values, 1);
  const step = innerWidth / Math.max(rows.length, 1);
  const barWidth = Math.max(18, step * 0.55);
  const palette = buildPalette(block.colors);

  const bars = rows
    .map((row, index) => {
      const value = Number(row?.[block.valueField] ?? 0);
      const label = helpers.escHtml(row?.[block.labelField] ?? "");
      const x = padding.left + index * step + (step - barWidth) / 2;
      const y = padding.top + innerHeight - (value / maxValue) * innerHeight;
      const h = (value / maxValue) * innerHeight;
      const color = palette[index % palette.length];

      if (block.chartType === "line") {
        const pointX = padding.left + index * step + step / 2;
        const pointY = y;
        return {
          point: `${pointX},${pointY}`,
          node: `<g><circle cx="${pointX}" cy="${pointY}" r="4" fill="${color}" />${
            block.showValues ? `<text x="${pointX}" y="${Math.max(16, pointY - 8)}" text-anchor="middle" font-size="11" fill="#334155">${helpers.escHtml(value)}</text>` : ""
          }<text x="${pointX}" y="${height - 14}" text-anchor="middle" font-size="11" fill="#475569">${label}</text></g>`,
        };
      }

      return {
        node: `<g><rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="6" fill="${color}" />${
          block.showValues ? `<text x="${x + barWidth / 2}" y="${Math.max(16, y - 8)}" text-anchor="middle" font-size="11" fill="#334155">${helpers.escHtml(value)}</text>` : ""
        }<text x="${x + barWidth / 2}" y="${height - 14}" text-anchor="middle" font-size="11" fill="#475569">${label}</text></g>`,
      };
    });

  const axis = `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}" stroke="#94a3b8" stroke-width="1" />
    <line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${padding.left + innerWidth}" y2="${padding.top + innerHeight}" stroke="#94a3b8" stroke-width="1" />`;

  const linePath =
    block.chartType === "line"
      ? `<polyline fill="none" stroke="${palette[0]}" stroke-width="3" points="${bars.map((entry: any) => entry.point).join(" ")}" />`
      : "";

  return `<svg viewBox="0 0 ${width} ${height}" class="pdf-chart-svg" role="img" aria-label="${helpers.escHtml(block.title || "Grafico")}">
    ${axis}
    ${linePath}
    ${bars.map((entry: any) => entry.node).join("")}
  </svg>`;
}

function renderPieChart(block: PdfChartBlock, rows: AnyObj[], helpers: RenderHelpers) {
  const size = Math.max(220, Number(block.height || 260));
  const radius = size / 3.2;
  const cx = size / 2.2;
  const cy = size / 2;
  const total = rows.reduce((acc, row) => acc + Number(row?.[block.valueField] ?? 0), 0) || 1;
  const palette = buildPalette(block.colors);
  let angle = -Math.PI / 2;

  const segments = rows.map((row, index) => {
    const value = Number(row?.[block.valueField] ?? 0);
    const portion = value / total;
    const nextAngle = angle + portion * Math.PI * 2;
    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(nextAngle) * radius;
    const y2 = cy + Math.sin(nextAngle) * radius;
    const largeArc = portion > 0.5 ? 1 : 0;
    const innerRadius = block.chartType === "donut" ? radius * 0.58 : 0;
    const color = palette[index % palette.length];
    const label = helpers.escHtml(row?.[block.labelField] ?? "");

    const path =
      innerRadius > 0
        ? describeDonutArc(cx, cy, radius, innerRadius, angle, nextAngle)
        : `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    angle = nextAngle;

    return {
      color,
      label,
      value,
      path,
    };
  });

  const legend = block.showLegend !== false
    ? `<div class="pdf-chart-legend">${segments
        .map(
          (segment) =>
            `<div class="pdf-chart-legend-item"><span class="pdf-chart-legend-swatch" style="background:${segment.color}"></span><span>${segment.label}</span>${
              block.showValues ? `<strong>${helpers.escHtml(segment.value)}</strong>` : ""
            }</div>`
        )
        .join("")}</div>`
    : "";

  return `<div class="pdf-chart-pie-wrap"><svg viewBox="0 0 ${size} ${size}" class="pdf-chart-svg" role="img" aria-label="${helpers.escHtml(block.title || "Grafico")}">
    ${segments.map((segment) => `<path d="${segment.path}" fill="${segment.color}" />`).join("")}
  </svg>${legend}</div>`;
}

function describeDonutArc(cx: number, cy: number, outerRadius: number, innerRadius: number, startAngle: number, endAngle: number) {
  const outerStartX = cx + Math.cos(startAngle) * outerRadius;
  const outerStartY = cy + Math.sin(startAngle) * outerRadius;
  const outerEndX = cx + Math.cos(endAngle) * outerRadius;
  const outerEndY = cy + Math.sin(endAngle) * outerRadius;
  const innerEndX = cx + Math.cos(endAngle) * innerRadius;
  const innerEndY = cy + Math.sin(endAngle) * innerRadius;
  const innerStartX = cx + Math.cos(startAngle) * innerRadius;
  const innerStartY = cy + Math.sin(startAngle) * innerRadius;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return `M ${outerStartX} ${outerStartY}
    A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEndX} ${outerEndY}
    L ${innerEndX} ${innerEndY}
    A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartX} ${innerStartY}
    Z`;
}

export function renderAdvancedBlock(block: any, ctx: AnyObj, helpers: RenderHelpers) {
  if (block?.type === "business") {
    const typedBlock = block as PdfBusinessBlock;
    const title = typedBlock.title ? `<div class="pdf-block-title">${helpers.escHtml(helpers.tpl(typedBlock.title, ctx))}</div>` : "";
    const subtitle = typedBlock.subtitle ? `<div class="pdf-block-subtitle">${helpers.escHtml(helpers.tpl(typedBlock.subtitle, ctx))}</div>` : "";
    let body = "";

    if (typedBlock.kind === "kpi") body = renderBusinessMetrics(typedBlock, ctx, helpers);
    else if (typedBlock.kind === "lineItems" || typedBlock.kind === "dynamicTable") body = renderBusinessTable(typedBlock, ctx, helpers);
    else if (typedBlock.kind === "comparison") body = renderComparison(typedBlock, ctx, helpers);
    else if (typedBlock.kind === "categoryGroup") body = renderCategoryGroup(typedBlock, ctx, helpers);
    else body = renderBusinessRows(typedBlock, ctx, helpers);

    return `<section class="pdf-business-block pdf-business-${typedBlock.kind}"${helpers.styleToInline(typedBlock.style)}>${title}${subtitle}${body}</section>`;
  }

  if (block?.type === "chart") {
    const typedBlock = block as PdfChartBlock;
    const rows = [...resolveRows(ctx, typedBlock.datasetId, undefined)];
    const sortedRows = typedBlock.sortField
      ? rows.sort((left, right) => {
          const l = left?.[typedBlock.sortField || typedBlock.valueField];
          const r = right?.[typedBlock.sortField || typedBlock.valueField];
          if (l === r) return 0;
          if (typedBlock.sortDirection === "desc") return l > r ? -1 : 1;
          return l > r ? 1 : -1;
        })
      : rows;
    const title = typedBlock.title ? `<div class="pdf-block-title">${helpers.escHtml(helpers.tpl(typedBlock.title, ctx))}</div>` : "";
    const subtitle = typedBlock.subtitle ? `<div class="pdf-block-subtitle">${helpers.escHtml(helpers.tpl(typedBlock.subtitle, ctx))}</div>` : "";
    const body =
      typedBlock.chartType === "pie" || typedBlock.chartType === "donut"
        ? renderPieChart(typedBlock, sortedRows, helpers)
        : renderBarOrLineChart(typedBlock, sortedRows, helpers);

    return `<section class="pdf-business-block pdf-chart-block"${helpers.styleToInline(typedBlock.style)}>${title}${subtitle}${body}</section>`;
  }

  return null;
}

export const advancedBlocksCss = `
  .pdf-business-block { margin-top: 14px; border: 1px solid var(--tbl-border); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow); }
  .pdf-block-title { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .pdf-block-subtitle { font-size: 12px; color: var(--muted); margin-bottom: 10px; }
  .pdf-business-rows { display: flex; flex-direction: column; gap: 8px; }
  .pdf-business-row { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px dashed var(--tbl-border); padding-bottom: 6px; }
  .pdf-business-row:last-child { border-bottom: 0; padding-bottom: 0; }
  .pdf-business-row.is-strong .pdf-business-value { font-weight: 700; }
  .pdf-business-row.is-muted .pdf-business-value, .pdf-business-row.is-muted .pdf-business-label { color: var(--muted); }
  .pdf-business-label { font-size: 12px; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
  .pdf-business-value { text-align: right; }
  .pdf-kpi-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .pdf-kpi-card { border: 1px solid var(--tbl-border); border-radius: 12px; padding: 10px 12px; background: #fff; }
  .pdf-kpi-label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .pdf-kpi-value { margin-top: 6px; font-size: 20px; font-weight: 800; }
  .pdf-kpi-help { margin-top: 4px; font-size: 11px; color: var(--muted); }
  .pdf-table-advanced { width: 100%; border-collapse: collapse; font-size: 12px; }
  .pdf-table-advanced th, .pdf-table-advanced td { border: 1px solid var(--tbl-border); padding: 8px; vertical-align: top; }
  .pdf-table-advanced th { background: var(--tbl-headbg); color: var(--tbl-headfg); text-align: left; }
  .pdf-table-advanced td.is-right, .pdf-table-advanced th.is-right { text-align: right; }
  .pdf-table-advanced td.is-center, .pdf-table-advanced th.is-center { text-align: center; }
  .pdf-empty { color: var(--muted); font-size: 12px; }
  .pdf-chart-svg { width: 100%; height: auto; display: block; }
  .pdf-chart-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 10px; }
  .pdf-chart-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
  .pdf-chart-legend-swatch { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
  .pdf-chart-pie-wrap { display: flex; align-items: center; gap: 18px; }
  .pdf-category-groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .pdf-category-group { border: 1px solid var(--tbl-border); border-radius: 10px; padding: 10px; }
  .pdf-category-title { font-weight: 700; }
  .pdf-category-count { margin-top: 4px; font-size: 12px; color: var(--muted); }
`;
