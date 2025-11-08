export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "money"
  | "date"
  | "datetime"
  | "boolean"
  | "select"
  | "multiselect"
  | "color"
  | "file"
  | "image"
  | "selectorTabla";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  list?: boolean; // visible en listados
  filter?: boolean; // filtrable
  ref?: {
    moduleSlug: string;
    displayField: string;
  };
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

export interface ModuleProps {
  db: {
    table: string;
    primaryKey?: string;
    softDelete?: boolean;
    generate?: boolean; // para indicar si se debe crear tabla física
  };
  fields: FieldConfig[];
  ui?: {
    icon?: string;
    color?: string;
    view?: "list" | "kanban" | "calendar" | "tree";
    defaultSort?: { field: string; dir: "asc" | "desc" };
  };
  permissions?: Record<
    string,
    { read: boolean; create: boolean; update: boolean; delete: boolean }
  >;
  hooks?: Partial<
    Record<
      "beforeCreate" | "afterCreate" | "beforeUpdate" | "afterUpdate",
      string
    >
  >;
  integrations?: {
    calendar?: { enabled: boolean };
    pdf?: { enabled: boolean };
  };
}
