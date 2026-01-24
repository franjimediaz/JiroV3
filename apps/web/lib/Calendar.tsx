"use client";

import React, { useEffect, useMemo, useState } from "react";

type Task = {
  id: string;
  title?: string;
  obraId?: string;

  // timestampz
  from: string;
  dateto?: string | null;

  service?: string;
  total?: number;
  responsible?: string;
  users? : { uid: string; name?: string};
  services?: { id: string; title?: string; color?: string | null };
};

type ViewMode = "week" | "month";

export default function Calendar({ proyectoId }: { proyectoId: string }) {
  const [mode, setMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => {
    return mode === "month" ? getMonthRange(anchor) : getWeekRange(anchor);
  }, [mode, anchor]);

  // Fetch solo rango visible. Endpoint: /api/task
  useEffect(() => {
    if (!proyectoId) return;

    const ac = new AbortController();

    (async () => {
      setLoading(true);
      try {
        const startISO = range.start.toISOString();
        const endISO = range.end.toISOString();

        const url =
          `/api/task?proyectoId=${encodeURIComponent(proyectoId)}` +
          `&start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`;

        const res = await fetch(url, { credentials: "include", signal: ac.signal });
        const raw = await res.text();

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 200)}`);

        const json = JSON.parse(raw);
        setTasks(Array.isArray(json?.data) ? json.data : []);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Calendar fetch error:", err?.message ?? err, err);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [proyectoId, range.start, range.end]);

  // Normaliza from/dateto a Dates
  const normalized = useMemo(() => {
    return (tasks || [])
      .map((t) => {
        const start = parseTs(t.from);
        if (!start) return null;
        const end = parseTs(t.dateto ?? "") || start;
        return { ...t, _start: start, _end: end };
      })
      .filter(Boolean) as (Task & { _start: Date; _end: Date })[];
  }, [tasks]);

  // Días del rango
  const days = useMemo(() => {
    const out: Date[] = [];
    const d = new Date(range.start);
    while (d <= range.end) {
      out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [range]);

  // ✅ tasksByDay EXPANDIDO: mete cada tarea en todos los días que toca (para vista mes por días)
  const tasksByDayExpanded = useMemo(() => {
    const map = new Map<string, (Task & { _start: Date; _end: Date })[]>();

    for (const t of normalized) {
      const touched = eachDayTouched(t._start, t._end);
      for (const day of touched) {
        const key = ymd(day);
        const arr = map.get(key) || [];
        arr.push(t);
        map.set(key, arr);
      }
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a._start.getTime() - b._start.getTime());
      map.set(k, arr);
    }

    return map;
  }, [normalized]);

  const goPrev = () => setAnchor((d) => addDays(d, mode === "month" ? -30 : -7));
  const goNext = () => setAnchor((d) => addDays(d, mode === "month" ? 30 : 7));
  const goToday = () => setAnchor(new Date());

  return (
    <div className="card">
      <div className="card-header d-flex flex-wrap gap-2 align-items-center justify-content-between">
        <div className="d-flex gap-2 align-items-center">
          <div className="btn-group" role="group" aria-label="vista">
            <button
              className={`btn btn-sm ${mode === "week" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setMode("week")}
              type="button"
            >
              Semana
            </button>
            <button
              className={`btn btn-sm ${mode === "month" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setMode("month")}
              type="button"
            >
              Mes
            </button>
          </div>

          <button className="btn btn-sm btn-outline-secondary" onClick={goPrev} type="button">
            ←
          </button>
          <button className="btn btn-sm btn-outline-secondary" onClick={goToday} type="button">
            Hoy
          </button>
          <button className="btn btn-sm btn-outline-secondary" onClick={goNext} type="button">
            →
          </button>
        </div>

        <div className="fw-semibold">
          {mode === "month" ? labelMonth(anchor) : labelWeek(range.start, range.end)}
          <span className="ms-2 text-muted small">
            {loading ? "Cargando…" : `${normalized.length} tareas`}
          </span>
        </div>
      </div>

      <div className="card-body">
        {loading ? (
          <div className="text-muted">Cargando tareas…</div>
        ) : normalized.length === 0 ? (
          <div className="alert alert-light border mb-0">No hay tareas en este rango.</div>
        ) : mode === "month" ? (
          <MonthView days={days} tasksByDay={tasksByDayExpanded} anchor={anchor} />
        ) : (
          <WeekViewBlocks days={days} tasks={normalized} rangeStart={range.start} rangeEnd={range.end} />
        )}
      </div>
    </div>
  );
}

/* -------------------- MONTH VIEW (por días) -------------------- */

function MonthView({
  days,
  tasksByDay,
  anchor,
}: {
  days: Date[];
  tasksByDay: Map<string, any[]>;
  anchor: Date;
}) {
  const weeks = chunk(days, 7);

  function pickTextColor(hex: string) {
  // Solo soporta #RRGGBB. Si te viene otra cosa, blanco por defecto.
  if (!hex || !hex.startsWith("#") || hex.length !== 7) return "#fff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // luminancia relativa aproximada
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 140 ? "#111" : "#fff";
}

  return (
    <div className="table-responsive">
      <table className="table table-bordered align-middle mb-0">
        <thead>
          <tr>
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <th key={d} className="small text-muted">
                {d}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {weeks.map((w, i) => (
            <tr key={i} style={{ height: 120 }}>
              {w.map((day) => {
                const key = ymd(day);
                const list = tasksByDay.get(key) || [];
                const isCurrentMonth = day.getMonth() === anchor.getMonth();
                const c = list[0]?.services?.color || "#0d6efd";

                return (
                  <td key={key} style={{ verticalAlign: "top" }}>
                    <div className={`d-flex justify-content-between ${isCurrentMonth ? "" : "text-muted"}`}>
                      <small className="fw-semibold">{day.getDate()}</small>
                      {list.length > 0 && <small className="text-muted">{list.length}</small>}
                    </div>

                    <div className="d-flex flex-column gap-1 mt-1">
                      {list.slice(0, 4).map((t: any) => {
                        const c = t?.services?.color || "#0d6efd";
                        const txt = pickTextColor(c); // opcional, te lo dejo abajo

                        return (
                          <div
                            key={t.id + "-" + key + "-" + t._start?.toISOString?.()}
                            className="badge text-truncate"
                            title={`${fmtTime(t._start)}–${fmtTime(t._end)} · ${t.title || "(sin título)"}`}
                            style={{
                              backgroundColor: c,
                              color: txt,
                              textAlign: "left",
                              display: "block",          // para que ocupe el ancho disponible
                              width: "100%",
                            }}
                          >
                            {shortEventLabelForMonth(t, day)}
                          </div>
                        );
                      })}
                      {list.length > 4 && <small className="text-muted">+{list.length - 4} más</small>}
                    </div>

                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// etiqueta más útil en mes: si el evento empieza hoy o continúa
function shortEventLabelForMonth(t: any, cellDay: Date) {
  const cellKey = ymd(cellDay);
  const startKey = ymd(t._start);
  const endKey = ymd(t._end);

  const title = t.title || "(sin título)";
  if (startKey === cellKey && endKey === cellKey) return `${fmtTime(t._start)} · ${title}`;
  if (startKey === cellKey) return `↦ ${fmtTime(t._start)} · ${title}`;
  if (endKey === cellKey) return `↤ ${fmtTime(t._end)} · ${title}`;
  return `↔ ${title}`;
}

/* -------------------- WEEK VIEW (bloques por duración) -------------------- */

function WeekViewBlocks({
  days,
  tasks,
  rangeStart,
  rangeEnd,
}: {
  days: Date[];
  tasks: (Task & { _start: Date; _end: Date })[];
  rangeStart: Date;
  rangeEnd: Date;
}) {
  const slotMinutes = 30;
  const slotHeight = 10;

  const startHour = 8;
  const endHour = 22;

  const totalMinutes = (endHour - startHour) * 60;
  const totalSlots = totalMinutes / slotMinutes;
  const canvasHeight = totalSlots * slotHeight;
  
  

  type Seg = {
    id: string;
    title?: string;
    _start: Date;
    _end: Date;
    // layout
    lane?: number;
    color?: string | null;
    responsibleName?: string | null;
    
  };

  function minutesFromStartHour(d: Date) {
    return (d.getHours() - startHour) * 60 + d.getMinutes();
  }

  function calcBlockStyle(day: Date, s: Date, e: Date) {
    const dayStart = new Date(day);
    dayStart.setHours(startHour, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(endHour, 0, 0, 0);

    const cs = clampDate(s, dayStart, dayEnd);
    const ce = clampDate(e, dayStart, dayEnd);

    const startMin = Math.max(0, minutesFromStartHour(cs));
    const endMin = Math.min(totalMinutes, minutesFromStartHour(ce));
    const durMin = Math.max(10, endMin - startMin);

    const top = (startMin / slotMinutes) * slotHeight;
    const height = (durMin / slotMinutes) * slotHeight;
    return { top, height };
  }

  // ✅ Crea “segmentos” por día (recortados al propio día)
  const segsByDay = useMemo(() => {
    const map = new Map<string, Seg[]>();
    for (const d of days) map.set(ymd(d), []);

    for (const t of tasks) {
      const s = clampDate(t._start, rangeStart, rangeEnd);
      const e = clampDate(t._end, rangeStart, rangeEnd);
      const serviceColor = t.services?.color || "#0d6efd";
      const responsibleName = t.users?.name || "Sin responsable";
      

      for (const day of eachDayTouched(s, e)) {
        const key = ymd(day);
        if (!map.has(key)) continue;

        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);

        const segStart = clampDate(s, dayStart, dayEnd);
        const segEnd = clampDate(e, dayStart, dayEnd);

        // si no dura nada, no lo pintes
        if (segEnd.getTime() <= segStart.getTime()) continue;

        map.get(key)!.push({
          id: t.id,
          title: t.title,
          _start: segStart,
          _end: segEnd,
          color: serviceColor,
          responsibleName: responsibleName,
        });
      }
    }

    // orden por inicio, luego por duración
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        const d = a._start.getTime() - b._start.getTime();
        if (d !== 0) return d;
        return b._end.getTime() - a._end.getTime();
      });
      map.set(k, arr);
    }

    return map;
  }, [days, tasks, rangeStart, rangeEnd]);

  //  Asigna lanes (columnas) por día para evitar que se pisen
  function layoutDaySegments(segs: Seg[]) {
    // lanes[i] = fin del último evento en esa lane
    const laneEnds: number[] = [];
    let maxLanes = 0;

    for (const seg of segs) {
      const s = seg._start.getTime();
      const e = seg._end.getTime();

      // busca la primera lane libre
      let lane = -1;
      for (let i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i] <= s) {
          lane = i;
          break;
        }
      }
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(e);
      } else {
        laneEnds[lane] = e;
      }
      
      seg.lane = lane;
      maxLanes = Math.max(maxLanes, laneEnds.length);
    }

    return { segs, lanes: maxLanes || 1 };
    
  }

  return (
    <div className="border rounded">
      {/* Header */}
      <div className="d-flex border-bottom bg-light">
        <div style={{ width: 50 }} className="border-end small text-muted p-2">
          Hora
        </div>
        {days.map((d) => (
          <div key={ymd(d)} className="flex-grow-1 border-end p-2">
            <div className="fw-semibold">{dowLabel(d)}</div>
            <div className="small text-muted">
              {d.getDate()}/{d.getMonth() + 1}
            </div>
          </div>
        ))}
      </div>

      <div className="d-flex">
        {/* Columna horas */}
        <div style={{ width: 50 }} className="border-end bg-white position-relative">
          <div style={{ height: canvasHeight }} className="position-relative">
            {Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i).map((h) => {
              const top = ((h - startHour) * 60 * slotHeight) / slotMinutes;
              return (
                <div
                  key={h}
                  className="position-absolute small text-muted"
                  style={{ top: top - 8, left: 8 }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              );
            })}
          </div>
        </div>

        {/* Columnas días */}
        {days.map((day) => {
          const key = ymd(day);
          const segs = segsByDay.get(key) || [];
          const { segs: laidOut, lanes } = layoutDaySegments([...segs]); // copia para no mutar memo
          const gap = 1; // espacio interno
          const laneWidthPct = 100 / lanes;
          

          return (
            <div key={key} className="flex-grow-1 border-end">
              <div
                className="position-relative"
                style={{
                  height: canvasHeight,
                  //backgroundColor: "#fdfdfdff",
                  backgroundImage:
                    "linear-gradient(to bottom, rgba(255, 255, 255, 1) 1px, transparent 40px)",
                  backgroundSize: `100% ${slotHeight * (60 / slotMinutes)}px`,
                }}
              >
                {laidOut.map((seg) => {
                  const { top, height } = calcBlockStyle(day, seg._start, seg._end);
                  const lane = seg.lane ?? 0;

                  // left/width por lane (en %)
                  const leftPct = lane * laneWidthPct;
                  const widthPct = laneWidthPct;
                  const c = seg.color || "#0d6efd";
                  const resp = seg.responsibleName || "Sin responsable";

                  return (
                    <div
                      key={seg.id + "-" + key + "-" + lane + "-" + seg._start.toISOString()}
                      className="position-absolute rounded border shadow-sm p-1"
                      style={{
                        background: `${c}`,
                        top,
                        height,
                        left: `calc(${leftPct}% + ${gap}px)`,
                        width: `calc(${widthPct}% - ${gap * 2}px)`,
                        overflow: "hidden",
                      }}
                      title={`${fmtTime(seg._start)}–${fmtTime(seg._end)} · ${seg.title || "(sin título)"} → ${resp}`}
                    >
                      <div className="small fw-semibold"   
                          style={{
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                  lineHeight: "1.2em",
                                  maxHeight: "2.4em",
                                }}>
                          {seg.title || "(sin título)"}</div>

                      <div className="small text-muted">
                        {fmtTime(seg._start)}–{fmtTime(seg._end)}
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* -------------------- Utils -------------------- */

function parseTs(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // lunes=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function getWeekRange(anchor: Date) {
  const start = startOfWeekMonday(anchor);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getMonthRange(anchor: Date) {
  // grid 6 semanas (42 días) desde lunes
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeekMonday(first);
  const end = new Date(start);
  end.setDate(end.getDate() + 41);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function labelMonth(d: Date) {
  const m = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
  ][d.getMonth()];
  return `${m} ${d.getFullYear()}`;
}

function labelWeek(a: Date, b: Date) {
  return `Semana ${a.getDate()}/${a.getMonth() + 1} → ${b.getDate()}/${b.getMonth() + 1}`;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && aEnd >= bStart;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function clampDate(d: Date, min: Date, max: Date) {
  return new Date(Math.min(Math.max(d.getTime(), min.getTime()), max.getTime()));
}

function eachDayTouched(start: Date, end: Date) {
  const days: Date[] = [];
  let cur = startOfDay(start);
  const last = startOfDay(end);
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function dowLabel(d: Date) {
  return ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][((d.getDay() + 6) % 7)];
}
