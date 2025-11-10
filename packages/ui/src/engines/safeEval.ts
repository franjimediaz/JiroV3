/**
 * Evalúa expresiones aritméticas simples de forma acotada.
 * Soporta: + - * / () números y variables [a-zA-Z_]\w*
 */
export function safeEval(expr: string, scope: Record<string, any>) {
  if (!expr || typeof expr !== "string") return 0;

  const sanitized = expr.replace(/[^\w\d+\-*/().\s]/g, "");
  const replaced = sanitized.replace(/\b[a-zA-Z_]\w*\b/g, (v) => {
    const val = scope[v];
    if (val === undefined || val === null || val === "") return "0";
    if (typeof val === "number") return String(val);
    const parsed = Number(val);
    return Number.isFinite(parsed) ? String(parsed) : "0";
  });

  try {
    // eslint-disable-next-line no-new-func
    const fn = Function(`"use strict"; return (${replaced});`);
    const result = fn();
    return Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}
