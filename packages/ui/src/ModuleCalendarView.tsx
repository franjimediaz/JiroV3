"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { CalendarSpecialViewConfig, CalendarViewMode, ModuleSchema } from "@repo/types";
import type { DataProvider } from "./engines/computeEngine";
import { dataProvider as defaultDataProvider } from "./providers/DataProvider";

type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color?: string;
  description?: string;
  resource?: string;
  raw: any;
};

type Props = {
  config?: CalendarSpecialViewConfig | null;
  dataProvider?: DataProvider;
  sourceSchema?: ModuleSchema | null;
  parentSchema?: ModuleSchema | null;
  parentModuleSlug?: string;
  parentRecordId?: string;
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

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 7);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
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

function getViewDateStep(view: CalendarViewMode) {
  if (view === "month") return 30;
  if (view === "week") return 7;
  return 1;
}

function orderMonthEvents(events: CalendarEvent[]) {
  return [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
}

function buildEventFromRecord(record: any, config: CalendarSpecialViewConfig): CalendarEvent | null {
  const rawStart = record?.[config.startField];
  const start = parseDateValue(rawStart);
  if (!start) return null;

  const allDay = config.allDayField ? !!record?.[config.allDayField] : looksDateOnly(rawStart);
  const end = getEventEnd(config.endField ? record?.[config.endField] : null, start, allDay);
  const title = String(record?.[config.titleField] ?? "").trim() || "(Sin título)";

  return {
    id: String(record?.id ?? `${title}-${start.toISOString()}`),
    title,
    start,
    end,
    allDay,
    color: config.colorField ? String(record?.[config.colorField] ?? "") || undefined : undefined,
    description: config.descriptionField ? String(record?.[config.descriptionField] ?? "") || undefined : undefined,
    resource: config.resourceField ? String(record?.[config.resourceField] ?? "") || undefined : undefined,
    raw: record,
  };
}

function MonthView({
  currentDate,
  events,
}: {
  currentDate: Date;
  events: CalendarEvent[];
}) {
  const gridStart = startOfWeek(startOfMonth(currentDate));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="d-flex flex-column gap-2">
      <div className="row g-2">
        {DAY_LABELS.map((label) => (
          <div key={label} className="col">
            <div className="small fw-semibold text-muted text-center">{label}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        {days.map((day) => {
          const dayEvents = orderMonthEvents(events.filter((event) => intersectsDay(event, day)));
          const inMonth = day.getMonth() === currentDate.getMonth();
          return (
            <div
              key={day.toISOString()}
              className="border rounded-3 p-2"
              style={{
                minHeight: 120,
                background: inMonth ? "#fff" : "#f8fafc",
              }}
            >
              <div className={`small fw-semibold mb-2 ${inMonth ? "" : "text-muted"}`}>{formatDayNumber(day)}</div>
              <div className="d-flex flex-column gap-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={`${event.id}-${day.toISOString()}`}
                    className="small rounded px-2 py-1 text-truncate"
                    title={event.title}
                    style={{
                      background: event.color || "#e0ecff",
                      color: "#0f172a",
                    }}
                  >
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="small text-muted">+{dayEvents.length - 3} más</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimedGrid({
  days,
  events,
  singleDay,
}: {
  days: Date[];
  events: CalendarEvent[];
  singleDay?: boolean;
}) {
  const timedEventsByDay = days.map((day) =>
    events.filter((event) => intersectsDay(event, day) && !event.allDay)
  );
  const allDayEventsByDay = days.map((day) =>
    events.filter((event) => intersectsDay(event, day) && event.allDay)
  );

  return (
    <div className="border rounded-3 overflow-hidden" style={{ background: "#fff" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `80px repeat(${days.length}, minmax(0, 1fr))`,
          borderBottom: "1px solid #e5e7eb",
          background: "#f8fafc",
        }}
      >
        <div className="p-2 small text-muted">Todo el día</div>
        {days.map((day, index) => (
          <div key={day.toISOString()} className="p-2 border-start">
            <div className="small fw-semibold">{singleDay ? "Agenda" : DAY_LABELS[index]}</div>
            <div className="small text-muted">
              {day.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
            </div>
            <div className="d-flex flex-column gap-1 mt-2">
              {allDayEventsByDay[index].map((event) => (
                <div
                  key={`${event.id}-all-day`}
                  className="small rounded px-2 py-1 text-truncate"
                  style={{ background: event.color || "#dbeafe", color: "#0f172a" }}
                  title={event.title}
                >
                  {event.title}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `80px repeat(${days.length}, minmax(0, 1fr))`,
          position: "relative",
        }}
      >
        <div>
          {HOUR_LABELS.map((hour) => (
            <div key={hour} className="small text-muted px-2" style={{ height: 56, borderTop: "1px solid #eef2f7" }}>
              {hour}
            </div>
          ))}
        </div>

        {days.map((day, dayIndex) => (
          <div key={day.toISOString()} className="position-relative border-start" style={{ height: 24 * 56 }}>
            {HOUR_LABELS.map((hour) => (
              <div key={hour} style={{ height: 56, borderTop: "1px solid #eef2f7" }} />
            ))}

            {timedEventsByDay[dayIndex].map((event) => {
              const clipped = clipEventToDay(event, day);
              const startMinutes = getMinutesSinceDayStart(clipped.start);
              const endMinutes = Math.max(startMinutes + 30, getMinutesSinceDayStart(clipped.end));
              const top = (startMinutes / 60) * 56;
              const height = ((endMinutes - startMinutes) / 60) * 56;

              return (
                <div
                  key={`${event.id}-${day.toISOString()}-timed`}
                  className="position-absolute rounded-3 px-2 py-1 overflow-hidden"
                  style={{
                    top,
                    left: 6,
                    right: 6,
                    height,
                    background: event.color || "#bfdbfe",
                    color: "#0f172a",
                    border: "1px solid rgba(15, 23, 42, 0.08)",
                  }}
                  title={event.description ? `${event.title}\n${event.description}` : event.title}
                >
                  <div className="small fw-semibold text-truncate">{event.title}</div>
                  <div className="small text-truncate">
                    {event.start.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    {" - "}
                    {event.end.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
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
}: Props) {
  const [state, setState] = useState<LoadState>({
    status: "idle",
    events: [],
    invalidCount: 0,
    error: null,
  });
  const enabledViews = useMemo(() => normalizeViews(config), [config]);
  const [currentView, setCurrentView] = useState<CalendarViewMode>(normalizeDefaultView(config));
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const sourceModuleSlug = useMemo(() => String(config?.sourceModuleSlug || "").trim(), [config?.sourceModuleSlug]);
  const parentLinkResolution = useMemo(
    () =>
      resolveParentLinkField({
        config,
        sourceSchema,
        parentSchema,
        parentModuleSlug,
      }),
    [config, sourceSchema, parentSchema, parentModuleSlug]
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
    setCurrentView(normalizeDefaultView(config));
  }, [config]);

  useEffect(() => {
    if (!sourceModuleSlug || !config?.titleField || !config?.startField || missingParentLink || waitingForParentRecord) {
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
        setState((prev) => ({ ...prev, status: "loading", error: null }));
        const filters =
          shouldFilterByParent && filterField && parentRecordId
            ? [{ field: filterField, op: "=", value: parentRecordId }]
            : [];
        const result = await (dataProvider as any).list({
          moduleSlug: sourceModuleSlug,
          filters,
          limit: 500,
        });

        const rows = Array.isArray(result?.data) ? result.data : [];
        const events: CalendarEvent[] = [];
        let invalidCount = 0;

        for (const row of rows) {
          const event = buildEventFromRecord(row, config);
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
    config,
    dataProvider,
    filterField,
    missingParentLink,
    parentRecordId,
    shouldFilterByParent,
    sourceModuleSlug,
    waitingForParentRecord,
  ]);

  const visibleEvents = state.events;

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => setCurrentDate((prev) => addDays(prev, -getViewDateStep(currentView)));
  const goNext = () => setCurrentDate((prev) => addDays(prev, getViewDateStep(currentView)));

  if (!config?.sourceModuleSlug) {
    return <div className="alert alert-secondary mb-0">Selecciona primero un módulo fuente para el calendario.</div>;
  }

  if (!config.titleField || !config.startField) {
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
    <div className="d-flex flex-column gap-3">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={goPrev}>
            Anterior
          </button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={goToday}>
            Hoy
          </button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={goNext}>
            Siguiente
          </button>
          <div className="fw-semibold ms-2">{formatHeaderRange(currentView, currentDate)}</div>
        </div>

        <div className="btn-group">
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
          {currentView === "month" && <MonthView currentDate={currentDate} events={visibleEvents} />}
          {currentView === "week" && (
            <TimedGrid
              days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(currentDate), i))}
              events={visibleEvents}
            />
          )}
          {currentView === "day" && <TimedGrid days={[startOfDay(currentDate)]} events={visibleEvents} singleDay />}
        </>
      )}
    </div>
  );
}
