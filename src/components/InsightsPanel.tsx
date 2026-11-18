import { diffDays, formatDay, isOverdue, kolkataDay } from "../lib/dates";
import { buildInsights } from "../lib/insights";
import { useHqContext } from "../lib/hq";
import { buildHqNotes, type HqNotes } from "../lib/observations";
import { KRAYA_BRANDS, KRAYA_LABEL, type KrayaBrand } from "../lib/pipeline";
import type { Task } from "../lib/types";
import { orgSeat } from "../lib/orbit";
import { rotationReports } from "../lib/rotation";
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
function AttentionBoard({ tasks, today, notes }: { tasks: Task[]; today: string; notes: HqNotes }) {
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

export function InsightsPanel() {
  const { data } = useHqContext();
  const today = kolkataDay();
  const tasks = visibleTasks(data.tasks);
  const insights = buildInsights(tasks, data.people, data.leads, data.agents, data.brands, today);
  const notes = buildHqNotes({ tasks, people: data.people, pipelines: data.pipelines, today, names: true });
  const rotation = rotationReports(tasks, today);
  const maxDone = Math.max(1, ...insights.donePerDay.map((day) => day.count));
  const doneTotal = insights.donePerDay.reduce((sum, day) => sum + day.count, 0);
  const completion = insights.completionThisWeek == null ? null : Math.round(insights.completionThisWeek * 100);
  const overdueBrand = new Map<string, number>();
  for (const task of tasks) {
    if (!isOverdue(task.status, task.givenDate, today, task.flagAfterDays, task.longTerm)) continue;
    const key = task.brand ?? "none";
    overdueBrand.set(key, (overdueBrand.get(key) ?? 0) + 1);
  }

  return (
    <section aria-labelledby="insights-heading" className="pulse">
      <div className="section-head big-head">
        <h2 id="insights-heading">Insights</h2>
        <p className="meta">HQ insights. Every figure is counted from the records on this screen.</p>
      </div>
      <div className="bento">
        <article className="tile t-lime">
          <h3>Completion this week</h3>
          <p className="num huge">{completion == null ? "—" : `${completion}%`}</p>
          <p className="read">{completion == null ? "No open or closed tasks to measure." : `${insights.closedThisWeek} closed, ${insights.openCount} still open.`}</p>
        </article>
        <article className="tile t-blue">
          <h3>Average days to close</h3>
          <p className="num mid">{insights.averageDaysToClose ?? "—"}</p>
          <p>{insights.averageDaysToClose == null ? "No closed tasks yet." : "From the closed tasks in HQ."}</p>
        </article>
        <article className="tile t-panel">
          <h3>Open versus done</h3>
          <p className="meta">{insights.openCount} open now · {doneTotal} closed in 14 days</p>
          <svg className="spark" viewBox="0 0 280 60" role="img" aria-label={`${doneTotal} tasks closed over the last 14 days`}>
            {insights.donePerDay.map((day, index) => {
              const height = Math.max(3, (day.count / maxDone) * 50);
              return <rect key={day.day} x={index * 20 + 2} y={56 - height} width={14} height={height} rx={4} />;
            })}
          </svg>
        </article>
        <article className="tile t-pink">
          <h3>Overdue by person</h3>
          {insights.overdueByPerson.length === 0 ? <p>Nothing is overdue.</p> : null}
          <ul className="mini">
            {insights.overdueByPerson.map((row) => (
              <li key={row.personId}>
                <span>{orgSeat(row.personId)?.name ?? actorName(row.personId, data.people)}</span>
                <b>{row.count}</b>
              </li>
            ))}
          </ul>
        </article>
        <article className="tile t-orange">
          <h3>Overdue by brand</h3>
          {overdueBrand.size === 0 ? <p>No overdue tasks on a brand.</p> : null}
          <ul className="mini">
            {[...overdueBrand.entries()].map(([brand, count]) => (
              <li key={brand}>
                <span>{brand === "none" ? "No brand" : brand}</span>
                <b>{count}</b>
              </li>
            ))}
          </ul>
        </article>
        <article className="tile t-crew">
          <h3>Workload</h3>
          <div className="crew">
            {insights.workload.filter((row) => row.personId !== "unassigned").map((row) => (
              <div className="cr" key={row.personId}>
                <span>{orgSeat(row.personId)?.name ?? actorName(row.personId, data.people)}</span>
                <b>{row.count}</b>
              </div>
            ))}
          </div>
        </article>
        <article className="tile t-panel">
          <h3>Intern rotation</h3>
          <p className="meta">{rotation.daysLeft} days left</p>
          {rotation.interns.map((intern) => (
            <p key={intern.id} className="meta">
              {intern.name}: {intern.done} of {intern.total} done
              {intern.brands.map((row) => ` · ${row.brand} ${row.done}/${row.total}`).join("")}
            </p>
          ))}
        </article>
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
      <AttentionBoard tasks={tasks} today={today} notes={notes} />
      <p className="meta">Updated {formatDay(today)}. Counted from the records in HQ.</p>
    </section>
  );
}
