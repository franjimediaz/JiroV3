export function appendDiagnosticCss(html, css) {
  const style = `<style data-pdf-diagnostic>${css}</style>`;
  return /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, match => style + match) : style + html;
}

export async function realVariants(browser, html, settings, timeout) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.route("**/*", route => settings.allowed(route.request().url()) ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load", timeout });
    await page.emulateMedia({ media: "print" });
    const prepared = await page.evaluate(async () => {
      await Promise.all(Array.from(document.images, async img => { img.loading = "eager"; try { await img.decode(); } catch {} }));
      if ([...document.images].some(img => !img.complete || !img.naturalWidth)) throw new Error("Images unavailable");
      const gradients = [], layouts = [];
      function selector(element) {
        if (!element.parentElement) return element.localName;
        return selector(element.parentElement) + ">:nth-child(" + ([...element.parentElement.children].indexOf(element) + 1) + ")";
      }
      for (const element of document.querySelectorAll("*")) {
        if (/^(inline-)?(flex|grid|table)(-|$)/.test(getComputedStyle(element).display)) {
          layouts.push(`${selector(element)}{display:block!important}`);
        }
        for (const pseudo of [null, "::before", "::after"]) {
          const css = getComputedStyle(element, pseudo);
          if (/gradient\(/.test(css.backgroundImage)) gradients.push(`${selector(element)}${pseudo || ""}{background-image:none!important}`);
        }
      }
      const normalized = "<!doctype html>" + document.documentElement.outerHTML;
      for (const img of [...document.images]) {
        const box = img.getBoundingClientRect(), css = getComputedStyle(img);
        const placeholder = document.createElement("span");
        placeholder.style.cssText = `display:${css.display === "inline" ? "inline-block" : css.display};width:${box.width}px;height:${box.height}px;box-sizing:border-box;flex-shrink:${css.flexShrink};margin:${css.margin};vertical-align:${css.verticalAlign}`;
        img.replaceWith(placeholder);
      }
      document.querySelectorAll("picture source,svg image").forEach(e => e.remove());
      return { normalized, withoutImages: "<!doctype html>" + document.documentElement.outerHTML,
        gradients: gradients.join("\n"), layouts: layouts.join("\n") };
    });
    const all = "*,*::before,*::after";
    const treatments = {
      shadows: `${all}{box-shadow:none!important;text-shadow:none!important}`,
      transparency: `${all}{opacity:1!important}`, // Only element opacity, not alpha in colors/assets.
      gradients: prepared.gradients,
      backgrounds: `${all}{background:none!important}`,
      svg: "svg{visibility:hidden!important}", // Inline SVG only; preserve its box.
      fonts: `${all}{font-family:Arial,sans-serif!important}`,
      pageBreak: `${all}{break-before:auto!important;break-after:auto!important;break-inside:auto!important;page-break-before:auto!important;page-break-after:auto!important;page-break-inside:auto!important}`,
      layout: prepared.layouts,
    };
    return [
      { name: "B", html: appendDiagnosticCss(prepared.withoutImages, `${all}{background-image:none!important;list-style-image:none!important}svg{visibility:hidden!important}`) },
      { name: "C", html },
      { name: "C-normalized", html: prepared.normalized },
      ...Object.entries(treatments).map(([name, css]) => ({ name: `D-${name}`, html: appendDiagnosticCss(html, css) })),
    ];
  } finally { await context.close(); }
}
