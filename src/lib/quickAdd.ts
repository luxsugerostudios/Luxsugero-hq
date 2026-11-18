import { addDays } from "./dates.ts";
import type { BrandId } from "./types.ts";

const BRANDS: BrandId[] = ["stays", "skybox", "fh", "braj"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

export type RosterName = { id: string; name: string };

export type QuickDraft = {
  title: string;
  ownerId: string | null;
  brand: BrandId | null;
  dueDate: string | null;
  longTerm: boolean;
};

function first(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

export function matchOwner(token: string, people: RosterName[]): string | null {
  const needle = token.trim().toLowerCase();
  if (!needle) return null;
  const hit = people.find((person) => first(person.name) === needle || person.name.toLowerCase() === needle);
  return hit?.id ?? null;
}

function nextWeekday(today: string, weekday: string): string {
  const target = WEEKDAYS.indexOf(weekday);
  const current = new Date(`${today}T00:00:00Z`).getUTCDay();
  const delta = (target - current + 7) % 7;
  return addDays(today, delta);
}

function dated(day: number, month: string, today: string): string | null {
  const monthIndex = MONTHS[month.toLowerCase()];
  if (monthIndex == null || day < 1 || day > 31) return null;
  const year = Number(today.slice(0, 4));
  const iso = new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
  return iso < today ? new Date(Date.UTC(year + 1, monthIndex, day)).toISOString().slice(0, 10) : iso;
}

/** Pull owner, brand, due date and long-term out of one task line. */
export function parseQuickAdd(raw: string, today: string, people: RosterName[]): QuickDraft {
  let text = raw.trim().replace(/^[-*]\s*/, "");
  let ownerId: string | null = null;
  const named = /^([A-Za-z][A-Za-z .'-]{0,40}?)\s*[:\-]\s+(.+)$/.exec(text);
  if (named) {
    const who = matchOwner(named[1], people);
    if (who) {
      ownerId = who;
      text = named[2];
    }
  }
  let brand: BrandId | null = null;
  let dueDate: string | null = null;
  let longTerm = false;
  const kept: string[] = [];
  for (const token of text.split(/\s+/)) {
    const bare = token.toLowerCase().replace(/[.,]/g, "");
    if (bare.startsWith("@")) {
      const who = matchOwner(bare.slice(1), people);
      if (who) {
        ownerId = who;
        continue;
      }
    }
    if (bare.startsWith("#") && BRANDS.includes(bare.slice(1) as BrandId)) {
      brand = bare.slice(1) as BrandId;
      continue;
    }
    if (bare === "long") {
      longTerm = true;
      continue;
    }
    if (bare === "today") {
      dueDate = today;
      continue;
    }
    if (bare === "tomorrow") {
      dueDate = addDays(today, 1);
      continue;
    }
    if (WEEKDAYS.includes(bare)) {
      dueDate = nextWeekday(today, bare);
      continue;
    }
    kept.push(token);
  }
  let title = kept.join(" ").trim();
  const date = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i.exec(title);
  if (date) {
    const iso = dated(Number(date[1]), date[2], today);
    if (iso) {
      dueDate = iso;
      title = title.replace(date[0], "").replace(/\s+/g, " ").trim();
    }
  }
  return { title, ownerId, brand, dueDate, longTerm };
}

export function parseStandup(notes: string, today: string, people: RosterName[]): QuickDraft[] {
  return notes
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseQuickAdd(line, today, people))
    .filter((draft) => draft.title.length > 0);
}
