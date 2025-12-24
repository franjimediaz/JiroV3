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
  | "iconpicker"
  | "file"
  | "image"
  | "selectorTabla"
  | "ReverseLink"
  | "formula"
  | "timestamp";
 export type Appareance = "List" | "Always" | "Zoom";

export type FormSection = {
  id: string;
  label: string;
  description?: string;
  fields: string[]; // names de campos
};
export type SelectorTablaRef = {
  moduleSlug: string;
  multiple?: boolean;
  table?: string;
  displayField: string; // obligatorio SOLO aquí
  valueField?: string;
  filters?: QueryFilter[];
  sort?: QuerySort[];
};

export type ReverseLinkRef = {
  moduleSlug: string;
  foreignKey: string;
  parentKey?: string;
  route?: string;
  limit?: number;
  sort?: QuerySort[];
  filters?: QueryFilter[];
};
export type VisibleWhen = "add" | "edit" | "add_edit";

export type BaseField = {
  name: string;
  label: string;
  required?: boolean;

  compute?: Compute;
  allowOverride?: boolean;
  options?: string[];

  placeholder?: string;
  help?: string;
  defaultValue?: any;
  visible?: boolean;
  visibleWhen?: VisibleWhen;
  readOnly?: boolean;

  list?: boolean;
  filter?: boolean;
  appareance?: Appareance;

  ui?: {
    icon?: string;
    color?: string;
    width?: "1/1" | "1/2" | "1/3" | "2/3";
    variant?: "input" | "textarea" | "currency" | "percent" | "richtext";
    placeholder?: string;
    help?: string;
  };
};

export type SelectorTablaField = BaseField & {
  type: "selectorTabla";
  ref: SelectorTablaRef; // requerido y displayField obligatorio
};

export type ReverseLinkField = BaseField & {
  type: "ReverseLink";
  ref: ReverseLinkRef; // requerido y sin displayField
};

export type OtherField = BaseField & {
  type: Exclude<FieldType, "selectorTabla" | "ReverseLink">;
  ref?: never; // opcional: evita que ref aparezca donde no toca
};

export type Field = SelectorTablaField | ReverseLinkField | OtherField;

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
  "iconpicker",
  "file",
  "image",
  "selectorTabla",
  "formula",
  "ReverseLink",
  "timestamp",
  
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
export type FilterOp = "=" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "contains";

export type QueryFilter = {
  field: string;
  op: FilterOp;
  value: any;
};

export type QuerySort = {
  field: string;
  direction: "asc" | "desc";
};

