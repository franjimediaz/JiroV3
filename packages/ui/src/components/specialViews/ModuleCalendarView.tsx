"use client";

import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { CalendarSpecialViewConfig, CalendarViewMode, ModuleSchema } from "@repo/types";
import { getFieldRefValue, isDirectFieldRef, normalizeCalendarConfig, normalizeFieldRef, getRecordName } from "@repo/types";
import { getRecordNameSchema } from "../../utils/recordNameSchema";
import type { DataProvider } from "../../engines/computeEngine";
import { dataProvider as defaultDataProvider } from "../../providers/DataProvider";
import {
  buildCalendarListFilters,
  buildCalendarRecordHref,
  buildCalendarEventTooltip,
  formatEventTime,
  formatEventTimeRange,
  getCalendarEventPalette,
  getCalendarRecordId,
  getVisibleCalendarRange,
  isCalendarEventActivationKey,
  layoutOverlappingEvents,
} from "./calendarPresentation";
import styles from "./ModuleCalendarView.module.css";

type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color?: string;
  description?: string;
  resource?: string;
  recordId?: string;
  raw: any;
};

type Props = {
  config?: CalendarSpecialViewConfig | null;
  dataProvider?: DataProvider;
  sourceSchema?: ModuleSchema | null;
  parentSchema?: ModuleSchema | null;
  parentModuleSlug?: string;
  parentRecordId?: string;
  resolveRoute?: (source: string) => string | null | undefined;
};

