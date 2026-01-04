"use client";

import React, { useEffect, useMemo, useState } from "react";

type Task = {
  id: string;
  title?: string;
  obraId?: string;

  // ✅ tu modelo real
  from: string;          // timestampz ISO (obligatorio idealmente)
  dateto?: string | null; // timestampz ISO (puede ser null)

  service?: string;
  total?: number;
};

type ViewMode = "week" | "month";

export default function Calendar({ proyectoId }: { proyectoId: string }) {
  const [mode, setMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  // ---------- Rango visible ----------
  const range = useMemo(() => {
    return mode === "month" ? getMonthRange(anchor) : getWeekRange(anchor);
  }, [mode, anchor]);

  // ---------- Fetch al endpoint correcto (/api/task) ----------
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

        const res = await fetch(url, {
          credentials: "include",
          signal: ac.signal,
        });

        const raw = await res.text();

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${raw.slice(0, 200)}`);
        }

        // Si por lo que sea llega HTML, aquí lo verás claramente
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

  // ---------- Normaliza fechas (from/dateto) ----------
  const normalized = useMemo(() => {
    return (tasks || [])
      .map((t) => {
        const start = parseTs(t.from);
        if (!start) return null;

        const end = parseTs(t.dateto ?? "") || start; // si dateto null -> start
        return { ...t, _start: start, _end: end };
      })
      .filter(Boolean) as (Task & { _start: Date; _end: Date })[];
  }, [tasks]);

  // ---------- Días del rango ----------
  const days = useMemo(() => {
    const out: Date[] = [];
    const d = new Date(range.start);
    while (d <= range.end) {
      out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [range]);

  // ---------- Agrupa por día (día de inicio) ----------
  const tasksByDay = useMemo(() => {
    const map = new Map<string, (Task & { _start: Date; _end: Date })[]>();

    for (const t of normalized) {
      const key = ymd(t._start);
      const arr = map.get(key) || [];
      arr.push(t);
      map.set(key, arr);
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
            {loading ? "Cargando…" : `${tasks.length} tareas`}
          </span>
        </div>
      </div>

      <div className="card-body">
        {loading ? (
          <div className="text-muted">Cargando tareas…</div>
        ) : tasks.length === 0 ? (
          <div className="alert alert-light border mb-0">
            No hay tareas en este rango.
          </div>
        ) : mode === "month" ? (
          <MonthView days={days} tasksByDay={tasksByDay} anchor={anchor} />
        ) : (
          <WeekView days={days} tasksByDay={tasksByDay} />
        )}
      </div>
    </div>
  );
}

/* -------------------- Vistas -------------------- */

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

                return (
                  <td key={key} style={{ verticalAlign: "top" }}>
                    <div className={`d-flex justify-content-between ${isCurrentMonth ? "" : "text-muted"}`}>
                      <small className="fw-semibold">{day.getDate()}</small>
                      {list.length > 0 && <small className="text-muted">{list.length}</small>}
                    </div>

                    <div className="d-flex flex-column gap-1 mt-1">
                      {list.slice(0, 4).map((t: any) => (
                        <div
                          key={t.id}
                          className="badge text-bg-primary text-truncate"
                          title={`${fmtTime(t._start)}–${fmtTime(t._end)} · ${t.title || "(sin título)"}`}
                          style={{ textAlign: "left" }}
                        >
                          {fmtTime(t._start)} · {t.title || "(sin título)"}
                        </div>
                      ))}
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

function WeekView({
  days,
  tasksByDay,
}: {
  days: Date[];
  tasksByDay: Map<string, any[]>;
}) {
  // ✅ para no “perder” tareas por hora fuera del rango: 0..23
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="table-responsive">
      <table className="table table-bordered align-middle mb-0">
        <thead>
          <tr>
            <th style={{ width: 80 }} className="small text-muted">
              Hora
            </th>
            {days.map((d) => (
              <th key={ymd(d)}>
                <div className="d-flex flex-column">
                  <span className="fw-semibold">
                    {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][((d.getDay() + 6) % 7)]}
                  </span>
                  <small className="text-muted">
                    {d.getDate()}/{d.getMonth() + 1}
                  </small>
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {hours.map((h) => (
            <tr key={h} style={{ height: 56 }}>
              <td className="text-muted small">{String(h).padStart(2, "0")}:00</td>

              {days.map((day) => {
                const key = ymd(day);

                // pinta en la hora exacta de inicio (simple y estable)
                const list = (tasksByDay.get(key) || []).filter((t: any) => t._start.getHours() === h);

                return (
                  <td key={key + "-" + h} style={{ verticalAlign: "top" }}>
                    <div className="d-flex flex-column gap-1">
                      {list.map((t: any) => (
                        <div
                          key={t.id}
                          className="p-1 rounded border"
                          title={`${fmtTime(t._start)}–${fmtTime(t._end)} · ${t.title || "(sin título)"}`}
                        >
                          <div className="small fw-semibold text-truncate">{t.title || "(sin título)"}</div>
                          <div className="small text-muted">
                            {fmtTime(t._start)}–{fmtTime(t._end)}
                          </div>
                        </div>
                      ))}
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
