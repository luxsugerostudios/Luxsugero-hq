import { useState } from "react";
import { diffDays, formatDay, isOverdue, kolkataDay } from "../lib/dates";
import { PERIODS, brandStats, findFlags, kpis, personStats, projectBacklog, suggestions, trimLeadingEmpty, weeklySeries, windowFor, type PeriodId } from "../lib/analytics";
import { BacklogChart, BrandBars, FlowChart, Timeline } from "./insights/Charts";
import { PersonReview } from "./insights/PersonReview";
import { TaskDrawer } from "./ui/TaskDrawer";
import { useHqContext } from "../lib/hq";
import { buildHqNotes, type HqNotes } from "../lib/observations";
import { KRAYA_BRANDS, KRAYA_LABEL, type KrayaBrand } from "../lib/pipeline";
import type { Task } from "../lib/types";
import { ORG, orgSeat } from "../lib/orbit";
import { visibleTasks } from "../lib/tasks";
import { actorName } from "./TasksPanel";

type PersonFlag = { id: string; name: string; late: Task[]; stuck: Task[] };

function go(hash: string) {
  window.location.hash = hash;
  window.scrollTo({ top: 0 });
}

/**
 * The same facts as the HQ notes, grouped so each person, pipeline gap and
 * next step reads as one card with the tasks behind it and a way to act.
 */
