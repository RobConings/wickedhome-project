/**
 * Unit tests for the dashboard's pure derivations (timeline, upcoming, stat figures). Run on the server:
 *
 *   npx tsx --test src/features/dashboard/data/dashboard-items.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarAgenda, CalendarEntry } from "@/features/calendar";
import type { EnergySummary } from "@/features/energy";
import type { ExpensesSummary } from "@/features/expenses";
import type { Task, TasksSummary } from "@/features/tasks";
import {
  energyFigures,
  expensesDueThisWeek,
  gasFigures,
  todayItems,
  upcomingItems,
  type DashboardEnergy,
} from "./dashboard-items";

const today = "2026-10-02";

const entry = (patch: Partial<CalendarEntry>): CalendarEntry => ({
  key: "event:e1",
  source: "events",
  kind: "event",
  category: null,
  title: "Event",
  allDay: false,
  start: "2026-10-02T06:15:00.000Z",
  end: "2026-10-02T07:00:00.000Z",
  color: "#124734",
  participantIds: [],
  location: null,
  readOnly: false,
  eventId: "e1",
  recurring: false,
  shop: null,
  href: null,
  meta: null,
  ...patch,
});

const task = (id: string, dueDate: string | null, title = id) =>
  ({ id, title, dueDate, status: "open", place: { id: "p1", name: "Garden" } }) as Task;

const summary = (upcoming: Task[]) => ({ today, upcoming }) as TasksSummary;
const agenda = (entries: CalendarEntry[]): CalendarAgenda => ({ from: today, to: today, entries, events: [], sources: [] });

describe("dashboard timeline", () => {
  it("puts all-day items first, then timed ones by Brussels time", () => {
    const items = todayItems(
      today,
      agenda([
        entry({ key: "event:late", title: "Dinner", start: "2026-10-02T17:00:00.000Z", end: "2026-10-02T19:00:00.000Z" }),
        entry({ key: "event:early", title: "School run", location: "School" }),
        entry({ key: "birthdays:h1", kind: "birthday", title: "Lena", allDay: true, start: today, end: today, eventId: null, meta: { age: 10 } }),
      ]),
      summary([task("t1", today, "Water the plants")]),
    );
    assert.deepEqual(
      items.map((item) => [item.title, item.time]),
      [
        ["Lena", null],
        ["Water the plants", null],
        ["School run", "08:15"],
        ["Dinner", "19:00"],
      ],
    );
    assert.equal(items[0]?.age, 10);
    assert.equal(items[1]?.detail, "Garden");
    assert.equal(items[2]?.href, "/calendar/events/e1");
  });

  it("shows a task once, even though the calendar also has it", () => {
    const items = todayItems(
      today,
      agenda([entry({ key: "tasks:t1", kind: "task", title: "Water the plants", allDay: true, start: today, end: today, href: "/tasks/t1" })]),
      summary([task("t1", today, "Water the plants"), task("t2", "2026-10-05")]),
    );
    assert.deepEqual(items.map((item) => item.id), ["task:t1"]);
  });

  it("marks timed entries that started yesterday as ongoing, and copes with a missing source", () => {
    const items = todayItems(today, agenda([entry({ start: "2026-10-01T20:00:00.000Z", end: "2026-10-02T09:00:00.000Z" })]), null);
    assert.equal(items[0]?.ongoing, true);
    assert.equal(items[0]?.time, null);
    assert.deepEqual(todayItems(today, null, null), []);
  });
});

describe("dashboard upcoming", () => {
  const expenses = {
    today,
    upcoming: [
      { id: "e4", payee: "Late", amountCents: 900, dueDate: "2026-09-20", paidOn: null, status: "overdue" },
      { id: "e5", payee: "Netflix", amountCents: 1349, dueDate: "2026-10-04", paidOn: null, status: "due", recurringExpenseId: "r1" },
      { id: "e1", payee: "Engie", amountCents: 14200, dueDate: "2026-10-05", paidOn: null, status: "due" },
      { id: "e3", payee: "Far away", amountCents: 100, dueDate: "2026-11-30", paidOn: null, status: "upcoming" },
    ],
    dueThisWeek: { count: 2, totalCents: 15549 },
    overdue: { count: 1, totalCents: 900 },
    recurring: { monthlyCents: 4200, yearlyCents: 50400, activeCount: 3, candidatesYearlyCents: 0, candidatesCount: 0 },
  } as unknown as ExpensesSummary;

  it("merges expenses and tasks after today, soonest first", () => {
    const items = upcomingItems(today, { expenses, tasks: summary([task("t1", today), task("t2", "2026-10-03")]) });
    assert.deepEqual(
      items.map((item) => [item.date, item.kind, item.title, item.href]),
      [
        ["2026-10-03", "task", "t2", "/tasks/t2"],
        ["2026-10-04", "bill", "Netflix", "/expenses/e5"],
        ["2026-10-05", "bill", "Engie", "/expenses/e1"],
      ],
    );
  });

  it("counts expenses due this week, overdue ones and the monthly recurring total", () => {
    assert.deepEqual(expensesDueThisWeek(expenses), { count: 2, totalCents: 15549, overdue: 1, recurringMonthlyCents: 4200 });
  });

  it("copes with failed sources", () => {
    assert.deepEqual(upcomingItems(today, { expenses: null, tasks: null }), []);
  });
});

describe("energy card figures", () => {
  const point = (label: string, wh: number | null, litres: number | null = null) => ({
    label,
    importWh: wh ?? 0,
    consumptionWh: wh,
    volumeLitres: litres,
  });
  const summarySlice = (patch: { hasGridData: boolean; consumptionWh?: number | null; importWh?: number; volumeLitres?: number | null; series?: ReturnType<typeof point>[] }) =>
    ({
      totals: {
        importWh: patch.importWh ?? 0,
        consumptionWh: patch.consumptionWh ?? null,
        volumeLitres: patch.volumeLitres ?? null,
        selfSufficiency: null,
      },
      series: patch.series ?? [],
      peak: { kw: 4.2 },
      status: { hasGridData: patch.hasGridData, hasSolar: false, solarMeasured: false },
    }) as unknown as EnergySummary;

  it("shows gas in kWh and m³ for today and the month when the house has gas data", () => {
    const gas = summarySlice({
      hasGridData: true,
      consumptionWh: 120_000,
      importWh: 120_000,
      volumeLitres: 10_526,
      series: [point("2026-10-01", 30_000, 2_632), point(today, 12_500, 1_096)],
    });
    assert.deepEqual(gasFigures(gas, today), { todayWh: 12_500, todayLitres: 1_096, monthWh: 120_000, monthLitres: 10_526 });
  });

  it("has no figure for today before today has data", () => {
    const gas = summarySlice({ hasGridData: true, importWh: 30_000, series: [point("2026-10-01", 30_000)] });
    assert.deepEqual(gasFigures(gas, today), { todayWh: null, todayLitres: null, monthWh: 30_000, monthLitres: null });
  });

  it("hides gas without gas data, and when the gas summary failed or is missing", () => {
    assert.equal(gasFigures(summarySlice({ hasGridData: false }), today), null);
    assert.equal(gasFigures(null, today), null);
    assert.equal(gasFigures(undefined, today), null);
  });

  it("keeps the electricity figures whatever happened to gas", () => {
    const electricity = summarySlice({ hasGridData: true, consumptionWh: 260_000, importWh: 90_000, series: [point(today, 8_700)] });
    const figures = energyFigures({ ...electricity, gas: null } as DashboardEnergy, today);
    assert.equal(figures.hasData, true);
    assert.equal(figures.todayWh, 8_700);
    assert.equal(figures.monthWh, 260_000);
    assert.equal(figures.gridOnly, false);
    assert.equal(figures.peakKw, 4.2);
  });

  it("falls back to grid import when consumption is unknown", () => {
    const electricity = summarySlice({ hasGridData: true, consumptionWh: null, importWh: 90_000, series: [{ ...point(today, null), importWh: 3_100 }] });
    const figures = energyFigures(electricity, today);
    assert.equal(figures.gridOnly, true);
    assert.equal(figures.todayWh, 3_100);
    assert.equal(figures.monthWh, 90_000);
  });
});
