import type { QueryFilter, QuerySort } from "@repo/types";

export type PlanTool = "select" | "line" | "rect" | "text" | "symbol" | "polygon" | "measure" | "pan";

export type PlanUnit = "m" | "cm" | "mm" | "km" | "in" | "ft" | "px";

export type PlanCanvasConfig = {
  width: number;
  height: number;
  unit: PlanUnit;
  scale: PlanScaleConfig | null;
  grid: PlanGridConfig;
  snap: PlanSnapConfig;
  view: PlanViewConfig;
};

export type PlanScaleConfig = {
  pixels: number;
  realValue: number;
  unit: PlanUnit;
  calibratedFrom?: PlanScaleCalibration;
};

export type PlanScaleCalibration = {
  objectId?: string;
  pixelLength: number;
  realLength: number;
  unit: PlanUnit;
  calibratedAt: string;
};

export type PlanGridConfig = {
  enabled: boolean;
  size: number;
  snap: boolean;
};

export type PlanSnapConfig = {
  enabled: boolean;
  toGrid: boolean;
  toObjects: boolean;
  threshold: number;
};

export type PlanViewConfig = {
  showRulers: boolean;
  showGuides: boolean;
};

export type PlanBackgroundConfig = {
  url: string;
  locked: boolean;
  opacity: number;
  fit: "contain" | "cover" | "stretch" | "original";
  source?: PlanBackgroundSource;
};

export type PlanBackgroundSource = {
  type: "url" | "upload";
  fileName?: string;
  uploadedAt?: string;
};

export type PlanBackgroundUploaderConfig = {
  enabled?: boolean;
  endpoint?: string;
  mode?: "global";
  folder?: string;
};

export type PlanLinkedRecord = {
  label?: string;
  moduleSlug?: string;
  table: string;
  recordId: string;
  displayValue?: string;
};

export type PlanObjectSource = {
  moduleSlug?: string;
  table?: string;
  recordId?: string;
};

export type PlanObjectBase = {
  id: string;
  layerId?: string;
  locked?: boolean;
  linkedTo?: PlanLinkedRecord;
};

export type PlanLineObject = PlanObjectBase & {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  label: string;
  showMeasure: boolean;
  manualMeasureLabel?: string;
};

export type PlanRectObject = PlanObjectBase & {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  label: string;
  showArea: boolean;
  manualAreaLabel?: string;
};

export type PlanPolygonPoint = {
  x: number;
  y: number;
};

export type PlanPolygonObject = PlanObjectBase & {
  type: "polygon";
  points: PlanPolygonPoint[];
  stroke: string;
  strokeWidth: number;
  fill: string;
  label: string;
  showArea: boolean;
  manualAreaLabel?: string;
};

export type PlanTextObject = PlanObjectBase & {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
};

export type PlanSymbolObject = PlanObjectBase & {
  type: "symbol";
  x: number;
  y: number;
  symbolId: string;
  symbolLabel: string;
  symbolIcon?: string;
  symbolColor?: string;
  size: number;
  source?: PlanObjectSource;
};

export type PlanObject = PlanLineObject | PlanRectObject | PlanPolygonObject | PlanTextObject | PlanSymbolObject;

export type PlanLayer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
  color?: string;
  source?: PlanObjectSource;
};

export type PlanDocument = {
  version: 7;
  canvas: PlanCanvasConfig;
  background: PlanBackgroundConfig;
  layers: PlanLayer[];
  activeLayerId: string;
  objects: PlanObject[];
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

export type PlanSymbolDefinition = {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  category?: string;
  type?: string;
  raw?: unknown;
  source?: PlanObjectSource;
};

export type PlanEditorOptions = Partial<Pick<PlanCanvasConfig, "width" | "height" | "unit" | "scale">> & {
  exportTitle?: string;
  exportSubtitleField?: string;
  grid?: Partial<PlanGridConfig>;
  background?: Partial<PlanBackgroundConfig> & {
    uploader?: PlanBackgroundUploaderConfig;
  };
  export?: {
    includeGrid?: boolean;
    includeLayerLegend?: boolean;
    pageOrientation?: "portrait" | "landscape";
  };
  calibration?: {
    enabled?: boolean;
    allowedUnits?: PlanUnit[];
    defaultUnit?: PlanUnit;
  };
  polygonValidation?: {
    enabled?: boolean;
    showWarnings?: boolean;
    epsilon?: number;
  };
  snap?: Partial<PlanSnapConfig>;
  view?: Partial<PlanViewConfig>;
  measurement?: {
    enabled?: boolean;
    allowConvertToLine?: boolean;
  };
  symbolsSource?: PlanDynamicSourceConfig;
  defaultLayersSource?: PlanDynamicSourceConfig;
  linkTargets?: PlanLinkTargetConfig[];
};

export type PlanEditorConfig = {
  sourceField: string;
  options?: PlanEditorOptions;
};
