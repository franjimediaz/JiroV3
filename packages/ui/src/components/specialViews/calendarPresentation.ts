import { getContrastingTextColor, lightenColor, normalizeHexColor } from "../../utils/colorContrast";

export type CalendarViewMode = "month" | "week" | "day";

export type CalendarQueryFilter = {
  field: string | { field: string; relations?: string[] };
  op: "=" | ">=" | "<=";
  value: unknown;
};

export type CalendarVisibleRange = {
  start: Date;
  end: Date;
};

export type CalendarPresentationEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color?: string;
  description?: string;
  resource?: string;
};

export type TimedEventLayout<T extends CalendarPresentationEvent> = {
  event: T;
  column: number;
  columns: number;
};

export const DEFAULT_CALENDAR_COLOR = "#2563eb";

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfLocalWeek(date: Date) {
  const mondayOffset = (date.getDay() + 6) % 7;
  return addLocalDays(startOfLocalDay(date), -mondayOffset);
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCalendarBoundary(date: Date, fieldType?: string) {
  return fieldType === "date" ? localDateKey(date) : date.toISOString();
}

export function getVisibleCalendarRange(view: CalendarViewMode, currentDate: Date): CalendarVisibleRange {
  let start: Date;
  let exclusiveEnd: Date;

  if (view === "month") {
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    start = startOfLocalWeek(monthStart);
    exclusiveEnd = addLocalDays(start, 42);
  } else if (view === "week") {
    start = startOfLocalWeek(currentDate);
    exclusiveEnd = addLocalDays(start, 7);
  } else {
    start = startOfLocalDay(currentDate);
    exclusiveEnd = addLocalDays(start, 1);
  }

  return { start, end: new Date(exclusiveEnd.getTime() - 1) };
}

export function buildCalendarDateFilters(args: {
  startField: string | { field: string; relations?: string[] };
  endField?: string | { field: string; relations?: string[] };
  startFieldType?: string;
  endFieldType?: string;
  range: CalendarVisibleRange;
}): CalendarQueryFilter[] {
  const startField = args.startField;
  const endField = args.endField;
  if (!startField || (typeof startField === "string" && !startField.trim())) return [];

  if (!endField || (typeof endField === "string" && !endField.trim())) {
    return [
      { field: startField, op: ">=", value: formatCalendarBoundary(args.range.start, args.startFieldType) },
      { field: startField, op: "<=", value: formatCalendarBoundary(args.range.end, args.startFieldType) },
    ];
  }

  return [
    { field: startField, op: "<=", value: formatCalendarBoundary(args.range.end, args.startFieldType) },
    { field: endField, op: ">=", value: formatCalendarBoundary(args.range.start, args.endFieldType) },
  ];
}

export function buildCalendarListFilters(args: Parameters<typeof buildCalendarDateFilters>[0] & {
  parentFilter?: CalendarQueryFilter;
}) {
  const dateFilters = buildCalendarDateFilters(args);
  return args.parentFilter ? [args.parentFilter, ...dateFilters] : dateFilters;
}

export function buildCalendarRecordHref(baseRoute: string | null | undefined, moduleSlug: string, recordId: unknown) {
  const id = String(recordId ?? "").trim();
  const slug = String(moduleSlug || "").trim();
  if (!id || !slug) return null;

  const configuredBase = String(baseRoute || "").trim();
  const base = configuredBase || `/m/${encodeURIComponent(slug)}`;
  const normalizedBase = `${base.startsWith("/") ? "" : "/"}${base}`.replace(/\/+$/, "");
  return `${normalizedBase}/${encodeURIComponent(id)}`;
}

export function getCalendarRecordId(record: Record<string, unknown> | null | undefined, primaryKey?: string) {
  const key = String(primaryKey || "id").trim() || "id";
  const value = record?.[key] ?? record?.id;
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

export function isCalendarEventActivationKey(key: string) {
  return key === "Enter" || key === " ";
}

export function isValidCalendarColor(value: unknown): value is string {
  return typeof value === "string" && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value.trim());
}

export function getCalendarEventPalette(eventColor: unknown, moduleColor: unknown) {
  const accent = normalizeHexColor(
    isValidCalendarColor(eventColor) ? eventColor : isValidCalendarColor(moduleColor) ? moduleColor : DEFAULT_CALENDAR_COLOR,
  );
  const background = lightenColor(accent, 0.9);
  return {
    accent,
    background,
    foreground: getContrastingTextColor(background),
  };
}

export function formatEventTime(date: Date) {
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function formatEventTimeRange(event: Pick<CalendarPresentationEvent, "start" | "end" | "allDay">) {
  return event.allDay ? "Todo el dia" : `${formatEventTime(event.start)} - ${formatEventTime(event.end)}`;
}

export function buildCalendarEventTooltip(event: CalendarPresentationEvent) {
  const date = event.start.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return [event.title, `${date} · ${formatEventTimeRange(event)}`, event.resource, event.description]
    .filter(Boolean)
    .join("\n");
}

/** Assign stable overlap columns without changing the event order or duration. */
export function layoutOverlappingEvents<T extends CalendarPresentationEvent>(events: readonly T[]): TimedEventLayout<T>[] {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
  const result: TimedEventLayout<T>[] = [];
  let cluster: Array<{ event: T; column: number }> = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    if (!cluster.length) return;
    const columns = Math.max(...cluster.map(item => item.column)) + 1;
    result.push(...cluster.map(item => ({ ...item, columns })));
    cluster = [];
  };

  for (const event of sorted) {
    const start = event.start.getTime();
    if (cluster.length && start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    const occupied = new Set(cluster.filter(item => item.event.end.getTime() > start).map(item => item.column));
    let column = 0;
    while (occupied.has(column)) column += 1;
    cluster.push({ event, column });
    clusterEnd = Math.max(clusterEnd, event.end.getTime());
  }
  flush();
  return result;
}
