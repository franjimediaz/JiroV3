import { validateWebPuckData, type WebPuckData } from "@repo/web-puck";

const example: WebPuckData = {
  root: { props: { title: "Página de ejemplo" } },
  content: [
    { type: "Hero", props: {
      id: "example-hero", title: "Tu próxima página comienza aquí",
      subtitle: "Edita este ejemplo con los componentes compartidos de Jiro.",
      align: "left",
    } },
    { type: "Section", props: {
      id: "example-section", spacing: "medium", content: [
        { type: "Heading", props: { id: "example-heading", text: "Una página a tu medida", level: 2, align: "left" } },
        { type: "TextBlock", props: { id: "example-text", text: "Añade componentes, cambia sus propiedades y organiza el contenido.", align: "left" } },
        { type: "Columns", props: {
          id: "example-columns", columns: 2,
          first: [{ type: "Heading", props: { id: "example-column-heading", text: "Primera columna", level: 3 } }],
          second: [{ type: "TextBlock", props: { id: "example-column-text", text: "Este contenido está dentro de un slot editable." } }],
          third: [],
        } },
        { type: "ButtonLink", props: { id: "example-button", text: "Enlace de ejemplo", href: "#", variant: "primary", newTab: false } },
      ],
    } },
  ],
};

/** Every editor/reset gets a separately validated deep copy. */
export function createEditorExample(): WebPuckData {
  return validateWebPuckData(structuredClone(example));
}

export function serializeEditorPage(value: unknown): string {
  return JSON.stringify(validateWebPuckData(withoutOptionalUndefined(value)), null, 2) + "\n";
}

// Puck's editing state can include absent optional props/readOnly as undefined.
// Omit those object properties as JSON does, but preserve invalid values so the
// shared validator still rejects them (including functions, sparse arrays and classes).
function withoutOptionalUndefined(value: unknown, ancestors = new Set<object>(), depth = 0): unknown {
  if (depth > 100) throw new Error("El contenido supera la profundidad JSON permitida.");
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new Error("El contenido contiene una referencia circular.");
  const prototype: unknown = Object.getPrototypeOf(value);
  const array = Array.isArray(value);
  if (prototype !== (array ? Array.prototype : Object.prototype) && !(prototype === null && !array)) return value;
  const keys = Reflect.ownKeys(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.some(key => typeof key !== "string" || (key !== "length" || !array) &&
    (!descriptors[key]?.enumerable || !("value" in descriptors[key]!)))) return value;
  if (array && (keys.length !== value.length + 1 || keys.some(key => key !== "length" && !/^(0|[1-9][0-9]*)$/.test(String(key))))) return value;
  ancestors.add(value);
  try {
    if (array) return value.map(item => withoutOptionalUndefined(item, ancestors, depth + 1));
    return Object.fromEntries(Object.entries(descriptors)
      .filter(([, descriptor]) => descriptor.value !== undefined)
      .map(([key, descriptor]) => [key, withoutOptionalUndefined(descriptor.value, ancestors, depth + 1)]));
  } finally {
    ancestors.delete(value);
  }
}

export function editorErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    return error.issues.slice(0, 3).map((issue: { path?: unknown[]; message?: string }) =>
      `${issue.path?.join(".") || "Página"}: ${issue.message || "Dato no válido"}`,
    ).join(" · ");
  }
  return error instanceof Error ? error.message : "No se pudieron validar los datos del editor.";
}