type LoadState =
  | { status: "idle"; events: CalendarEvent[]; invalidCount: number; error: string | null }
  | { status: "loading"; events: CalendarEvent[]; invalidCount: number; error: string | null }
  | { status: "ready"; events: CalendarEvent[]; invalidCount: number; error: null }
  | { status: "error"; events: CalendarEvent[]; invalidCount: number; error: string };

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function startOfWeek(date: Date) {
  const day = (date.getDay() + 6) % 7;
  return addDays(startOfDay(date), -day);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDayNumber(date: Date) {
  return String(date.getDate());
}

function formatHeaderRange(view: CalendarViewMode, currentDate: Date) {
  if (view === "month") {
    return currentDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  }

  if (view === "week") {
    const start = startOfWeek(currentDate);
    const end = addDays(start, 6);
    return `${start.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} - ${end.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;
  }

  return currentDate.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function looksDateOnly(value: any) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function parseDateValue(value: any) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const next = looksDateOnly(trimmed) ? new Date(`${trimmed}T00:00:00`) : new Date(trimmed);
    return Number.isNaN(next.getTime()) ? null : next;
  }
  if (typeof value === "number") {
    const next = new Date(value);
    return Number.isNaN(next.getTime()) ? null : next;
  }
  return null;
}

function normalizeViews(config?: CalendarSpecialViewConfig | null) {
  const enabled = Array.isArray(config?.enabledViews) && config?.enabledViews.length
    ? config.enabledViews
    : (["month", "week", "day"] as CalendarViewMode[]);
  const unique = Array.from(new Set(enabled)).filter((view): view is CalendarViewMode =>
    view === "month" || view === "week" || view === "day"
  );
  return unique.length ? unique : (["month", "week", "day"] as CalendarViewMode[]);
}

function normalizeDefaultView(config?: CalendarSpecialViewConfig | null) {
  const enabled = normalizeViews(config);
  return enabled.includes(config?.defaultView as CalendarViewMode)
    ? (config?.defaultView as CalendarViewMode)
    : enabled[0];
}

function getEventEnd(rawEnd: any, start: Date, allDay: boolean) {
  const parsedEnd = parseDateValue(rawEnd);
  if (parsedEnd && parsedEnd.getTime() > start.getTime()) return parsedEnd;
  if (allDay) return addDays(startOfDay(start), 1);
  return addHours(start, 1);
}

function hasField(schema: ModuleSchema | null | undefined, fieldName: string) {
  return !!schema?.fields?.some((field) => field.name === fieldName);
}

function resolveParentLinkField(args: {
  config?: CalendarSpecialViewConfig | null;
  sourceSchema?: ModuleSchema | null;
  parentSchema?: ModuleSchema | null;
  parentModuleSlug?: string;
}) {
  const configured = String(args.config?.parentLinkField || "").trim();
  if (configured) {
    return hasField(args.sourceSchema, configured)
      ? { field: configured, warning: null as string | null }
      : { field: "", warning: `El campo vínculo configurado "${configured}" no existe en el módulo fuente.` };
  }

  const sourceFields = Array.isArray(args.sourceSchema?.fields) ? args.sourceSchema!.fields : [];
  const parentTable = String(args.parentSchema?.db?.table || "").trim();
  const parentSlug = String(args.parentModuleSlug || "").trim();
  const candidates = sourceFields.filter((field: any) => {
    if (field?.type !== "selectorTabla" || !field?.ref) return false;
    const refModuleSlug = String(field.ref.moduleSlug || "").trim();
    const refTable = String(field.ref.table || "").trim();
    return (!!parentSlug && refModuleSlug === parentSlug) || (!!parentTable && refTable === parentTable);
  });

  if (candidates.length === 1) {
    return { field: candidates[0].name, warning: null as string | null };
  }

  if (candidates.length > 1) {
    return {
      field: "",
      warning: "Hay varios campos que podrían vincular este calendario con el registro actual. Configura `parentLinkField` para elegir uno.",
    };
  }

  return { field: "", warning: null as string | null };
}

function intersectsDay(event: CalendarEvent, day: Date) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return event.start < dayEnd && event.end > dayStart;
}

function getMinutesSinceDayStart(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function clipEventToDay(event: CalendarEvent, day: Date) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const start = event.start < dayStart ? dayStart : event.start;
  const end = event.end > dayEnd ? dayEnd : event.end;
  return { start, end };
}

function shiftViewDate(date: Date, view: CalendarViewMode, direction: -1 | 1) {
  if (view === "month") return new Date(date.getFullYear(), date.getMonth() + direction, 1);
  return addDays(date, direction * (view === "week" ? 7 : 1));
}

function orderMonthEvents(events: CalendarEvent[]) {
  return [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
}

function eventStyle(event: CalendarEvent, moduleColor?: string): CSSProperties {
  const palette = getCalendarEventPalette(event.color, moduleColor);
  return {
    "--event-accent": palette.accent,
    "--event-bg": palette.background,
    "--event-fg": palette.foreground,
  } as CSSProperties;
}

function buildEventFromRecord(record: any, config: CalendarSpecialViewConfig, schema?: ModuleSchema | null): CalendarEvent | null {
  const rawStart = getFieldRefValue(record, config.startField);
  const start = parseDateValue(rawStart);
  if (!start) return null;

  const allDay = config.allDayField ? !!getFieldRefValue(record, config.allDayField) : looksDateOnly(rawStart);
  const end = getEventEnd(config.endField ? getFieldRefValue(record, config.endField) : null, start, allDay);
  const titleValue = getFieldRefValue(record, config.titleField);
  const title = isDirectFieldRef(config.titleField)
    ? getRecordName(record, schema, { legacyField: normalizeFieldRef(config.titleField).field, fallback: "(Sin título)" })
    : String(titleValue ?? "(Sin título)");

  const primaryKey = String(schema?.db?.primaryKey || "id").trim();
  const recordId = getCalendarRecordId(record, primaryKey);

  return {
    id: recordId ?? `${title}-${start.toISOString()}`,
    title,
    start,
    end,
    allDay,
    color: config.colorField ? String(getFieldRefValue(record, config.colorField) ?? "") || undefined : undefined,
    description: config.descriptionField ? String(getFieldRefValue(record, config.descriptionField) ?? "") || undefined : undefined,
    resource: config.resourceField ? String(getFieldRefValue(record, config.resourceField) ?? "") || undefined : undefined,
    recordId,
    raw: record,
  };
}

type EventViewProps = {
  currentDate: Date;
  events: CalendarEvent[];
  moduleColor?: string;
  onOpenEvent: (event: CalendarEvent) => void;
};

function eventInteractionProps(event: CalendarEvent, onOpenEvent: (event: CalendarEvent) => void) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: () => onOpenEvent(event),
    onKeyDown: (keyboardEvent: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isCalendarEventActivationKey(keyboardEvent.key)) return;
      keyboardEvent.preventDefault();
      onOpenEvent(event);
    },
  };
}

function MonthView({ currentDate, events, moduleColor, onOpenEvent }: EventViewProps) {
  const gridStart = startOfWeek(startOfMonth(currentDate));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div className={`${styles.viewport} ${styles.monthViewport}`}>
      <div className={styles.month}>
        <div className={styles.monthWeekdays}>
          {DAY_LABELS.map(label => <div key={label} className={styles.monthWeekday}>{label}</div>)}
        </div>
        <div className={styles.monthGrid}>
          {days.map(day => {
            const dayEvents = orderMonthEvents(events.filter(event => intersectsDay(event, day)));
            const inMonth = day.getMonth() === currentDate.getMonth();
            const today = isSameDay(day, new Date());
            const weekend = day.getDay() === 0 || day.getDay() === 6;
            return <div key={day.toISOString()} className={`${styles.monthDay} ${!inMonth ? styles.outsideMonth : ""} ${weekend ? styles.weekend : ""}`}>
              <div className={`${styles.dayNumber} ${today ? styles.todayNumber : ""}`}>{formatDayNumber(day)}</div>
              <div className={styles.monthEvents}>
                {dayEvents.slice(0, 4).map(event => <div key={`${event.id}-${day.toISOString()}`} className={styles.monthEvent}
                  title={buildCalendarEventTooltip(event)} aria-label={buildCalendarEventTooltip(event)} style={eventStyle(event, moduleColor)}
                  {...eventInteractionProps(event, onOpenEvent)}>
                  {!event.allDay && <span className={styles.eventTime}>{formatEventTime(event.start)}</span>}
                  <span className={styles.eventTitle}>{event.title}</span>
                </div>)}
                {dayEvents.length > 4 && <div className={styles.moreEvents}>+{dayEvents.length - 4} más</div>}
              </div>
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}

function TimedGrid({ days, events, singleDay, moduleColor, onOpenEvent }: Omit<EventViewProps, "currentDate"> & { days: Date[]; singleDay?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const timedEventsByDay = days.map(day => events.filter(event => intersectsDay(event, day) && !event.allDay));
  const allDayEventsByDay = days.map(day => events.filter(event => intersectsDay(event, day) && event.allDay));
  return (
    <div className={styles.viewport}>
      <div className={styles.timedCalendar} style={{ "--calendar-days": days.length } as CSSProperties}>
        <div className={styles.timeHeader}>
          <div className={styles.allDayLabel}>Todo el día</div>
          {days.map((day, index) => <div key={day.toISOString()} className={`${styles.dayHeader} ${isSameDay(day, now) ? styles.dayHeaderToday : ""}`}>
            <div className={styles.dayHeaderName}>{singleDay ? day.toLocaleDateString("es-ES", { weekday: "short" }) : DAY_LABELS[index]}</div>
            <div className={styles.dayHeaderDate}>{day.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</div>
            <div className={styles.allDayList}>{allDayEventsByDay[index].map(event => <div key={`${event.id}-all-day`} className={styles.allDayEvent}
              style={eventStyle(event, moduleColor)} title={buildCalendarEventTooltip(event)} aria-label={buildCalendarEventTooltip(event)}
              {...eventInteractionProps(event, onOpenEvent)}>
              <span className={styles.eventTitle}>{event.title}</span>
            </div>)}</div>
          </div>)}
        </div>
        <div className={styles.timeBody}>
          <div className={styles.hourAxis}>{HOUR_LABELS.map(hour => <div key={hour} className={styles.hourLabel}>{hour}</div>)}</div>
          {days.map((day, dayIndex) => {
            const layouts = layoutOverlappingEvents(timedEventsByDay[dayIndex]);
            const showNow = isSameDay(day, now);
            return <div key={day.toISOString()} className={`${styles.dayColumn} ${showNow ? styles.todayColumn : ""}`}>
              {HOUR_LABELS.map(hour => <div key={hour} className={styles.hourLine} />)}
              {Array.from({ length: 24 }, (_, hour) => <div key={`half-${hour}`} className={styles.halfHourLine} style={{ top: hour * 56 + 28 }} />)}
              {showNow && <div className={styles.nowLine} style={{ top: (getMinutesSinceDayStart(now) / 60) * 56 }}>
                <span className={styles.nowLabel}>{formatEventTime(now)}</span>
              </div>}
              {layouts.map(({ event, column, columns }) => {
                const clipped = clipEventToDay(event, day);
                const startMinutes = getMinutesSinceDayStart(clipped.start);
                const endMinutes = Math.max(startMinutes + 15, getMinutesSinceDayStart(clipped.end));
                const top = (startMinutes / 60) * 56;
                const height = Math.max(18, ((endMinutes - startMinutes) / 60) * 56);
                const width = 100 / columns;
                return <div key={`${event.id}-${day.toISOString()}-timed`} className={styles.timedEvent}
                  style={{ ...eventStyle(event, moduleColor), top, left: `calc(${column * width}% + 3px)`, width: `calc(${width}% - 6px)`, height }}
                  title={buildCalendarEventTooltip(event)} aria-label={buildCalendarEventTooltip(event)}
                  {...eventInteractionProps(event, onOpenEvent)}>
                  {height < 34 ? <div className={styles.timedEventCompact}>
                    <span className={styles.timedEventTime}>{formatEventTime(event.start)}</span>
                    <span className={styles.timedEventTitle}>{event.title}</span>
                  </div> : <>
                    <div className={styles.timedEventTime}>{formatEventTimeRange(event)}</div>
                    <div className={styles.timedEventTitle}>{event.title}</div>
                  </>}
                  {height >= 52 && event.resource && <div className={styles.timedEventMeta}>{event.resource}</div>}
                  {height >= 88 && event.description && <div className={styles.timedEventDescription}>{event.description}</div>}
                </div>;
              })}
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}

export default function ModuleCalendarView({
  config,
  dataProvider = defaultDataProvider,
  sourceSchema,
  parentSchema,
  parentModuleSlug,
  parentRecordId,
  resolveRoute,
}: Props) {
  const normalizedConfig = useMemo(() => normalizeCalendarConfig(config), [config]);
  const [state, setState] = useState<LoadState>({
    status: "idle",
    events: [],
    invalidCount: 0,
    error: null,
  });
  const enabledViews = useMemo(() => normalizeViews(normalizedConfig), [normalizedConfig]);
  const [currentView, setCurrentView] = useState<CalendarViewMode>(normalizeDefaultView(normalizedConfig));
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const visibleRange = useMemo(() => getVisibleCalendarRange(currentView, currentDate), [currentView, currentDate]);
  const visibleRangeStartMs = visibleRange.start.getTime();
  const visibleRangeEndMs = visibleRange.end.getTime();
  const sourceModuleSlug = useMemo(() => String(normalizedConfig?.sourceModuleSlug || "").trim(), [normalizedConfig?.sourceModuleSlug]);
  const parentLinkResolution = useMemo(
    () =>
      resolveParentLinkField({
        config: normalizedConfig,
        sourceSchema,
        parentSchema,
        parentModuleSlug,
      }),
    [normalizedConfig, sourceSchema, parentSchema, parentModuleSlug]
  );
  const shouldFilterByParent = !!parentRecordId;
  const sameModuleAsParent = shouldFilterByParent && sourceModuleSlug === String(parentModuleSlug || "").trim();
  const filterField = sameModuleAsParent
    ? String(sourceSchema?.db?.primaryKey || parentSchema?.db?.primaryKey || "id").trim()
    : parentLinkResolution.field;
  const missingParentLink =
    shouldFilterByParent && !sameModuleAsParent && sourceModuleSlug !== String(parentModuleSlug || "").trim() && !filterField;
  const waitingForParentRecord = !parentRecordId;

  useEffect(() => {
    setCurrentView(normalizeDefaultView(normalizedConfig));
  }, [normalizedConfig]);

  useEffect(() => {
    if (!sourceModuleSlug || !normalizedConfig?.titleField || !normalizedConfig?.startField || missingParentLink || waitingForParentRecord) {
      setState({
        status: "idle",
        events: [],
        invalidCount: 0,
        error: null,
      });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setState({ status: "loading", events: [], invalidCount: 0, error: null });
        const recordSchema = sourceSchema || await getRecordNameSchema(dataProvider, sourceModuleSlug);
        const startFieldName = normalizeFieldRef(normalizedConfig.startField).field;
        const endFieldName = normalizeFieldRef(normalizedConfig.endField).field;
        const startFieldType = isDirectFieldRef(normalizedConfig.startField)
          ? recordSchema?.fields?.find(field => field.name === startFieldName)?.type
          : undefined;
        const endFieldType = normalizedConfig.endField
          ? isDirectFieldRef(normalizedConfig.endField)
            ? recordSchema?.fields?.find(field => field.name === endFieldName)?.type
            : undefined
          : undefined;
        const parentFilter = shouldFilterByParent && filterField && parentRecordId
          ? { field: filterField, op: "=" as const, value: parentRecordId }
          : undefined;
        const filters = buildCalendarListFilters({
          startField: normalizedConfig.startField,
          endField: normalizedConfig.endField,
          startFieldType,
          endFieldType,
          range: { start: new Date(visibleRangeStartMs), end: new Date(visibleRangeEndMs) },
          parentFilter,
        });
        const result = await (dataProvider as any).list({
          moduleSlug: sourceModuleSlug,
          filters,
          sort: [{ field: normalizedConfig.startField, direction: "asc" }],
          fieldRefs: [
            normalizedConfig.titleField,
            normalizedConfig.startField,
            normalizedConfig.endField,
            normalizedConfig.allDayField,
            normalizedConfig.colorField,
            normalizedConfig.descriptionField,
            normalizedConfig.resourceField,
          ].filter(Boolean),
          limit: 200,
        });

        const rows = Array.isArray(result?.data) ? result.data : [];
        const events: CalendarEvent[] = [];
        let invalidCount = 0;

        for (const row of rows) {
          const event = buildEventFromRecord(row, normalizedConfig, recordSchema);
          if (!event) {
            invalidCount += 1;
            continue;
          }
          events.push(event);
        }

        if (cancelled) return;
        setState({
          status: "ready",
          events,
          invalidCount,
          error: null,
        });
      } catch (error: any) {
        if (cancelled) return;
        setState({
          status: "error",
          events: [],
          invalidCount: 0,
          error: error?.message || "No se pudo cargar el calendario",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    normalizedConfig,
    dataProvider,
    filterField,
    missingParentLink,
    parentRecordId,
    shouldFilterByParent,
    sourceModuleSlug,
    waitingForParentRecord,
    sourceSchema,
    visibleRangeStartMs,
    visibleRangeEndMs,
  ]);

  const visibleEvents = state.events;
  const moduleColor = String(sourceSchema?.ui?.color || parentSchema?.ui?.color || "").trim() || undefined;

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => setCurrentDate((prev) => shiftViewDate(prev, currentView, -1));
  const goNext = () => setCurrentDate((prev) => shiftViewDate(prev, currentView, 1));
  const openEvent = (event: CalendarEvent) => {
    const href = buildCalendarRecordHref(resolveRoute?.(sourceModuleSlug), sourceModuleSlug, event.recordId);
    if (href) window.location.assign(href);
  };

  if (!normalizedConfig?.sourceModuleSlug) {
    return <div className="alert alert-secondary mb-0">Selecciona primero un módulo fuente para el calendario.</div>;
  }

  if (!normalizedConfig.titleField || !normalizedConfig.startField) {
    return <div className="alert alert-secondary mb-0">Configura al menos `titleField` y `startField` para el calendario.</div>;
  }

  if (waitingForParentRecord) {
    return (
      <div className="alert alert-secondary mb-0">
        Guarda primero el registro actual para poder cargar solo los eventos vinculados a esta ficha.
      </div>
    );
  }

  if (missingParentLink) {
    return (
      <div className="alert alert-warning mb-0">
        {parentLinkResolution.warning || "No se pudo resolver el campo vínculo con el registro actual. Configura `parentLinkField` en la vista de calendario."}
      </div>
    );
  }

  return (
    <div className={`${styles.calendar} d-flex flex-column gap-3`}>
      <div className={styles.toolbar} aria-label="Controles del calendario">
        <div className={styles.toolbarNav}>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={goToday}>
            Hoy
          </button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={goPrev} aria-label="Periodo anterior" title="Periodo anterior">
            <span aria-hidden="true">‹</span><span className={styles.navText}> Anterior</span>
          </button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={goNext} aria-label="Periodo siguiente" title="Periodo siguiente">
            <span className={styles.navText}>Siguiente </span><span aria-hidden="true">›</span>
          </button>
        </div>

        <h3 className={styles.toolbarTitle}>{formatHeaderRange(currentView, currentDate)}</h3>

        <div className={`${styles.viewSwitch} btn-group`} role="group" aria-label="Vista del calendario">
          {enabledViews.map((view) => (
            <button
              key={view}
              type="button"
              className={`btn btn-sm ${currentView === view ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setCurrentView(view)}
            >
              {view === "month" ? "Mes" : view === "week" ? "Semana" : "Día"}
            </button>
          ))}
        </div>
      </div>

      {state.status === "loading" && visibleEvents.length === 0 && (
        <div className="alert alert-info mb-0">Cargando eventos...</div>
      )}

      {state.status === "error" && <div className="alert alert-warning mb-0">{state.error}</div>}

      {!missingParentLink && parentLinkResolution.warning && (
        <div className="small text-muted">{parentLinkResolution.warning}</div>
      )}

      {state.status !== "error" && visibleEvents.length === 0 && (
        <div className="alert alert-secondary mb-0">No hay eventos para mostrar.</div>
      )}

      {state.invalidCount > 0 && (
        <div className="small text-muted">
          Se omitieron {state.invalidCount} evento(s) por no tener una fecha de inicio válida.
        </div>
      )}

      {visibleEvents.length > 0 && (
        <>
          {currentView === "month" && <MonthView currentDate={currentDate} events={visibleEvents} moduleColor={moduleColor} onOpenEvent={openEvent} />}
          {currentView === "week" && (
            <TimedGrid
              days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(currentDate), i))}
              events={visibleEvents}
              moduleColor={moduleColor}
              onOpenEvent={openEvent}
            />
          )}
          {currentView === "day" && <TimedGrid days={[startOfDay(currentDate)]} events={visibleEvents} singleDay moduleColor={moduleColor} onOpenEvent={openEvent} />}
        </>
      )}
    </div>
  );
}
