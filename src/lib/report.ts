import { jsPDF } from "jspdf";
import { formatDay } from "./dates";
import type { InsightsModel } from "../components/InsightsPanel";

const INK: [number, number, number] = [16, 16, 24];
const MUTED: [number, number, number] = [96, 96, 116];
const LINE: [number, number, number] = [224, 224, 232];
const LIME: [number, number, number] = [198, 255, 61];
const CREATED: [number, number, number] = [75, 75, 216];
const CLOSED: [number, number, number] = [59, 122, 0];
const RED: [number, number, number] = [196, 30, 98];
const AMBER: [number, number, number] = [176, 110, 0];

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** One A4 page: KPIs, weekly flow, flags, suggestions, people and brands. */
export async function buildReportPdf(m: InsightsModel, brandLabel: (id: string) => string): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const L = 12;
  const R = W - 12;
  let y = 0;

  const text = (value: string, x: number, yy: number, size = 9, color = INK, bold = false, opts: { align?: "left" | "right" | "center"; maxWidth?: number } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(value, x, yy, opts);
  };
  const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

  // Header
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 24, "F");
  doc.setFillColor(...LIME);
  doc.circle(L + 3, 10, 3, "F");
  text("Luxsugero HQ", L + 9, 11.5, 13, [255, 255, 255], true);
  text(`Team report · ${formatDay(m.w.start)} to ${formatDay(m.w.end)} (${m.days} days)`, L + 9, 18, 9, [210, 210, 222]);
  text(`Generated ${formatDay(m.today)}`, R, 11.5, 8, [210, 210, 222], false, { align: "right" });
  y = 31;

  // Headline
  const k = m.k;
  const trend = !m.projection.enoughHistory ? "too little history to project" : m.projection.trend === "growing" ? `backlog growing ~${m.projection.slopePerWeek}/week` : m.projection.trend === "shrinking" ? `backlog shrinking ~${-m.projection.slopePerWeek}/week` : "backlog steady";
  text(`${k.closed} closed, ${k.created} created, ${k.open} open (${k.overdue} late) — ${trend}.`, L, y, 11, INK, true);
  y += 6;

  // KPI grid 4 x 2
  const tiles: [string, string, string][] = [
    ["Closed", String(k.closed), `prev ${m.kPrev.closed}`],
    ["Created", String(k.created), `net ${k.netFlow > 0 ? "+" : ""}${k.netFlow}`],
    ["Throughput", `${k.throughputPerWeek}/wk`, `prev ${m.kPrev.throughputPerWeek}/wk`],
    ["On time", pct(k.onTimeRate), k.datedClosed ? `${k.onTimeClosed} of ${k.datedClosed} dated tasks` : "no dated tasks closed"],
    ["Median days to close", k.medianCycleDays == null ? "—" : String(k.medianCycleDays), k.p85CycleDays == null ? "" : `85% within ${k.p85CycleDays}d`],
    ["Open now", String(k.open), `${k.overdue} late · ${k.unowned} no owner`],
    ["Oldest 10% open", k.agingP90 == null ? "—" : `${k.agingP90}d+`, `${k.stale} over 3 weeks`],
    ["With due date", pct(k.dueCoverage), "of open tasks"],
  ];
  const tw = (R - L - 9) / 4;
  tiles.forEach(([label, value, sub], i) => {
    const x = L + (i % 4) * (tw + 3);
    const yy = y + Math.floor(i / 4) * 19;
    doc.setFillColor(244, 244, 248);
    doc.roundedRect(x, yy, tw, 16, 2, 2, "F");
    text(label, x + 3, yy + 4.5, 7, MUTED);
    text(value, x + 3, yy + 11, 13, INK, true);
    text(sub, x + 3, yy + 14.5, 6.5, MUTED);
  });
  y += 41;

  // Weekly flow chart
  text("Work in and out, by week", L, y, 10, INK, true);
  doc.setFillColor(...CREATED);
  doc.rect(R - 46, y - 2.6, 3, 3, "F");
  text("Created", R - 42, y, 7, MUTED);
  doc.setFillColor(...CLOSED);
  doc.rect(R - 26, y - 2.6, 3, 3, "F");
  text("Closed", R - 22, y, 7, MUTED);
  y += 3;
  const ch = 30;
  const series = m.series;
  const max = Math.max(1, ...series.flatMap((row) => [row.created, row.closed]));
  const band = (R - L) / series.length;
  const bw = Math.min(3.5, band / 3);
  doc.setDrawColor(...LINE);
  doc.line(L, y + ch, R, y + ch);
  series.forEach((row, i) => {
    const cx = L + i * band + band / 2;
    const hc = (row.created / max) * (ch - 4);
    const hd = (row.closed / max) * (ch - 4);
    doc.setFillColor(...CREATED);
    doc.rect(cx - bw - 0.3, y + ch - hc, bw, hc, "F");
    doc.setFillColor(...CLOSED);
    doc.rect(cx + 0.3, y + ch - hd, bw, hd, "F");
    if (i % 2 === series.length % 2) text(formatDay(row.end).replace(/ \d{4}$/, ""), cx, y + ch + 4, 6, MUTED, false, { align: "center" });
  });
  y += ch + 9;

  // Flags | Suggestions side by side
  const colW = (R - L - 6) / 2;
  const startY = y;
  text("Red flags and loops", L, y, 10, INK, true);
  y += 5;
  const flags = m.flags.slice(0, 6);
  if (!flags.length) {
    text("No red flags this period.", L, y, 8, MUTED);
    y += 5;
  }
  for (const flag of flags) {
    const color = flag.severity === "critical" ? RED : flag.severity === "warning" ? AMBER : MUTED;
    text(flag.severity === "critical" ? "CRITICAL" : flag.severity === "warning" ? "WARNING" : "NOTE", L, y, 6.5, color, true);
    const lines = doc.splitTextToSize(flag.title, colW - 18) as string[];
    text(lines.slice(0, 2).join("\n"), L + 17, y, 7.5, INK);
    y += 3.6 * Math.min(2, lines.length) + 1.6;
  }
  let y2 = startY;
  const x2 = L + colW + 6;
  text("Suggested this week", x2, y2, 10, INK, true);
  y2 += 5;
  m.ideas.slice(0, 5).forEach((idea, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${idea.title}`, colW) as string[];
    text(lines.slice(0, 2).join("\n"), x2, y2, 7.5, INK, true);
    y2 += 3.6 * Math.min(2, lines.length);
    const why = doc.splitTextToSize(idea.why, colW - 4) as string[];
    text(why.slice(0, 2).join("\n"), x2 + 3, y2, 7, MUTED);
    y2 += 3.4 * Math.min(2, why.length) + 1.4;
  });
  y = Math.max(y, y2) + 3;

  // People table
  text("People", L, y, 10, INK, true);
  y += 4;
  const cols: [string, number, "left" | "right"][] = [["Person", L, "left"], ["Open", L + 62, "right"], ["Closed", L + 80, "right"], ["On time", L + 100, "right"], ["Median d", L + 120, "right"], ["Avg age", L + 140, "right"], ["Late", L + 156, "right"], ["Load", R, "right"]];
  doc.setFillColor(244, 244, 248);
  doc.rect(L, y - 3.2, R - L, 5, "F");
  cols.forEach(([label, x, align]) => text(label, x + (align === "left" ? 1 : -1), y, 7, MUTED, true, { align }));
  y += 4.6;
  for (const row of m.people.slice(0, 10)) {
    const load = row.loadZ >= 1.5 ? "Heavy" : row.loadZ <= -1 ? "Has room" : "Balanced";
    const cells = [clip(m.name(row.id), 34), String(row.open), String(row.closed), pct(row.onTimeRate), row.medianCycleDays == null ? "—" : String(row.medianCycleDays), row.avgAgeDays == null ? "—" : `${row.avgAgeDays}d`, String(row.overdue), load];
    cells.forEach((cell, i) => text(cell, cols[i][1] + (cols[i][2] === "left" ? 1 : -1), y, 7.5, i === 6 && row.overdue ? RED : INK, i === 0, { align: cols[i][2] }));
    doc.setDrawColor(...LINE);
    doc.line(L, y + 1.4, R, y + 1.4);
    y += 4.4;
  }
  y += 3;

  // Brands
  text("Brands", L, y, 10, INK, true);
  text(m.leading ? `${brandLabel(m.leading.brand)} is leading with ${m.leading.closed} closed.` : "No brand closed work this period.", R, y, 7.5, MUTED, false, { align: "right" });
  y += 4;
  const bmax = Math.max(1, ...m.brands.map((row) => row.closed));
  for (const row of m.brands.slice(0, 5)) {
    if (y > 284) break;
    text(brandLabel(row.brand), L, y, 7.5, INK, true);
    doc.setFillColor(236, 236, 242);
    doc.rect(L + 32, y - 2.6, 70, 3, "F");
    doc.setFillColor(...CLOSED);
    doc.rect(L + 32, y - 2.6, (row.closed / bmax) * 70, 3, "F");
    const mom = row.momentum == null ? "" : row.momentum > 0 ? ` · up ${Math.round(row.momentum * 100)}%` : row.momentum < 0 ? ` · down ${Math.round(-row.momentum * 100)}%` : " · steady";
    text(`${row.closed} closed · ${Math.round(row.share * 100)}% · ${row.open} open${row.overdue ? ` · ${row.overdue} late` : ""}${mom}`, L + 106, y, 7, MUTED);
    y += 4.6;
  }

  text("Luxsugero HQ · luxsugerostudios.github.io/Luxsugero-hq · counted from every task, its history and the standup log", W / 2, 292, 6.5, MUTED, false, { align: "center" });

  const filename = `HQ-report-${m.today}-${m.days}d.pdf`;
  return { blob: doc.output("blob"), filename };
}
