import { formatDay, kolkataDay } from "../lib/dates";
import { buildInsights } from "../lib/insights";
import { useHqContext } from "../lib/hq";
import { actorName } from "./TasksPanel";
import { STAGE_LABEL } from "../lib/labels";

export function InsightsPanel() {
  const { data } = useHqContext();
  const today = kolkataDay();
  const insights = buildInsights(data.tasks, data.people, data.leads, data.agents, data.brands, today);
  const name = (personId: string) => actorName(personId, data.people);
  const doneTotal = insights.donePerDay.reduce((sum, day) => sum + day.count, 0);
  const maxDone = Math.max(1, ...insights.donePerDay.map((day) => day.count));
  const maxLoad = Math.max(1, ...insights.workload.map((row) => row.count));

  return (
    <section aria-labelledby="insights-heading">
      <div className="section-head">
        <h2 id="insights-heading">What you might be missing</h2>
      </div>
      <div className="insight-grid">
        <article className="brand-card">
          <h3>Overdue by person</h3>
          {insights.overdueByPerson.length === 0 ? <p className="empty">No overdue tasks.</p> : null}
          <ul>
            {insights.overdueByPerson.map((row) => (
              <li key={row.personId}>
                {name(row.personId)} · {row.count}
              </li>
            ))}
          </ul>
        </article>
        <article className="brand-card">
          <h3>Average days to close</h3>
          {insights.averageDaysToClose == null ? (
            <p className="empty">No closed tasks yet.</p>
          ) : (
            <p className="stat">
              <b>{insights.averageDaysToClose}</b>
              <span>days from given to closed</span>
            </p>
          )}
        </article>
        <article className="brand-card">
          <h3>Completion</h3>
          {insights.completionThisWeek == null ? (
            <p className="empty">No open or recently closed tasks.</p>
          ) : (
            <>
              <p>
                This week {Math.round(insights.completionThisWeek * 100)}% · {insights.closedThisWeek} closed,{" "}
                {insights.openCount} still open
              </p>
              <p className="meta">
                Last week{" "}
                {insights.completionLastWeek == null
                  ? "—"
                  : `${Math.round(insights.completionLastWeek * 100)}%`}{" "}
                · {insights.closedLastWeek} closed
              </p>
            </>
          )}
        </article>
        <article className="brand-card">
          <h3>Oldest open task</h3>
          {insights.oldestOpen ? (
            <p>
              {insights.oldestOpen.title} · {name(insights.oldestOpen.ownerId)} · given{" "}
              {formatDay(insights.oldestOpen.givenDate)}
            </p>
          ) : (
            <p className="empty">No open tasks.</p>
          )}
        </article>
        <article className="brand-card">
          <h3>No task today</h3>
          {insights.rosterMissing ? <p className="empty">No team roster yet.</p> : null}
          {!insights.rosterMissing && insights.peopleWithoutTaskToday.length === 0 ? (
            <p className="empty">Everyone has a task today.</p>
          ) : null}
          <ul>
            {insights.peopleWithoutTaskToday.map((personId) => (
              <li key={personId}>{name(personId)}</li>
            ))}
          </ul>
        </article>
        <article className="brand-card">
          <h3>No owner</h3>
          {insights.unowned.length === 0 ? <p className="empty">Every open task has an owner.</p> : null}
          <ul>
            {insights.unowned.map((task) => (
              <li key={task.id}>{task.title}</li>
            ))}
          </ul>
        </article>
        <article className="brand-card">
          <h3>Stale, 3+ days</h3>
          {insights.stale.length === 0 ? <p className="empty">Nothing has gone quiet.</p> : null}
          <ul>
            {insights.stale.map((task) => (
              <li key={task.id}>
                {task.title} · {name(task.ownerId)}
              </li>
            ))}
          </ul>
        </article>
        <article className="brand-card">
          <h3>Workload</h3>
          {insights.workload.length === 0 ? <p className="empty">No team roster yet.</p> : null}
          <ul className="bars">
            {insights.workload.map((row) => (
              <li key={row.personId}>
                <span>{name(row.personId)}</span>
                <span className="bar mini" aria-hidden="true">
                  <span className="seg seg-contacted" style={{ flexGrow: row.count || 0.001 }} />
                </span>
                <b>{row.count}</b>
              </li>
            ))}
          </ul>
          <p className="meta">Open tasks. Scale max {maxLoad}.</p>
        </article>
        <article className="brand-card">
          <h3>Done per day</h3>
          {doneTotal === 0 ? <p className="empty">No tasks closed in the last 14 days.</p> : null}
          <svg className="trend" viewBox="0 0 140 48" role="img" aria-label="Tasks closed each of the last 14 days">
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              points={insights.donePerDay
                .map((day, index) => `${index * 10 + 5},${44 - (day.count / maxDone) * 36}`)
                .join(" ")}
            />
          </svg>
        </article>
        <article className="brand-card">
          <h3>Skybox funnel</h3>
          {insights.skybox == null ? <p className="empty">No Skybox leads yet.</p> : null}
          <ul>
            {insights.skybox?.map((row) => (
              <li key={row.stage}>
                {STAGE_LABEL[row.stage]} · {row.count}
                {row.conversion == null ? "" : ` · ${Math.round(row.conversion * 100)}% from previous`}
              </li>
            ))}
          </ul>
          {insights.skyboxLost > 0 ? <p className="meta">{insights.skyboxLost} lost</p> : null}
        </article>
        <article className="brand-card">
          <h3>Waiting on founder</h3>
          {insights.agentsWaiting.length === 0 ? <p className="empty">No agent is waiting.</p> : null}
          <ul>
            {insights.agentsWaiting.map((agent) => (
              <li key={agent.id}>
                {agent.name}: {agent.waitingOnFounder.join("; ")}
              </li>
            ))}
          </ul>
        </article>
        <article className="brand-card">
          <h3>Paused or founder-led</h3>
          {insights.brandsHeld.length === 0 ? (
            <p className="empty">No brand is paused or founder-led.</p>
          ) : null}
          <ul>
            {insights.brandsHeld.map((brand) => (
              <li key={brand.id}>
                {brand.name} · {brand.status}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
