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
  | "formula";
 export type Appareance = "List" | "Always" | "Zoom";

export type FormSection = {
  id: string;
  label: string;
  description?: string;
  fields: string[]; // names de campos
};
export type FormPreviewTab = {
  id: string;
  label: string;
  pdfTemplateId: string;
};
export type CalendarViewMode = "month" | "week" | "day";
export type SpecialViewType = "pdfPreview" | "calendar";
export type PdfPreviewSpecialViewConfig = {
  pdfTemplateId?: string;
};
export type CalendarSpecialViewConfig = {
  sourceModuleSlug: string;
  titleField: string;
  startField: string;
  endField?: string;
  allDayField?: string;
  colorField?: string;
  descriptionField?: string;
  resourceField?: string;
  parentLinkField?: string;
  defaultView?: CalendarViewMode;
  enabledViews?: CalendarViewMode[];
};
export type PdfPreviewSpecialView = {
  id: string;
  label: string;
  type: "pdfPreview";
  config?: PdfPreviewSpecialViewConfig;
};
export type CalendarSpecialView = {
  id: string;
  label: string;
  type: "calendar";
  config?: CalendarSpecialViewConfig;
};
export type SpecialViewConfig = PdfPreviewSpecialView | CalendarSpecialView;
export type SelectorTablaRef = {
  moduleSlug: string;
  multiple?: boolean;
  table?: string;
  displayField: string; // obligatorio SOLO aquí
  valueField?: string;
  hasStyle?: boolean;
  styleIconField?: string;  
  styleColorField?: string;
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
  virtual?: boolean;

  compute?: Compute;
  allowOverride?: boolean;
  options?: string[];

  placeholder?: string;
  help?: string;
  defaultValue?: any;
  visible?: boolean;
  visibleWhen?: VisibleWhen;
  readOnly?: boolean;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];

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
  maxFiles?: number;
  multiple?: boolean;
  
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
  
  
];
export const Appareance_Valid_Types: Appareance[] = [
  "List",
  "Always",
  "Zoom"
];
export type UiTab =
                    | {
                        id: string;
                        label: string;
                        type: "form";
                        config?: { formSections?: FormSection[] };
                      }
                    | {
                        id: string;
                        label: string;
                        type: "treeview";
                        config?: TreeViewConfigLegacy | TreeViewConfig | any;
                      }
                    | {
                        id: string;
                        label: string;
                        type: "calendar";
                        config?: CalendarSpecialViewConfig & { sourceTable?: string };
                      };
export type ModuleUiSchema = {
  icon?: string;
  color?: string;
  sidebar?: boolean;
  formSections?: FormSection[];
  previewTabs?: FormPreviewTab[];
  specialViews?: SpecialViewConfig[];
  tabs?: UiTab[];
  formActions?: FormAction[];
};
export type ModuleSchema = {
  db: {
    name?:string;
    table: string;
    softDelete?: boolean;
    primaryKey?: string;
  };
  fields: Field[]; // ← aquí se usa el array de Field
  ui?: ModuleUiSchema;

};


export type ModuloRow = {
  id: string;
  parent_id: string | null;
  nombre: string;
  slug: string;
  tipo: "carpeta" | "tabla" | "subtabla" | "vista";
  orden: number;
  activo: boolean;
  props: any;

};
export type ModuloNode = ModuloRow & { children: ModuloNode[] };

export type OpenCreateModuleFn = (opts: {
  parentId: string | null;
  defaultTipo?: "tabla" | "carpeta" | "subtabla" | "vista";
}) => void;

