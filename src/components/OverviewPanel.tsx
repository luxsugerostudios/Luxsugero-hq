import { kolkataDay } from "../lib/dates";
import { buildInsights } from "../lib/insights";
import { useHqContext } from "../lib/hq";
import { visibleTasks } from "../lib/tasks";
import { BRAND_STATUS_LABEL } from "../lib/labels";
import { actorName } from "./TasksPanel";

export function OverviewPanel() {
  const { data } = useHqContext();
  const today = kolkataDay();
  const insights = buildInsights(
    visibleTasks(data.tasks),
    data.people,
    data.leads,
    data.agents,
    data.brands,
    today,
  );
  const name = (personId: string) => actorName(personId, data.people);
  const openRequests = data.inbox.filter((item) => item.status === "new").length;
  const overdueCount = insights.overdueByPerson.reduce((sum, row) => sum + row.count, 0);
  const doneTotal = insights.donePerDay.reduce((sum, day) => sum + day.count, 0);
  const maxDone = Math.max(1, ...insights.donePerDay.map((day) => day.count));
  const maxLoad = Math.max(1, ...insights.workload.map((row) => row.count));

  const attention: string[] = [];
  if (overdueCount === 0) attention.push("No overdue tasks.");
  else {
    const who = insights.overdueByPerson.map((row) => `${name(row.personId)} ${row.count}`).join(", ");
    attention.push(`${overdueCount} overdue ${overdueCount === 1 ? "task" : "tasks"}: ${who}.`);
  }
  if (insights.unowned.length === 0) attention.push("Every open task has an owner.");
  else attention.push(`${insights.unowned.length} open ${insights.unowned.length === 1 ? "task has" : "tasks have"} no owner.`);
  if (openRequests === 0) attention.push("No new requests in the main bucket.");
  else attention.push(`${openRequests} ${openRequests === 1 ? "request is" : "requests are"} still new in the main bucket.`);
  if (insights.stale.length > 0) {
    attention.push(`${insights.stale.length} open ${insights.stale.length === 1 ? "task has" : "tasks have"} not been updated in 3 or more days.`);
  }
  if (insights.averageDaysToClose == null) attention.push("No closed tasks yet, so there is no average close time.");
  else attention.push(`Closed tasks took ${insights.averageDaysToClose} days on average.`);

  return (
    <section aria-labelledby="overview-heading">
      <div className="section-head">
        <h2 id="overview-heading">Overview</h2>
      </div>
      <div className="stats">
        <Stat value={insights.openCount} label="Open" />
        <Stat value={overdueCount} label="Overdue" tone={overdueCount > 0 ? "bad" : undefined} />
        <Stat value={insights.unowned.length} label="Unassigned" />
        <Stat value={openRequests} label="New requests" />
        <Stat value={insights.closedThisWeek} label="Closed this week" />
      </div>
      <h3>Needs attention</h3>
      <ul className="attention">
        {attention.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h3>Brands</h3>
      {data.brands.length === 0 ? <p className="empty">No brand records yet.</p> : null}
      <div className="brand-row">
        {[...data.brands].sort((a, b) => a.order - b.order).map((brand) => (
          <article key={brand.id} className="brand-card">
            <header>
              <h3>{brand.name}</h3>
              <span className={`pill status-${brand.status}`}>{BRAND_STATUS_LABEL[brand.status]}</span>
            </header>
            <p className="meta">{brand.headlines.map((item) => `${item.label} ${item.value}`).join(" · ")}</p>
            {brand.waitingOnFounder.length > 0 ? <p>{brand.waitingOnFounder.join(" ")}</p> : null}
          </article>
        ))}
      </div>
      <h3>Workload</h3>
      {insights.workload.length === 0 ? <p className="empty">No team roster yet.</p> : null}
      <ul className="bars">
        {insights.workload.map((row) => (
          <li key={row.personId}>
            <span>{name(row.personId)}</span>
            <span className="bar mini" aria-hidden="true">
              <span className="seg" style={{ width: `${(row.count / maxLoad) * 100}%` }} />
            </span>
            <b>{row.count}</b>
          </li>
        ))}
      </ul>
      <h3>Closed per day</h3>
      {doneTotal === 0 ? <p className="empty">No tasks closed in the last 14 days.</p> : null}
      <svg className="trend" viewBox="0 0 280 80" role="img" aria-label="Tasks closed on each of the last 14 days">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={insights.donePerDay
            .map((day, index) => `${8 + index * 20},${68 - (day.count / maxDone) * 52}`)
            .join(" ")}
        />
        {insights.donePerDay.map((day, index) => (
          <text key={day.day} x={8 + index * 20} y={78} textAnchor="middle">
            {index % 2 === 0 ? day.day.slice(8) : ""}
          </text>
        ))}
      </svg>
      <h3>Skybox</h3>
      {insights.skybox == null ? <p className="empty">No Skybox leads yet.</p> : null}
      {insights.skybox ? (
        <table className="plain">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Count</th>
              <th>From previous</th>
            </tr>
          </thead>
          <tbody>
            {insights.skybox.map((row) => (
              <tr key={row.stage}>
                <td>{row.stage.replaceAll("_", " ")}</td>
                <td>{row.count}</td>
                <td>{row.conversion == null ? "—" : `${Math.round(row.conversion * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {insights.skyboxLost > 0 ? <p className="meta">{insights.skyboxLost} lost.</p> : null}
    </section>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "bad" }) {
  return (
    <p className={`stat${tone ? ` ${tone}` : ""}`}>
      <b>{value}</b>
      <span>{label}</span>
    </p>
  );
}
