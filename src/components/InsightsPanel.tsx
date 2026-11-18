import { formatDay, isOverdue, kolkataDay } from "../lib/dates";
import { buildInsights } from "../lib/insights";
import { useHqContext } from "../lib/hq";
import { buildHqNotes } from "../lib/observations";
import { KRAYA_BRANDS, KRAYA_LABEL } from "../lib/pipeline";
import { orgSeat } from "../lib/orbit";
import { rotationReports } from "../lib/rotation";
import { visibleTasks } from "../lib/tasks";
import { actorName } from "./TasksPanel";

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
      <h3 className="list-head">Observations</h3>
      {notes.observations.length === 0 ? <p className="empty">Nothing to flag from the current records.</p> : null}
      <ul className="mini">
        {notes.observations.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <h3 className="list-head">Recommendations</h3>
      {notes.recommendations.length === 0 ? <p className="empty">No recommendation from these counts.</p> : null}
      <ul className="mini">
        {notes.recommendations.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <p className="meta">Updated {formatDay(today)}. HQ insights.</p>
    </section>
  );
}