export type ListViewProps = {
  schema: ModuleSchema;
  data: any[];
  loading?: boolean;
  exportLoading?: boolean;
  importLoading?: boolean;

  onViewRow?: (row: any) => void;
  onEditRow?: (row: any) => void;
  onDeleteRow?: (row: any) => void;
  onCreate?: () => void;
  onExport?: (payload: ListViewExportPayload) => void | Promise<void>;
  onImport?: () => void | Promise<void>;
};
export type ListViewExportColumn = {
  name: string;
  label: string;
};
export type ListViewExportPayload = {
  columns: ListViewExportColumn[];
  rows: Record<string, string>[];
  rawRows: any[];
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
export type CacheEntry = { label: string; icon?: string; color?: string };

type ColumnType = "text" | "money" | "date" | "datetime" | "boolean" | "select";

export type TreeViewFilter =
  | { kind: "eq"; field: string; value?: any; valueFromParent?: string }
  | { kind: "in"; field: string; values?: any[]; valuesFromParent?: string };

export type TreeViewLookup = {
  field: string; // campo en filas (FK o valor)
  table: string; // tabla lookup
  valueField?: string; // default "id"
  labelField: string;
  iconField?: string;
  colorField?: string;
};

export type TreeViewLevel = {
  levelField: string; // ej "nivel"
  order?: "asc" | "desc";
  labelPrefix?: string; // ej "Nivel"
};

export type TreeViewConfig = {
  source: {
    table: string;
    select?: string[]; // si no, se deduce
    orderBy?: { field: string; ascending?: boolean };
    filters?: TreeViewFilter[];
  };

  grouping: {
    groupByField: string; // ej "service"
    groupTitleField?: string; // si groupByField ya es texto (no FK)
    level?: TreeViewLevel;
  };

  columns: Array<{
    field: string;
    label: string;
    type?: ColumnType;
    width?: string;
    options?: string[]; // para select si quieres
  }>;

  totals?: {
    enabled: boolean;
    sumField: string; // ej "total"
    currency?: string; // default "EUR"
    showGroupTotals?: boolean;
    showGrandTotal?: boolean;
  };

  lookups?: TreeViewLookup[];

  actions?: {
    enableDelete?: boolean;
    deleteTable?: string; // default source.table
  };

  ui?: {
    title?: string;
  };
};

export type TreeViewQuery = {
  table: string;
  select: string[];
  filters?: Array<
    | { op: "eq"; field: string; value: any }
    | { op: "in"; field: string; value: any[] }
  >;
  orderBy?: { field: string; ascending?: boolean };
};

export type LookupQuery = {
  table: string;
  valueField: string;
  ids: string[];
  select: string[];
};

export type TreeViewDataProvider = {
  list: (query: TreeViewQuery) => Promise<any[]>;
  lookup?: (query: LookupQuery) => Promise<any[]>;
  remove?: (table: string, id: string) => Promise<void>;
};
type TreeViewConfigLegacy = {
  sourceTable?: string;
  groupBy?: string[];
  columns?: string[];
};
export type FormMode = "view" | "edit" | "create";

/** condiciones simples para deshabilitar */
export type ActionDisabledWhen =
  | { type: "missingFields"; fields: string[] }
  | { type: "modeIs"; modes: FormMode[] };

export type ActionConfirm = {
  title?: string;
  text: string;
};

export type ActionVariant =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "light"
  | "dark";

type BaseFormAction = {
  id: string;
  label: string;
  icon?: string; // p.ej. "bi bi-plus-lg"
  variant?: ActionVariant;
  showIn?: FormMode[]; // default: ["view","edit","create"]
  confirm?: ActionConfirm;
  disabledWhen?: ActionDisabledWhen;

  /** por si luego quieres colocar arriba/abajo */
  placement?: "top" | "bottom";
};

/**
 * 1) Crear registro relacionado
 * - target: tabla destino
 * - fieldMap: { campoDestino: "campoOrigen" } (soporta paths tipo "cliente.id")
 * - defaults: valores fijos en destino
 */
export type CreateRelatedAction = BaseFormAction & {
  type: "createRelated";
  target: {
    table: string;
    moduleSlug?: string; // opcional, si luego quieres resolver tabla por módulo
  };
  fieldMap?: Record<string, string>;
  defaults?: Record<string, unknown>;
  afterCreate?: {
    navigateTo?: "record" | "list" | "none";
    hrefTemplate?: string; // ej "/presupuestos/{{id}}?edit=true"
    openEdit?: boolean;
  };
};

/**
 * 4) Navegación inteligente
 */
export type NavigateAction = BaseFormAction & {
  type: "navigate";
  target?: {
    table?: string;
    moduleSlug?: string;
  };
  hrefTemplate: string; // ej "/tareas/new?obraId={{id}}"
};

/**
 * 2) Calcular / recomputar
 */
export type RecalculateAction = BaseFormAction & {
  type: "recalculate";
};

/**
 * 2) Duplicar registro
 */
export type DuplicateAction = BaseFormAction & {
  type: "duplicate";
  includeChildren?: boolean;
  omitFields?: string[]; // ej ["id","createdAt","updatedAt"]
  afterDuplicate?: {
    navigateTo?: "record" | "list" | "none";
    openEdit?: boolean;
  };
};

/**
 * 5) Acciones externas (placeholder)
 */
export type ExternalAction = BaseFormAction & {
    kind?: "pdf" | "url" | "email" | "print";
    pdf?: {
    templateSlug?: string;      // slug en pdf_templates
    recordIdTemplate?: string;  // "{{id}}" por defecto
    open?: "tab" | "same";      // opcional
  };
    endpoint?: string; // ej: "/api/pdf/generate"
    open?: "tab" | "same";
    params?: Record<string, any>;
};

export type FormAction =
  | CreateRelatedAction
  | NavigateAction
  | RecalculateAction
  | DuplicateAction
  | ExternalAction;
