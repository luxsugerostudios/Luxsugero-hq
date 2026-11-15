const DAY = 86_400_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar day in Asia/Kolkata, as YYYY-MM-DD. */
export function kolkataDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function utcMidnight(isoDate: string): number {
  const match = DATE.exec(isoDate);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Whole calendar days from `fromIso` to `toIso`. Negative when `toIso` is earlier. */
export function diffDays(fromIso: string, toIso: string): number {
  const start = utcMidnight(fromIso);
  const end = utcMidnight(toIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / DAY);
}

export function daysOpen(givenDate: string, today: string): number {
  return Math.max(0, diffDays(givenDate, today));
}

/** Open for more than 3 calendar days. A task given today is day 0. */
export function isOverdue(status: string, givenDate: string, today: string): boolean {
  return status === "open" && diffDays(givenDate, today) > 3;
}

/** Still open after the day it was given. */
export function isCarriedForward(
  status: string,
  givenDate: string,
  today: string,
): boolean {
  return status === "open" && diffDays(givenDate, today) > 0;
}

export function weekBounds(todayIso: string): { start: string; end: string } {
  const midnight = utcMidnight(todayIso);
  if (Number.isNaN(midnight)) return { start: todayIso, end: todayIso };
  const day = new Date(midnight).getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = midnight + mondayOffset * DAY;
  return { start: toIso(start), end: toIso(start + 6 * DAY) };
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function stampToKolkataDay(stamp: string): string {
  if (DATE.test(stamp)) return stamp;
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime())) return "";
  return kolkataDay(parsed);
}

export function closedThisWeek(
  status: string,
  closedAt: string | null,
  today: string,
): boolean {
  if (status !== "done" || !closedAt) return false;
  const day = stampToKolkataDay(closedAt);
  if (!day) return false;
  const bounds = weekBounds(today);
  return day >= bounds.start && day <= bounds.end;
}

export function formatDay(iso: string): string {
  const ms = utcMidnight(iso);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

export function formatStamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(parsed);
}
