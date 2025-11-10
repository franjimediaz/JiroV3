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
        op: "=" | "in";
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
        width?: "1/1" | "1/2" | "1/3" | "2/3";
        variant?: "input" | "textarea" | "currency" | "percent";
        placeholder?: string;
        help?: string;
    };
};
export declare const VALID_FIELD_TYPES: FieldType[];
export declare const Appareance_Valid_Types: Appareance[];
export type ModuleSchema = {
    db: {
        table: string;
        softDelete?: boolean;
        primaryKey?: string;
    };
    fields: Field[];
    ui?: {
        icon?: string;
        color?: string;
    };
};
