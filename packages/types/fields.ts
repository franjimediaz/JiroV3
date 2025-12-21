export type Compute =
  | { type: "none" }
  | {
      type: "formula";
      expr: string;               // p.ej. "cantidad * precioUnidad + totalMateriales"
      deps: string[];             // p.ej. ["cantidad","precioUnidad","totalMateriales"]
      persist: "none" | "onSave" | "always";
    }
  | {
      type: "aggregate";
      sourceTable: string;        // p.ej. "materiales"
      field: string;              // p.ej. "coste"
      op: "sum" | "avg" | "min" | "max" | "count";
      where: Array<{
        field: string;
        op: "=" | "in";
        valueFrom?: "this" | "context"; // "this" usa valores del propio formulario
        path?: string;                  // nombre del campo en "this", p.ej. "servicioId"
        value?: any;                    // valor literal cuando no usas valueFrom
      }>;
      persist: "none" | "onSave" | "always";
    };
export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "money"
  | "percent"
  | "date"
  | "datetime"
  | "boolean"
  | "select"
  | "multiselect"
  | "color"
  | "file"
  | "image"
  | "selectorTabla"
  | "formula";
 export type Appareance = "List" | "Always" | "Zoom";

export type SelectorRef = { moduleSlug: string; displayField: string };
export type FormSection = {
  id: string;
  label: string;
  description?: string;
  fields: string[]; // names de campos
};

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  // Configuración de cálculo (fórmulas o agregados)
  compute?: Compute;
  // Permitir forzar valor individualmente por registro
  allowOverride?: boolean;
  options?: string[];          // para select/multiselect
    ref?: {
    moduleSlug: string;
    multiple?: boolean;
    table?: string;            // opcional si coincide con moduleSlug
    displayField: string;
    valueField?: string;       // por defecto "id"
    filters?: Array<{ field: string; op: "=" | "!=" | ">" | "<" | "in"; value: any }>;
    sort?: { field: string; direction: "asc" | "desc" }[];
  };          // para selectorTabla
  placeholder?: string;
  help?: string;
  defaultValue?: any;
  visible?: boolean;
  readOnly?: boolean;
  list?: boolean;
  filter?: boolean;
  appareance?:Appareance;

  ui?: {
    icon?: string;
    color?: string;
    width?: "1/1" | "1/2" | "1/3" | "2/3";
    variant?: "input" | "textarea" | "currency" | "percent"|"richtext";
    placeholder?: string;
    help?: string;
  };
};
export const VALID_FIELD_TYPES: FieldType[] = [
  "text",
  "textarea",
  "number",
  "money",
  "percent",
  "date",
  "datetime",
  "boolean",
  "select",
  "multiselect",
  "color",
  "file",
  "image",
  "selectorTabla",
  "formula",
];
export const Appareance_Valid_Types: Appareance[] = [
  "List",
  "Always",
  "Zoom"
];
export type ModuleSchema = {
  db: {
    table: string;
    softDelete?: boolean;
    primaryKey?: string;
  };
  fields: Field[]; // ← aquí se usa el array de Field
  ui?: {
    icon?: string;
    color?: string;
  };
};
export type ListViewProps = {
  schema: ModuleSchema;
  data: any[];
  loading?: boolean;

  onViewRow?: (row: any) => void;
  onEditRow?: (row: any) => void;
  onDeleteRow?: (row: any) => void;
  onCreate?: () => void;
};
export type ActionMenuItem = {
  label: string;
  onClick?: () => void | Promise<void>;
  icon?: React.ReactNode;
  variant?: "danger";
  disabled?: boolean;
  hidden?: boolean;
  title?: string;
};

export type ActionMenuProps = {
  items?: (ActionMenuItem | false | null | undefined)[];
  align?: "start" | "end";
  size?: "sm" | "md";
  disabled?: boolean;
  ariaLabel?: string;
};
export type SeedNode = {
  slug: string;
  nombre: string;
  route?: string;
  tipo: "carpeta" | "tabla" | "subtabla" | "vista";
  orden?: number;
  activo?: boolean;
  props?: any;
  children?: SeedNode[];
  db?:any;
  ui?:any;
  fields?: Field[];
  formSections?: FormSection[];
 
};