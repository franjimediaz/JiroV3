export type Compute = {
    type: "none";
} | {
    type: "formula";
    expr: string;
    deps: string[];
    persist: "none" | "onSave" | "always";
} | {
    type: "aggregate";
    sourceTable: string;
    field: string;
    op: "sum" | "avg" | "min" | "max" | "count";
    where: Array<{
        field: string;
        op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "in";
        valueFrom?: "this" | "context";
        path?: string;
        value?: any;
    }>;
    persist: "none" | "onSave" | "always";
};
export type FieldType = "text" | "textarea" | "number" | "money" | "percent" | "date" | "datetime" | "boolean" | "select" | "multiselect" | "color" | "file" | "image" | "selectorTabla" | "formula";
export type Appareance = "List" | "Always" | "Zoom";
export type SelectorRef = {
    moduleSlug: string;
    displayField: string;
};

export type Field = {
    name: string;
    label: string;
    type: "text" | "number" | "selectorTabla" | "formula" | "boolean" | "date" | "color" | "select" | "multiselect" | "textarea" | "money" | "percent" | "datetime" | "image" | "FieldType" | "file";
    required?: boolean;
    compute?: Compute;
    allowOverride?: boolean;
    options?: string[];
    ref?: {
        moduleSlug: string;
        table?: string;
        displayField: string;
        valueField?: string;
        filters?: Array<{
            field: string;
            op: "=" | "!=" | ">" | "<" | "in";
            value: any;
        }>;
        sort?: {
            field: string;
            direction: "asc" | "desc";
        }[];
    };
    placeholder?: string;
    help?: string;
    defaultValue?: any;
    visible?: boolean;
    readOnly?: boolean;
    appareance?: Appareance;
    ui?: {
        icon?: string;
        color?: string;
        width?: "1/1" | "1/2" | "1/3"|"1/4" | "2/3";
        variant?: "input" | "textarea" | "currency" | "percent";
        placeholder?: string;
        help?: string;
    };
};
export declare const VALID_FIELD_TYPES: FieldType[];
export declare const Appareance_Valid_Types: Appareance[];
export type FormSection = {
    id: string;
    label: string;
    description?: string;
    fields: string[];
};
export type FormPreviewTab = {
    id: string;
    label: string;
    pdfTemplateId: string;
};
export type CalendarViewMode = "month" | "week" | "day";
export type SpecialViewType = "pdfPreview" | "calendar" | "planEditor";
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
export type PlanDynamicSourceConfig = {
    enabled?: boolean;
    moduleSlug?: string;
    table?: string;
    valueField?: string;
    labelField?: string;
    displayField?: string;
    iconField?: string;
    colorField?: string;
    categoryField?: string;
    typeField?: string;
    orderField?: string;
    lockedField?: string;
    visibleField?: string;
    filters?: QueryFilter[];
    sort?: QuerySort[];
};
export type PlanLinkTargetConfig = {
    label: string;
    moduleSlug: string;
    table?: string;
    valueField?: string;
    displayField?: string;
    filters?: QueryFilter[];
    sort?: QuerySort[];
};
export type PlanEditorSpecialViewConfig = {
    sourceField: string;
    options?: {
        width?: number;
        height?: number;
        unit?: "m" | "cm" | "mm" | "px";
        scale?: {
            pixels: number;
            realValue: number;
            unit: "m" | "cm" | "mm" | "px";
        } | null;
        exportTitle?: string;
        symbolsSource?: PlanDynamicSourceConfig;
        defaultLayersSource?: PlanDynamicSourceConfig;
        linkTargets?: PlanLinkTargetConfig[];
    };
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
export type PlanEditorSpecialView = {
    id: string;
    label: string;
    type: "planEditor";
    sourceField: string;
    options?: PlanEditorSpecialViewConfig["options"];
    config?: PlanEditorSpecialViewConfig;
};
export type SpecialViewConfig = PdfPreviewSpecialView | CalendarSpecialView | PlanEditorSpecialView;
export type UiTab = {
    id: string;
    label: string;
    type: "form";
    config?: {
        formSections?: FormSection[];
    };
} | {
    id: string;
    label: string;
    type: "treeview";
    config?: any;
} | {
    id: string;
    label: string;
    type: "calendar";
    config?: CalendarSpecialViewConfig & {
        sourceTable?: string;
    };
} | {
    id: string;
    label: string;
    type: "planEditor";
    sourceField?: string;
    options?: PlanEditorSpecialViewConfig["options"];
    config?: PlanEditorSpecialViewConfig;
};
export type ModuleUiSchema = {
    icon?: string;
    color?: string;
    sidebar?: boolean;
    formSections?: FormSection[];
    previewTabs?: FormPreviewTab[];
    specialViews?: SpecialViewConfig[];
    tabs?: UiTab[];
    formActions?: any[];
};
export type ModuleSchema = {
    db: {
        table: string;
        softDelete?: boolean;
        primaryKey?: string;
    };
    fields: Field[];
    ui?: ModuleUiSchema;
};