function AttentionBoard({ tasks, today, notes, showPeople = true }: { tasks: Task[]; today: string; notes: HqNotes; showPeople?: boolean }) {
  const { data } = useHqContext();
  const open = tasks.filter((task) => task.status === "open");
  const byPerson = new Map<string, PersonFlag>();
  const flag = (task: Task) => {
    const id = task.ownerId;
    if (!byPerson.has(id)) {
      const name = id === "unassigned" ? "No owner" : orgSeat(id)?.name ?? actorName(id, data.people);
      byPerson.set(id, { id, name, late: [], stuck: [] });
    }
    return byPerson.get(id)!;
  };
  for (const task of open) {
    const late = isOverdue(task.status, task.givenDate, today, task.flagAfterDays, task.longTerm);
    const stuck = diffDays(task.givenDate, today) > 7;
    if (late) flag(task).late.push(task);
    else if (stuck) flag(task).stuck.push(task);
  }
  const people = [...byPerson.values()].sort(
    (a, b) => (a.id === "unassigned" ? -1 : b.id === "unassigned" ? 1 : 0) || b.late.length + b.stuck.length - (a.late.length + a.stuck.length),
  );
  const unowned = open.filter((task) => task.ownerId === "unassigned").length;

  const gaps = data.pipelines.flatMap((board) => {
    const brand = board.id in KRAYA_LABEL ? KRAYA_LABEL[board.id as KrayaBrand] : board.brand;
    const sum = (pattern: RegExp) => {
      const rows = board.stages.filter((stage) => pattern.test(stage.name));
      return rows.length ? rows.reduce((total, row) => total + row.count, 0) : null;
    };
    const out: { key: string; brand: string; from: string; fromCount: number; to: string; action: string }[] = [];
    const quotes = sum(/quote/i);
    const deposits = sum(/deposit/i);
    if (quotes && deposits === 0) out.push({ key: `${board.id}-q`, brand, from: "Quotes sent", fromCount: quotes, to: "Deposits", action: "Follow up the quotes already sent." });
    const qualified = sum(/qualified|good lead/i);
    const visits = sum(/site visit|visit/i);
    if (qualified && visits === 0) out.push({ key: `${board.id}-v`, brand, from: "Qualified leads", fromCount: qualified, to: "Site visits", action: "Schedule site visits for leads already in the funnel." });
    return out;
  });

  const steps: { text: string; action: string; target: string }[] = [];
  if (unowned) steps.push({ text: `Give the ${unowned} unowned ${unowned === 1 ? "task" : "tasks"} an owner`, action: "Open triage", target: "inbox" });
  if (people.some((person) => person.late.length || person.stuck.length)) steps.push({ text: "Review late and stuck work with each owner", action: "Open team board", target: "board" });
  for (const gap of gaps) steps.push({ text: `${gap.brand}: ${gap.action.charAt(0).toLowerCase()}${gap.action.slice(1)}`, action: "Open pipeline", target: "pipeline" });

  if (!people.length && !gaps.length && !notes.observations.length) {
    return <p className="empty">Nothing needs attention right now.</p>;
  }

  return (
    <div className="attn">
      {showPeople ? (
      <section className="attn-block" aria-labelledby="attn-people">
        <div className="attn-head">
          <h3 id="attn-people">Who needs a nudge</h3>
          <p className="meta">Late work first, then tasks open more than 7 days.</p>
        </div>
        {people.length === 0 ? <p className="empty">Everyone is on track.</p> : null}
        <div className="attn-people">
          {people.map((person) => {
            const list = [...person.late, ...person.stuck];
            return (
              <article key={person.id} className={`attn-person${person.id === "unassigned" ? " is-unowned" : ""}`}>
                <header>
                  <h4>{person.name}</h4>
                  <div className="attn-chips">
                    {person.late.length ? <span className="attn-chip late">{person.late.length} late</span> : null}
                    {person.stuck.length ? <span className="attn-chip stuck">{person.stuck.length} open 7+ days</span> : null}
                  </div>
                </header>
                <ul>
                  {list.slice(0, 3).map((task) => (
                    <li key={task.id}>
                      <span title={task.title}>{task.title}</span>
                      <em>{diffDays(task.givenDate, today)}d</em>
                    </li>
                  ))}
                </ul>
                {list.length > 3 ? <p className="meta">+{list.length - 3} more</p> : null}
              </article>
            );
          })}
        </div>
      </section>
      ) : null}

      {gaps.length ? (
        <section className="attn-block" aria-labelledby="attn-pipe">
          <div className="attn-head">
            <h3 id="attn-pipe">Where the pipeline stalls</h3>
            <p className="meta">From the latest Kraya sync.</p>
          </div>
          <div className="attn-gaps">
            {gaps.map((gap) => (
              <article key={gap.key} className="attn-gap">
                <p className="attn-brand">{gap.brand}</p>
                <div className="attn-flow">
                  <div><b>{gap.fromCount}</b><span>{gap.from}</span></div>
                  <i aria-hidden="true" />
                  <div className="zero"><b>0</b><span>{gap.to}</span></div>
                </div>
                <p>{gap.action}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {steps.length ? (
        <section className="attn-block" aria-labelledby="attn-next">
          <div className="attn-head">
            <h3 id="attn-next">Next steps</h3>
          </div>
          <ol className="attn-steps">
            {steps.map((step) => (
              <li key={step.text}>
                <span>{step.text}</span>
                <button type="button" className="ghost" onClick={() => go(step.target)}>{step.action}</button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

export type InsightsModel = ReturnType<typeof useInsightsModel>;

function pct(v: number | null) {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function delta(now: number, before: number, better: "up" | "down") {
  if (now === before) return { text: "same as before", tone: "flat" as const };
  const diff = now - before;
  const good = better === "up" ? diff > 0 : diff < 0;
  return { text: `${diff > 0 ? "+" : ""}${diff} vs previous`, tone: good ? ("good" as const) : ("bad" as const) };
}

export function useInsightsModel(period: PeriodId) {
  const { data } = useHqContext();
  const today = kolkataDay();
  const days = PERIODS.find((item) => item.id === period)!.days;
  const tasks = visibleTasks(data.tasks);
  const w = windowFor(today, days);
  const prev = windowFor(today, days, 1);
  const name = (id: string) => (id === "unassigned" ? "No owner" : orgSeat(id)?.name ?? actorName(id, data.people));
  const k = kpis(tasks, w, today);
  const kPrev = kpis(tasks, prev, today);
  const weeks = Math.max(8, Math.min(13, Math.ceil(days / 7) + 4));
  const fullSeries = weeklySeries(tasks, today, weeks);
  const projection = projectBacklog(fullSeries);
  const series = trimLeadingEmpty(fullSeries);
  const ids = [...new Set([...ORG.map((seat) => seat.id), ...data.people.map((person) => person.id)])];
  const people = personStats(tasks, w, today, ids);
  const brands = brandStats(tasks, w, prev, today);
  const flags = findFlags({ tasks, history: data.history, standups: data.standups, people, brands, w, today, name });
  const ideas = suggestions(flags, k, projection);
  const leading = brands.find((row) => row.brand !== "none" && row.closed > 0);
  return { today, days, w, prev, k, kPrev, series, projection, people, brands, flags, ideas, leading, name, tasks };
}

export function InsightsPanel() {
  const { data } = useHqContext();
  const [period, setPeriod] = useState<PeriodId>("15");
  const [busy, setBusy] = useState<"" | "pdf" | "send">("");
  const [note, setNote] = useState("");
  const [drawer, setDrawer] = useState<string | null>(null);
  const m = useInsightsModel(period);
  const { k, kPrev, today } = m;
  const tasks = m.tasks;
  const notes = buildHqNotes({ tasks, people: data.people, pipelines: data.pipelines, today, names: true });
  const brandLabel = (id: string) => (id === "none" ? "No brand" : id === "fh" ? "Forest Hills" : id === "skybox" ? "Skybox" : id === "stays" ? "Stays" : id === "braj" ? "Braj Murliwala" : id);
  const groups = m.people
    .filter((row) => row.open > 0)
    .map((row) => ({
      id: row.id,
      name: m.name(row.id),
      tasks: tasks.filter((task) => task.status === "open" && task.ownerId === row.id).sort((a, b) => a.givenDate.localeCompare(b.givenDate)),
    }));

  async function report(kind: "pdf" | "send") {
    setBusy(kind);
    setNote("");
    try {
      const { buildReportPdf } = await import("../lib/report");
      const { blob, filename } = await buildReportPdf(m, brandLabel);
      const file = new File([blob], filename, { type: "application/pdf" });
      if (kind === "send" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Luxsugero HQ report", text: `HQ report, ${PERIODS.find((p) => p.id === period)!.label.toLowerCase()} to ${formatDay(today)}` });
        setNote("Shared.");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
        setNote(kind === "send" ? "This browser cannot share files directly, so the PDF was downloaded. Attach it to an email or WhatsApp." : `Downloaded ${filename}.`);
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") setNote("Could not build the report. Try again.");
    } finally {
      setBusy("");
    }
  }

  const tiles = [
    { label: "Closed", value: String(k.closed), sub: delta(k.closed, kPrev.closed, "up") },
    { label: "Created", value: String(k.created), sub: { text: `net ${k.netFlow > 0 ? "+" : ""}${k.netFlow} to the backlog`, tone: k.netFlow > 0 ? ("bad" as const) : ("good" as const) } },
    { label: "Throughput", value: `${k.throughputPerWeek}/wk`, sub: delta(k.throughputPerWeek, kPrev.throughputPerWeek, "up") },
    { label: "On time", value: pct(k.onTimeRate), sub: { text: k.datedClosed ? `${k.onTimeClosed} of ${k.datedClosed} dated tasks closed on time` : "no dated tasks closed", tone: k.onTimeRate != null && k.onTimeRate < 0.6 ? ("bad" as const) : ("flat" as const) } },
    { label: "Median days to close", value: k.medianCycleDays == null ? "—" : String(k.medianCycleDays), sub: { text: k.p85CycleDays == null ? "no closed tasks" : `85% close within ${k.p85CycleDays} days`, tone: "flat" as const } },
    { label: "Open now", value: String(k.open), sub: { text: `${k.overdue} late · ${k.unowned} no owner`, tone: k.overdue ? ("bad" as const) : ("good" as const) } },
    { label: "Oldest 10% of open work", value: k.agingP90 == null ? "—" : `${k.agingP90}d+`, sub: { text: `${k.stale} open over 3 weeks`, tone: k.stale ? ("bad" as const) : ("good" as const) } },
    { label: "Open with a due date", value: pct(k.dueCoverage), sub: { text: "the rest can't go late", tone: (k.dueCoverage ?? 1) < 0.6 ? ("bad" as const) : ("flat" as const) } },
  ];

  return (
    <section aria-labelledby="insights-heading" className="pulse ix">
      <div className="section-head big-head">
        <div>
          <h2 id="insights-heading">Insights</h2>
          <p className="meta">{formatDay(m.w.start)} to {formatDay(m.w.end)}, compared with the {m.days} days before. Counted from every task, its history and the standup log.</p>
        </div>
        <div className="ix-actions">
          <label>
            Period
            <select value={period} onChange={(event) => setPeriod(event.target.value as PeriodId)}>
              {PERIODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <button type="button" className="ghost" disabled={busy !== ""} onClick={() => void report("pdf")}>{busy === "pdf" ? "Building…" : "Download PDF"}</button>
          <button type="button" className="primary" disabled={busy !== ""} onClick={() => void report("send")}>{busy === "send" ? "Building…" : "Send report"}</button>
        </div>
      </div>
      {note ? <p className="ix-note" role="status">{note}</p> : null}

      <div className="ix-kpis">
        {tiles.map((tile) => (
          <article key={tile.label} className="ix-kpi">
            <h3>{tile.label}</h3>
            <p className="ix-num">{tile.value}</p>
            <p className={`ix-sub ${tile.sub.tone}`}>{tile.sub.text}</p>
          </article>
        ))}
      </div>

      <div className="ix-two">
        <article className="ix-card">
          <h3>Work in and out, by week</h3>
          <FlowChart series={m.series} />
        </article>
        <article className="ix-card">
          <h3>Backlog and projection</h3>
          <p className="meta">
            {!m.projection.enoughHistory
              ? `HQ has ${m.projection.historyWeeks} ${m.projection.historyWeeks === 1 ? "week" : "weeks"} of history so far. The projection starts once there are 3.`
              : m.projection.trend === "growing"
              ? `Growing by about ${m.projection.slopePerWeek} a week. At this rate about ${m.projection.weeks[m.projection.weeks.length - 1]?.backlog} will be open in 4 weeks.`
              : m.projection.trend === "shrinking"
                ? `Shrinking by about ${-m.projection.slopePerWeek} a week${m.projection.weeksToClear ? `; clear in about ${m.projection.weeksToClear} weeks at the current pace` : ""}.`
                : "Holding steady."}
          </p>
          <BacklogChart series={m.series} projection={m.projection} />
        </article>
      </div>

      <div className="ix-two">
        <article className="ix-card">
          <h3>Red flags and loops</h3>
          {m.flags.length === 0 ? <p className="empty">No red flags this period.</p> : null}
          <ul className="ix-flags">
            {m.flags.map((flag) => (
              <li key={flag.id} className={`sev-${flag.severity}`}>
                <span className="ix-sev">{flag.severity === "critical" ? "● Critical" : flag.severity === "warning" ? "▲ Warning" : "■ Note"}</span>
                <div>
                  <b>{flag.title}</b>
                  <p>{flag.detail}</p>
                </div>
                {flag.target ? <button type="button" className="ghost" onClick={() => go(flag.target!)}>Open</button> : null}
              </li>
            ))}
          </ul>
        </article>
        <article className="ix-card">
          <h3>Suggested this week</h3>
          <p className="meta">What to change or build next, based on the patterns above.</p>
          <ol className="ix-ideas">
            {m.ideas.map((idea) => (
              <li key={idea.title}><b>{idea.title}</b><span>{idea.why}</span></li>
            ))}
          </ol>
          {notes.observations.length ? (
            <>
              <h4>Notes</h4>
              <ul className="ix-notes">{notes.observations.slice(0, 4).map((line) => <li key={line}>{line}</li>)}</ul>
            </>
          ) : null}
        </article>
      </div>

      <PersonReview today={today} onOpen={setDrawer} />

      <article className="ix-card">
        <h3>People</h3>
        <div className="ix-table-wrap">
          <table className="ix-table">
            <thead>
              <tr><th>Person</th><th>Open</th><th>Closed</th><th>On time</th><th>Median days</th><th>Avg age of open</th><th>Late</th><th>No due date</th><th>Load</th></tr>
            </thead>
            <tbody>
              {m.people.map((row) => (
                <tr key={row.id}>
                  <td>{m.name(row.id)}</td>
                  <td>{row.open}</td>
                  <td>{row.closed}</td>
                  <td>{pct(row.onTimeRate)}</td>
                  <td>{row.medianCycleDays ?? "—"}</td>
                  <td>{row.avgAgeDays == null ? "—" : `${row.avgAgeDays}d`}</td>
                  <td className={row.overdue ? "bad" : undefined}>{row.overdue}</td>
                  <td>{row.noDue}</td>
                  <td>
                    <span className={`ix-load ${row.loadZ >= 1.5 ? "high" : row.loadZ <= -1 ? "low" : "mid"}`}>
                      {row.loadZ >= 1.5 ? "▲ Heavy" : row.loadZ <= -1 ? "▽ Has room" : "Balanced"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <div className="ix-two">
        <article className="ix-card">
          <h3>Brands</h3>
          <p className="meta">{m.leading ? `${brandLabel(m.leading.brand)} is leading with ${m.leading.closed} closed this period.` : "No brand closed work this period."}</p>
          <BrandBars rows={m.brands.map((row) => ({ label: brandLabel(row.brand), closed: row.closed, share: row.share, open: row.open, overdue: row.overdue, momentum: row.momentum }))} />
        </article>
        <article className="ix-card">
          <h3>Timeline of open work</h3>
          <Timeline groups={groups} today={today} />
        </article>
      </div>

      <div className="bento">
        {KRAYA_BRANDS.map((id) => {
          const board = data.pipelines.find((item) => item.id === id) ?? null;
          const max = Math.max(1, ...(board?.stages.map((row) => row.count) ?? [1]));
          return (
            <article key={id} className="tile t-orange">
              <h3>{KRAYA_LABEL[id]} funnel</h3>
              {!board ? <p>Waiting for Kraya sync</p> : null}
              <div className="funnel-bars">
                {board?.stages.map((row) => (
                  <div className="fr" key={row.name}>
                    <span>{row.name}</span>
                    <span className="fbar"><span style={{ width: `${(row.count / max) * 100}%` }} /></span>
                    <b>{row.count}</b>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      <AttentionBoard tasks={tasks} today={today} notes={notes} showPeople={false} />
      <p className="meta">Updated {formatDay(today)}. Counted from the records in HQ.</p>
      {drawer ? <TaskDrawer taskId={drawer} onClose={() => setDrawer(null)} /> : null}
    </section>
  );
}
