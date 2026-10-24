import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createSourceLoader } from "./helpers/dashboard-fixtures.mjs";

const load = createSourceLoader();
const presentation = load("packages/ui/src/components/specialViews/calendarPresentation.ts");
const {
  buildCalendarDateFilters,
  buildCalendarListFilters,
  buildCalendarRecordHref,
  buildCalendarEventTooltip,
  formatEventTime,
  getCalendarEventPalette,
  getCalendarRecordId,
  getVisibleCalendarRange,
  isCalendarEventActivationKey,
  isValidCalendarColor,
  layoutOverlappingEvents,
} = presentation;

const event = (id, start, end, extra = {}) => ({
  id,
  title: `Cita ${id}`,
  start: new Date(`2026-10-19T${start}:00`),
  end: new Date(`2026-10-19T${end}:00`),
  allDay: false,
  ...extra,
});

test("event presentation exposes title, time and optional metadata without extra data loads", () => {
  const item = event("one", "09:00", "11:00", { resource: "Juan García", description: "Instalar cocina" });
  assert.equal(formatEventTime(item.start), "09:00");
  const tooltip = buildCalendarEventTooltip(item);
  for (const value of ["Cita one", "09:00 - 11:00", "Juan García", "Instalar cocina"]) assert.match(tooltip, new RegExp(value));
  assert.doesNotMatch(buildCalendarEventTooltip(event("short", "09:30", "10:00")), /undefined|null/);
});

test("color precedence is event, module, then stable Jiro default with automatic contrast", () => {
  assert.equal(isValidCalendarColor("#123abc"), true);
  assert.equal(isValidCalendarColor("red"), false);
  const fromEvent = getCalendarEventPalette("#111827", "#ff0000");
  const fromModule = getCalendarEventPalette("invalid", "#16a34a");
  const fallback = getCalendarEventPalette(undefined, undefined);
  assert.equal(fromEvent.accent, "#111827");
  assert.equal(fromModule.accent, "#16a34a");
  assert.equal(fallback.accent, "#2563eb");
  assert.match(fromEvent.background, /^#[0-9a-f]{6}$/i);
  assert.ok(["#000000", "#ffffff"].includes(fromEvent.foreground));
  assert.deepEqual(getCalendarEventPalette(undefined, undefined), fallback);
});

test("simultaneous events receive stable columns while consecutive events reuse space", () => {
  const input = [event("a", "09:00", "10:00"), event("b", "09:30", "11:00"), event("c", "10:00", "10:30"), event("d", "12:00", "12:30")];
  const layout = layoutOverlappingEvents(input);
  assert.deepEqual(layout.map(({ event, column, columns }) => [event.id, column, columns]), [
    ["a", 0, 2], ["b", 1, 2], ["c", 0, 2], ["d", 0, 1],
  ]);
  assert.deepEqual(input.map(item => item.id), ["a", "b", "c", "d"]);
});

test("visible ranges match the rendered month, week and day grids", () => {
  const date = new Date(2026, 10, 18, 12);
  const month = getVisibleCalendarRange("month", date);
  const week = getVisibleCalendarRange("week", date);
  const day = getVisibleCalendarRange("day", date);

  assert.equal(month.start.toLocaleDateString("sv-SE"), "2026-10-26");
  assert.equal(month.end.toLocaleDateString("sv-SE"), "2026-12-06");
  assert.equal(week.start.toLocaleDateString("sv-SE"), "2026-11-16");
  assert.equal(week.end.toLocaleDateString("sv-SE"), "2026-11-22");
  assert.equal(day.start.toLocaleDateString("sv-SE"), "2026-11-18");
  assert.equal(day.end.toLocaleDateString("sv-SE"), "2026-11-18");
});

test("date filters express interval intersection and point events", () => {
  const range = getVisibleCalendarRange("week", new Date(2026, 10, 18));
  assert.deepEqual(buildCalendarDateFilters({ startField: "starts_at", endField: "ends_at", range }), [
    { field: "starts_at", op: "<=", value: range.end.toISOString() },
    { field: "ends_at", op: ">=", value: range.start.toISOString() },
  ]);
  assert.deepEqual(buildCalendarDateFilters({ startField: "day", startFieldType: "date", range }), [
    { field: "day", op: ">=", value: "2026-11-16" },
    { field: "day", op: "<=", value: "2026-11-22" },
  ]);
});

test("parent and date predicates are sent together in one filter list", () => {
  const range = getVisibleCalendarRange("day", new Date(2026, 10, 18));
  const filters = buildCalendarListFilters({
    startField: "starts_at",
    endField: "ends_at",
    range,
    parentFilter: { field: "obra_id", op: "=", value: "obra-1" },
  });
  assert.deepEqual(filters.map(filter => [filter.field, filter.op]), [
    ["obra_id", "="], ["starts_at", "<="], ["ends_at", ">="],
  ]);
});

test("record navigation uses the resolved route and accessible activation keys", () => {
  assert.equal(getCalendarRecordId({ task_key: "task-7", id: "legacy" }, "task_key"), "task-7");
  assert.equal(getCalendarRecordId({ id: "legacy" }, "task_key"), "legacy");
  assert.equal(buildCalendarRecordHref("/m/task/", "task", "a/b"), "/m/task/a%2Fb");
  assert.equal(buildCalendarRecordHref(null, "task", "42"), "/m/task/42");
  assert.equal(isCalendarEventActivationKey("Enter"), true);
  assert.equal(isCalendarEventActivationKey(" "), true);
  assert.equal(isCalendarEventActivationKey("Escape"), false);
});

test("calendar renderer requests one ordered visible range and wires click plus keyboard navigation", () => {
  const source = readFileSync("packages/ui/src/components/specialViews/ModuleCalendarView.tsx", "utf8");
  assert.match(source, /dataProvider as any\)\.list/);
  assert.match(source, /buildCalendarListFilters/);
  assert.match(source, /limit: 200/);
  assert.match(source, /sort: \[\{ field: normalizedConfig\.startField, direction: "asc" \}\]/);
  assert.match(source, /layoutOverlappingEvents/);
  assert.match(source, /height >= 52 && event\.resource/);
  assert.match(source, /height >= 88 && event\.description/);
  assert.match(source, /className=\{styles\.monthEvent\}/);
  assert.match(source, /role: "button"/);
  assert.match(source, /onClick: \(\) => onOpenEvent\(event\)/);
  assert.match(source, /isCalendarEventActivationKey/);
  assert.match(source, /getCalendarRecordId\(record, primaryKey\)/);
});
