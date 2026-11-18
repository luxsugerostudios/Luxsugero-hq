import { diffDays } from "./dates.ts";
import { ORG, firstName, reportsToName, type OrgSeat } from "./orbit.ts";
import type { BrandId, Task } from "./types.ts";

/** Edit these when the next intern cohort starts. Day 45 is the end date. */
export const INTERN_ROTATION = {
  start: "2026-11-18",
  end: "2027-01-02",
};

const BRAND_NAME: Record<BrandId, string> = {
  skybox: "Skybox",
  stays: "Stays",
  fh: "F&H",
  braj: "Braj",
};

export type BrandTally = { brand: string; total: number; done: number };

export type InternReport = {
  id: string;
  name: string;
  title: string;
  reportsTo: string;
  total: number;
  done: number;
  brands: BrandTally[];
  strongest: string | null;
};

export function rotationInterns(org: OrgSeat[] = ORG): OrgSeat[] {
  return org.filter((seat) => /^intern\b/i.test(seat.title));
}

export function rotationClock(today: string, start = INTERN_ROTATION.start, end = INTERN_ROTATION.end) {
  const span = Math.max(1, diffDays(start, end));
  const rawDay = diffDays(start, today);
  const day = Math.min(span, Math.max(0, rawDay));
  const left = Math.max(0, diffDays(today, end));
  return { start, end, span, day, daysLeft: left };
}

function brandName(brand: Task["brand"]): string {
  return brand ? BRAND_NAME[brand] : "No brand";
}

/** Tasks given to an intern during the rotation, grouped by brand. */
export function rotationReports(
  tasks: Task[],
  today: string,
  options?: { start?: string; end?: string; interns?: OrgSeat[] },
): { start: string; end: string; day: number; daysLeft: number; interns: InternReport[] } {
  const start = options?.start ?? INTERN_ROTATION.start;
  const end = options?.end ?? INTERN_ROTATION.end;
  const clock = rotationClock(today, start, end);
  const interns = options?.interns ?? rotationInterns();
  return {
    start,
    end,
    day: clock.day,
    daysLeft: clock.daysLeft,
    interns: interns.map((seat) => {
      const mine = tasks.filter(
        (task) => task.ownerId === seat.id && task.givenDate >= start && task.givenDate <= end,
      );
      const byBrand = new Map<string, BrandTally>();
      for (const task of mine) {
        const key = brandName(task.brand);
        const row = byBrand.get(key) ?? { brand: key, total: 0, done: 0 };
        row.total += 1;
        if (task.status === "done") row.done += 1;
        byBrand.set(key, row);
      }
      const brands = [...byBrand.values()].sort((a, b) => b.done - a.done || b.total - a.total || a.brand.localeCompare(b.brand));
      const done = mine.filter((task) => task.status === "done").length;
      const strongest = brands.find((row) => row.done > 0)?.brand ?? null;
      return {
        id: seat.id,
        name: firstName(seat.name) || seat.name,
        title: seat.title,
        reportsTo: firstName(reportsToName(seat.reportsTo)) || reportsToName(seat.reportsTo),
        total: mine.length,
        done,
        brands,
        strongest,
      };
    }),
  };
}
