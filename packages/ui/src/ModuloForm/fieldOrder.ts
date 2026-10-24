import { arrayMove } from "@dnd-kit/sortable";
import type { Field, FormSection, ModuleSchema } from "@repo/types";

export function reorderFields(fields: Field[], active: Field, over: Field): Field[] {
  const from = fields.indexOf(active), to = fields.indexOf(over);
  return from < 0 || to < 0 || from === to ? fields : arrayMove(fields, from, to);
}

/** Session-only identities: names can be edited or duplicated in raw schemas. */
export function createFieldIdentity() {
  const ids = new WeakMap<Field, string>();
  let next = 0;
  return (field: Field) => {
    let id = ids.get(field);
    if (!id) { id = `field-${++next}`; ids.set(field, id); }
    return id;
  };
}

export function updateSectionReferences(schema: ModuleSchema, oldName: string, newName?: string): ModuleSchema {
  if (!schema.ui || oldName === newName) return schema;
  const update = (sections: FormSection[]) => sections.map(section => ({ ...section,
    fields: section.fields.flatMap(name => name === oldName ? (newName ? [newName] : []) : [name]),
  }));
  return { ...schema, ui: { ...schema.ui,
    ...(schema.ui.formSections ? { formSections: update(schema.ui.formSections) } : {}),
    ...(schema.ui.tabs ? { tabs: schema.ui.tabs.map(tab => tab.type === "form" && Array.isArray(tab.config?.formSections)
      ? { ...tab, config: { ...tab.config, formSections: update(tab.config.formSections) } } : tab) } : {}),
  } };
}

export function duplicateField(field: Field, fields: Field[]): Field {
  const names = new Set(fields.map(item => item.name));
  const base = `${field.name || "campo"}_copy`;
  let name = base, suffix = 2;
  while (names.has(name)) name = `${base}_${suffix++}`;
  return { ...structuredClone(field), name, label: `${field.label || "Campo"} (copia)` };
}
