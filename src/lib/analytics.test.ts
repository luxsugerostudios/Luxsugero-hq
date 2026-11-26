import assert from "node:assert/strict";
import test from "node:test";
import { brandStats, findFlags, kpis, linearFit, median, percentile, personStats, projectBacklog, suggestions, weeklySeries, windowFor } from "./analytics.ts";
import type { Task, TaskHistory } from "./types.ts";

const TODAY = "2026-11-26";
function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, ownerId: "debo", givenDate: "2026-11-20", dueDate: null, status: "open", lane: "todo",
    closedAt: null, longTerm: false, flagAfterDays: null, note: "", brand: null, inboxId: null,
    createdAt: "2026-11-20T04:00:00.000Z", updatedAt: "2026-11-20T04:00:00.000Z", ...extra,
  };
}
const done = (id: string, given: string, closed: string, extra: Partial<Task> = {}) =>
  task(id, { givenDate: given, status: "done", lane: "done", closedAt: `${closed}T06:00:00.000Z`, ...extra });

test("median, percentile and least squares", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
  const fit = linearFit([2, 4, 6, 8]);
  assert.equal(fit.slope, 2);
  assert.equal(fit.intercept, 2);
});

test("period KPIs count created, closed, on time and cycle time", () => {
  const tasks = [
    done("a", "2026-11-20", "2026-11-22", { dueDate: "2026-11-23" }),
    done("b", "2026-11-18", "2026-11-25", { dueDate: "2026-11-21" }),
    task("c", { givenDate: "2026-11-24" }),
    task("old", { givenDate: "2026-10-01" }),
  ];
  const k = kpis(tasks, windowFor(TODAY, 7), TODAY);
  assert.equal(k.created, 2);
  assert.equal(k.closed, 2);
  assert.equal(k.onTimeRate, 0.5);
  assert.equal(k.medianCycleDays, 4.5);
  assert.equal(k.open, 2);
  assert.equal(k.stale, 1);
});

test("weekly backlog and a growing projection", () => {
  const tasks: Task[] = [];
  for (let w = 0; w < 6; w++) for (let i = 0; i < 3; i++) tasks.push(task(`t${w}-${i}`, { givenDate: `2026-${w < 2 ? "10" : "11"}-${String(w < 2 ? 20 + w * 5 : (w - 2) * 7 + 2).padStart(2, "0")}` }));
  const series = weeklySeries(tasks, TODAY, 6);
  assert.equal(series.length, 6);
  assert.ok(series[5].backlog >= series[0].backlog);
  const p = projectBacklog(series);
  assert.equal(p.weeks.length, 4);
  assert.equal(p.trend, "growing");
  assert.equal(p.weeksToClear, null);
});

test("people stats flag an outlier load", () => {
  const tasks = [
    ...Array.from({ length: 12 }, (_, i) => task(`h${i}`, { ownerId: "hari-om" })),
    task("m1", { ownerId: "megha" }), task("s1", { ownerId: "siddhant" }), task("d1", { ownerId: "debo" }), task("g1", { ownerId: "gaurav" }),
  ];
  const people = personStats(tasks, windowFor(TODAY, 15), TODAY, ["hari-om", "megha", "siddhant", "debo", "gaurav", "unassigned"]);
  assert.equal(people[0].id, "hari-om");
  assert.ok(people[0].loadZ >= 1.5);
  const flags = findFlags({ tasks, history: {}, standups: [], people, brands: [], w: windowFor(TODAY, 15), today: TODAY, name: (id) => id });
  assert.ok(flags.some((flag) => flag.id === "over-hari-om"));
  assert.ok(flags.some((flag) => flag.id === "stall-hari-om"));
});

test("loops: waiting too long, ping-pong, reopened, slipping deadlines, missing standups", () => {
  const ev = (taskId: string, summary: string, at: string): TaskHistory => ({ id: `${taskId}-${summary}-${at}`, taskId, personId: "founder", action: "x", summary, at });
  const tasks = [task("w", { lane: "waiting" }), task("p"), done("r", "2026-11-10", "2026-11-25"), task("s", { dueDate: "2026-11-30" })];
  const history = {
    w: [ev("w", "Moved to Waiting", "2026-11-19T05:00:00.000Z")],
    p: [ev("p", "Reassigned to debo", "2026-11-20T05:00:00.000Z"), ev("p", "Reassigned to megha", "2026-11-21T05:00:00.000Z"), ev("p", "Reassigned to debo", "2026-11-22T05:00:00.000Z")],
    r: [ev("r", "Reopened", "2026-11-12T05:00:00.000Z"), ev("r", "Reopened", "2026-11-14T05:00:00.000Z")],
    s: [ev("s", "Due 22 Nov", "2026-11-20T05:00:00.000Z"), ev("s", "Due 25 Nov", "2026-11-22T05:00:00.000Z"), ev("s", "Due 30 Nov", "2026-11-25T05:00:00.000Z")],
  };
  const flags = findFlags({ tasks, history, standups: [], people: [], brands: [], w: windowFor(TODAY, 7), today: TODAY, name: (id) => id });
  const ids = flags.map((flag) => flag.id);
  for (const id of ["waiting", "pingpong", "reopened", "slipped", "standups"]) assert.ok(ids.includes(id), id);
  const ideas = suggestions(flags, kpis(tasks, windowFor(TODAY, 7), TODAY), { weeks: [], trend: "flat", weeksToClear: null, slopePerWeek: 0 });
  assert.ok(ideas.some((idea) => /waiting on/.test(idea.title)));
});

test("brands rank by work closed and show momentum", () => {
  const tasks = [
    done("a", "2026-11-20", "2026-11-24", { brand: "skybox" }),
    done("b", "2026-11-20", "2026-11-25", { brand: "skybox" }),
    done("c", "2026-11-10", "2026-11-15", { brand: "fh" }),
    task("d", { brand: "fh" }), task("e", { brand: "fh" }),
  ];
  const rows = brandStats(tasks, windowFor(TODAY, 7), windowFor(TODAY, 7, 1), TODAY);
  assert.equal(rows[0].brand, "skybox");
  assert.equal(rows[0].share, 1);
  const fh = rows.find((row) => row.brand === "fh")!;
  assert.equal(fh.closed, 0);
  assert.equal(fh.closedPrev, 1);
  assert.equal(fh.momentum, -1);
  assert.equal(rows[0].momentum, null);
});

test("no projection until there are 3 weeks of history", () => {
  const tasks = [task("a", { givenDate: "2026-11-24" }), task("b", { givenDate: "2026-11-25" })];
  const series = weeklySeries(tasks, TODAY, 8);
  const p = projectBacklog(series);
  assert.equal(p.enoughHistory, false);
  assert.equal(p.historyWeeks, 1);
  assert.equal(p.weeks.length, 0);
});
