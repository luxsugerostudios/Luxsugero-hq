import { addDays, diffDays, isOverdue, stampToKolkataDay } from "./dates.ts";
import type { BrandId, Standup, Task, TaskHistory } from "./types.ts";

/**
 * Insights maths. Everything here is a pure function of the task records,
 * their history and the standup log, so it can be tested and reused for the
 * PDF report. Days are Asia/Kolkata calendar days (YYYY-MM-DD).
 */

export type PeriodId = "7" | "15" | "30" | "90";
export const PERIODS: { id: PeriodId; label: string; days: number }[] = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "15", label: "Last 15 days", days: 15 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Quarter (90 days)", days: 90 },
];

const BUCKETS = new Set(["unassigned", "everyone"]);

export type Window = { start: string; end: string; days: number };

export function windowFor(today: string, days: number, offset = 0): Window {
  const end = addDays(today, -offset * days);
  return { start: addDays(end, -(days - 1)), end, days };
}

const inWindow = (day: string | null | undefined, w: Window) => Boolean(day) && day! >= w.start && day! <= w.end;
export const closedDay = (task: Task) => (task.status === "done" && task.closedAt ? stampToKolkataDay(task.closedAt) : "");

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

/** Least-squares line through (0..n-1, values). */
export function linearFit(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  const xs = values.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

function zScores(values: number[]): number[] {
  const n = values.length;
  if (n < 3) return values.map(() => 0);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return values.map((v) => (sd ? (v - mean) / sd : 0));
}

/** Was the task open at the end of `day`? */
export function openOn(task: Task, day: string): boolean {
  if (task.givenDate > day) return false;
  const closed = closedDay(task);
  return !closed || closed > day;
}

export type Kpis = {
  created: number;
  closed: number;
  netFlow: number;
  throughputPerWeek: number;
  onTimeRate: number | null;
  datedClosed: number;
  onTimeClosed: number;
  medianCycleDays: number | null;
  p85CycleDays: number | null;
  open: number;
  overdue: number;
  agingP90: number | null;
  stale: number;
  dueCoverage: number | null;
  unowned: number;
};

export function kpis(tasks: Task[], w: Window, today: string): Kpis {
  const created = tasks.filter((task) => inWindow(task.givenDate, w));
  const closed = tasks.filter((task) => inWindow(closedDay(task), w));
  const withDue = closed.filter((task) => task.dueDate);
  const onTime = withDue.filter((task) => closedDay(task) <= task.dueDate!);
  const cycles = closed.map((task) => Math.max(0, diffDays(task.givenDate, closedDay(task))));
  const asOf = w.end < today ? w.end : today;
  const open = tasks.filter((task) => openOn(task, asOf));
  const ages = open.map((task) => diffDays(task.givenDate, asOf));
  return {
    created: created.length,
    closed: closed.length,
    netFlow: created.length - closed.length,
    throughputPerWeek: Math.round((closed.length / w.days) * 7 * 10) / 10,
    onTimeRate: withDue.length ? onTime.length / withDue.length : null,
    datedClosed: withDue.length,
    onTimeClosed: onTime.length,
    medianCycleDays: median(cycles),
    p85CycleDays: percentile(cycles, 85),
    open: open.length,
    overdue: open.filter((task) => isOverdue("open", task.givenDate, asOf, task.flagAfterDays, task.longTerm) || (task.dueDate !== null && task.dueDate < asOf)).length,
    agingP90: percentile(ages, 90),
    stale: open.filter((task) => !task.longTerm && diffDays(task.givenDate, asOf) > 21).length,
    dueCoverage: open.length ? open.filter((task) => task.dueDate).length / open.length : null,
    unowned: open.filter((task) => task.ownerId === "unassigned").length,
  };
}

export type WeekRow = { start: string; end: string; created: number; closed: number; backlog: number };

/** Weekly created / closed and the backlog at the end of each week, oldest first. */
export function weeklySeries(tasks: Task[], today: string, weeks = 12): WeekRow[] {
  const rows: WeekRow[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = addDays(today, -i * 7);
    const start = addDays(end, -6);
    const w = { start, end, days: 7 };
    rows.push({
      start,
      end,
      created: tasks.filter((task) => inWindow(task.givenDate, w)).length,
      closed: tasks.filter((task) => inWindow(closedDay(task), w)).length,
      backlog: tasks.filter((task) => openOn(task, end)).length,
    });
  }
  return rows;
}

export type Projection = { weeks: { end: string; backlog: number }[]; trend: "growing" | "shrinking" | "flat"; weeksToClear: number | null; slopePerWeek: number; historyWeeks: number; enoughHistory: boolean };

/** Drop the weeks before HQ had any tasks, keeping at least `keep` weeks. */
export function trimLeadingEmpty(series: WeekRow[], keep = 4): WeekRow[] {
  const first = series.findIndex((row) => row.backlog > 0 || row.created > 0 || row.closed > 0);
  if (first < 0) return series.slice(-keep);
  return series.slice(Math.min(first, Math.max(0, series.length - keep)));
}

/** Fit the last 6 weeks of backlog and project 4 weeks ahead. */
export function projectBacklog(all: WeekRow[], ahead = 4): Projection {
  const first = all.findIndex((row) => row.backlog > 0 || row.created > 0 || row.closed > 0);
  const series = first < 0 ? all.slice(-1) : all.slice(first);
  const historyWeeks = first < 0 ? 0 : series.length;
  if (historyWeeks < 3) {
    return { weeks: [], trend: "flat", weeksToClear: null, slopePerWeek: 0, historyWeeks, enoughHistory: false };
  }
  const recent = series.slice(-6).map((row) => row.backlog);
  const fit = linearFit(recent);
  const last = series[series.length - 1];
  const weeks = Array.from({ length: ahead }, (_, i) => ({
    end: addDays(last.end, (i + 1) * 7),
    backlog: Math.max(0, Math.round(fit.intercept + fit.slope * (recent.length + i))),
  }));
  const slope = Math.round(fit.slope * 10) / 10;
  const tail = series.slice(-4);
  const closedRate = tail.reduce((a, row) => a + row.closed, 0) / Math.max(1, tail.length);
  const createdRate = tail.reduce((a, row) => a + row.created, 0) / Math.max(1, tail.length);
  const drain = closedRate - createdRate;
  return {
    weeks,
    trend: slope > 0.5 ? "growing" : slope < -0.5 ? "shrinking" : "flat",
    weeksToClear: drain > 0 ? Math.ceil(last.backlog / drain) : null,
    slopePerWeek: slope,
    historyWeeks,
    enoughHistory: true,
  };
}

export type PersonStat = {
  id: string;
  open: number;
  closed: number;
  created: number;
  onTimeRate: number | null;
  medianCycleDays: number | null;
  avgAgeDays: number | null;
  overdue: number;
  noDue: number;
  loadZ: number;
};

export function personStats(tasks: Task[], w: Window, today: string, ids: string[]): PersonStat[] {
  const rows = ids
    .filter((id) => !BUCKETS.has(id))
    .map((id) => {
      const mine = tasks.filter((task) => task.ownerId === id);
      const k = kpis(mine, w, today);
      const open = mine.filter((task) => task.status === "open");
      const ages = open.map((task) => diffDays(task.givenDate, today));
      return {
        id,
        open: open.length,
        closed: k.closed,
        created: k.created,
        onTimeRate: k.onTimeRate,
        medianCycleDays: k.medianCycleDays,
        avgAgeDays: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null,
        overdue: open.filter((task) => isOverdue("open", task.givenDate, today, task.flagAfterDays, task.longTerm) || (task.dueDate !== null && task.dueDate < today)).length,
        noDue: open.filter((task) => !task.dueDate).length,
        loadZ: 0,
      };
    })
    .filter((row) => row.open || row.closed || row.created);
  const z = zScores(rows.map((row) => row.open));
  rows.forEach((row, i) => (row.loadZ = Math.round(z[i] * 10) / 10));
  return rows.sort((a, b) => b.open - a.open);
}

export type BrandStat = { brand: BrandId | "none"; open: number; created: number; closed: number; closedPrev: number; overdue: number; share: number; momentum: number | null };

export function brandStats(tasks: Task[], w: Window, prev: Window, today: string): BrandStat[] {
  const keys = new Set<BrandId | "none">(tasks.map((task) => task.brand ?? "none"));
  const totalClosed = tasks.filter((task) => inWindow(closedDay(task), w)).length;
  return [...keys]
    .map((brand) => {
      const mine = tasks.filter((task) => (task.brand ?? "none") === brand);
      const closed = mine.filter((task) => inWindow(closedDay(task), w)).length;
      const closedPrev = mine.filter((task) => inWindow(closedDay(task), prev)).length;
      return {
        brand,
        open: mine.filter((task) => task.status === "open").length,
        created: mine.filter((task) => inWindow(task.givenDate, w)).length,
        closed,
        closedPrev,
        overdue: mine.filter((task) => task.status === "open" && (isOverdue("open", task.givenDate, today, task.flagAfterDays, task.longTerm) || (task.dueDate !== null && task.dueDate < today))).length,
        share: totalClosed ? closed / totalClosed : 0,
        momentum: closedPrev ? (closed - closedPrev) / closedPrev : null,
      };
    })
    .sort((a, b) => b.closed - a.closed || b.open - a.open);
}

export type Severity = "critical" | "warning" | "info";
export type Flag = { id: string; severity: Severity; title: string; detail: string; taskIds: string[]; target?: string };

function countSummary(events: TaskHistory[], pattern: RegExp): number {
  return events.filter((event) => pattern.test(event.summary)).length;
}

function lastEnteredWaiting(events: TaskHistory[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) if (/Moved to Waiting/.test(events[i].summary)) return events[i].at;
  return null;
}

/** Red flags and process loops, most serious first. */
export function findFlags(input: {
  tasks: Task[];
  history: Record<string, TaskHistory[]>;
  standups: Standup[];
  people: PersonStat[];
  brands: BrandStat[];
  w: Window;
  today: string;
  name: (id: string) => string;
}): Flag[] {
  const { tasks, history, standups, people, brands, w, today, name } = input;
  const open = tasks.filter((task) => task.status === "open");
  const flags: Flag[] = [];

  const lateOld = open.filter((task) => task.dueDate && diffDays(task.dueDate, today) > 7);
  if (lateOld.length) flags.push({ id: "late-week", severity: "critical", title: `${lateOld.length} ${lateOld.length === 1 ? "task is" : "tasks are"} more than a week past due`, detail: "Re-plan or close them; they distort every other number.", taskIds: lateOld.map((task) => task.id), target: "board" });

  const loose = open.filter((task) => task.ownerId === "unassigned" && diffDays(task.givenDate, today) >= 2);
  if (loose.length) flags.push({ id: "loose", severity: "critical", title: `${loose.length} ${loose.length === 1 ? "task has" : "tasks have"} had no owner for 2+ days`, detail: "Use Auto-balance on the Team board.", taskIds: loose.map((task) => task.id), target: "board" });

  for (const person of people) {
    if (person.loadZ >= 1.5 && person.open >= 6) flags.push({ id: `over-${person.id}`, severity: "warning", title: `${name(person.id)} carries far more open work than the team (${person.open} open)`, detail: `Load is ${person.loadZ} standard deviations above the team average. Move routine tasks to someone with room.`, taskIds: [], target: "board" });
    if (person.open >= 3 && person.closed === 0) flags.push({ id: `stall-${person.id}`, severity: "warning", title: `${name(person.id)} closed nothing in this period with ${person.open} open`, detail: "Check for blockers in the next standup.", taskIds: [], target: "board" });
  }

  const waiting = open.filter((task) => {
    if (task.lane !== "waiting") return false;
    const since = lastEnteredWaiting(history[task.id] ?? []);
    return since ? diffDays(stampToKolkataDay(since), today) >= 5 : diffDays(task.givenDate, today) >= 5;
  });
  if (waiting.length) flags.push({ id: "waiting", severity: "warning", title: `${waiting.length} ${waiting.length === 1 ? "task has" : "tasks have"} been Waiting for 5+ days`, detail: "Loop: nobody owns the thing they are waiting on. Name it in the note and chase it.", taskIds: waiting.map((task) => task.id), target: "board" });

  const pingPong = tasks.filter((task) => countSummary(history[task.id] ?? [], /^Reassigned|^Assigned to/) >= 3);
  if (pingPong.length) flags.push({ id: "pingpong", severity: "warning", title: `${pingPong.length} ${pingPong.length === 1 ? "task was" : "tasks were"} reassigned 3+ times`, detail: "Loop: ownership is unclear. Decide the owner once in the standup.", taskIds: pingPong.map((task) => task.id), target: "board" });

  const reopened = tasks.filter((task) => countSummary(history[task.id] ?? [], /^Reopened/) >= 2);
  if (reopened.length) flags.push({ id: "reopened", severity: "warning", title: `${reopened.length} ${reopened.length === 1 ? "task was" : "tasks were"} reopened twice or more`, detail: "Loop: done is being marked before the work is really done. Agree what done means.", taskIds: reopened.map((task) => task.id), target: "board" });

  const slipped = open.filter((task) => countSummary(history[task.id] ?? [], /^Due /) >= 3);
  if (slipped.length) flags.push({ id: "slipped", severity: "warning", title: `${slipped.length} ${slipped.length === 1 ? "deadline has" : "deadlines have"} moved 3+ times`, detail: "The plan keeps slipping; split the task or escalate.", taskIds: slipped.map((task) => task.id), target: "board" });

  const noDue = open.filter((task) => !task.dueDate && !task.longTerm);
  if (open.length && noDue.length / open.length > 0.4) flags.push({ id: "nodue", severity: "info", title: `${Math.round((noDue.length / open.length) * 100)}% of open tasks have no due date`, detail: "Loop: work with no date never shows as late, so it quietly ages.", taskIds: noDue.map((task) => task.id), target: "board" });

  const noBrand = open.filter((task) => !task.brand);
  if (open.length >= 5 && noBrand.length / open.length > 0.5) flags.push({ id: "nobrand", severity: "info", title: `${Math.round((noBrand.length / open.length) * 100)}% of open tasks have no brand`, detail: "Brand numbers are unreliable until most tasks carry a brand.", taskIds: noBrand.map((task) => task.id), target: "board" });

  const stale = open.filter((task) => !task.longTerm && diffDays(task.givenDate, today) > 21);
  if (stale.length) flags.push({ id: "stale", severity: "info", title: `${stale.length} ${stale.length === 1 ? "task is" : "tasks are"} older than 3 weeks`, detail: "Close, split or mark long-term.", taskIds: stale.map((task) => task.id), target: "board" });

  for (const brand of brands) {
    if (brand.brand !== "none" && brand.open >= 2 && brand.closed === 0) flags.push({ id: `brand-${brand.brand}`, severity: "info", title: `${brand.brand}: ${brand.open} open, nothing closed this period`, detail: "The brand has work but no progress.", taskIds: [], target: "board" });
  }

  const weekdays: string[] = [];
  for (let day = w.start; day <= (w.end < today ? w.end : today); day = addDays(day, 1)) {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow !== 0) weekdays.push(day);
  }
  const logged = new Set(standups.map((entry) => entry.date));
  const missing = weekdays.filter((day) => !logged.has(day));
  if (weekdays.length >= 3 && missing.length / weekdays.length > 0.5) flags.push({ id: "standups", severity: "info", title: `Standups logged on ${weekdays.length - missing.length} of ${weekdays.length} working days`, detail: "Loop: decisions made in huddles do not reach the board.", taskIds: [], target: "standups" });

  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return flags.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export type Suggestion = { title: string; why: string };

/** What to build or change next, based on the flags this week. */
export function suggestions(flags: Flag[], k: Kpis, projection: Projection): Suggestion[] {
  const out: Suggestion[] = [];
  const has = (id: string) => flags.some((flag) => flag.id === id || flag.id.startsWith(`${id}-`));
  if (has("nodue")) out.push({ title: "Make the due date required in quick assign", why: "Too many open tasks have no date, so lateness is invisible." });
  if (has("nobrand")) out.push({ title: "Make the brand required when assigning", why: "Most tasks have no brand, so brand progress cannot be compared." });
  if (has("waiting")) out.push({ title: "Add a \"waiting on\" field with an automatic reminder after 3 days", why: "Tasks sit in Waiting with no one chasing the blocker." });
  if (has("pingpong")) out.push({ title: "Require a reason when a task is reassigned", why: "Tasks bounce between owners." });
  if (has("reopened")) out.push({ title: "Add a short done checklist per task type", why: "Tasks get reopened after being marked done." });
  if (has("standups")) out.push({ title: "Daily standup reminder at 11:15 for the admins", why: "Fewer than half the working days have a standup logged." });
  if (has("loose")) out.push({ title: "Run Auto-balance automatically at the end of each standup", why: "New tasks wait days for an owner." });
  if (has("over") || has("stall")) out.push({ title: "Weekly 1:1 view per person with their aging tasks", why: "Load is uneven and some people are not closing work." });
  if (projection.trend === "growing") out.push({ title: "Set a weekly WIP limit per person", why: `The backlog grows by about ${projection.slopePerWeek} tasks a week.` });
  if (k.onTimeRate !== null && k.onTimeRate < 0.6) out.push({ title: "Show due-tomorrow nudges on My tasks", why: `Only ${Math.round(k.onTimeRate * 100)}% of dated tasks closed on time.` });
  if (!out.length) out.push({ title: "Keep the cadence", why: "No loops detected this period. Consider adding lead-to-task links next." });
  return out.slice(0, 5);
}
