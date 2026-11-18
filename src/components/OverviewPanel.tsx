import { useEffect, useRef, type ReactNode } from "react";
import { AgentOrbit } from "./AgentOrbit";
import { diffDays, formatStamp, kolkataDay } from "../lib/dates";
import { buildInsights } from "../lib/insights";
import { useHqContext } from "../lib/hq";
import { visibleTasks } from "../lib/tasks";
import { BRAND_STATUS_LABEL } from "../lib/labels";
import { BRAND_COLOR, BUCKET_IDS, loadLevel, orgSeat } from "../lib/orbit";
import { rotationReports } from "../lib/rotation";
import { actorName } from "./TasksPanel";

void import("../lib/orbitScene");

type Signal = { kind: "risk" | "signal" | "info"; text: string };

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function go(hash: string) {
  window.location.hash = hash;
  window.scrollTo({ top: 0 });
}

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
  const unownedCount = insights.unowned.length;
  const owned = insights.openCount - unownedCount;
  const people = insights.workload.filter((row) => !BUCKET_IDS.has(row.personId));
  const crew = [...people].sort((a, b) => b.count - a.count);
  const heaviest = crew[0];
  const lightest = crew[crew.length - 1];
  const maxLoad = Math.max(1, ...insights.workload.map((row) => row.count));
  const doneTotal = insights.donePerDay.reduce((sum, day) => sum + day.count, 0);
  const maxDone = Math.max(1, ...insights.donePerDay.map((day) => day.count));
  const weekDelta = insights.closedThisWeek - insights.closedLastWeek;
  const syncing = data.agents.filter((agent) => agent.focus.trim().toLowerCase() === "awaiting first sync").length;
  const skyboxBrand = data.brands.find((brand) => brand.id === "skybox");
  const kraya = data.pipelines.find((board) => board.id === "skybox") ?? null;
  const funnelMax = Math.max(1, ...(kraya?.stages.map((row) => row.count) ?? [1]));
  const rotation = rotationReports(visibleTasks(data.tasks), today);

  const openRead = (() => {
    const parts: string[] = [];
    if (insights.openCount === 0) return "Nothing is open. A rare quiet day.";
    if (unownedCount > 0) {
      parts.push(`${unownedCount} of ${insights.openCount} open tasks have no owner.`);
    } else {
      parts.push("Every open task has an owner.");
    }
    if (heaviest && owned > 0 && heaviest.count > 0) {
      parts.push(`${name(heaviest.personId)} carries ${heaviest.count} of the ${owned} owned ones.`);
    }
    if (lightest && heaviest && lightest.personId !== heaviest.personId) {
      parts.push(`${name(lightest.personId)} has ${lightest.count}.`);
    }
    if (unownedCount > 0) parts.push("Balance them in the Agents orbit.");
    return parts.join(" ");
  })();

  const signals: Signal[] = [];
  if (overdueCount > 0) {
    const unownedOverdue = insights.overdueByPerson.find((row) => row.personId === "unassigned")?.count ?? 0;
    signals.push({
      kind: "risk",
      text: `${plural(overdueCount, "task", "tasks")} overdue${unownedOverdue ? `, ${unownedOverdue} with no owner` : ""}`,
    });
  }
  if (heaviest && heaviest.count >= 5) signals.push({ kind: "signal", text: `${name(heaviest.personId)} holds ${heaviest.count} open tasks` });
  crew.filter((row) => row.count === 0).forEach((row) => signals.push({ kind: "signal", text: `${name(row.personId)} has no open tasks` }));
  if (skyboxBrand) {
    const warm = skyboxBrand.headlines.find((item) => /warm/i.test(item.label))?.value;
    const deposits = skyboxBrand.headlines.find((item) => /deposit/i.test(item.label))?.value;
    if (warm && deposits === "0") signals.push({ kind: "risk", text: `Luxskybox: ${warm} warm leads, 0 deposits` });
  }
  if (insights.averageDaysToClose != null) signals.push({ kind: "info", text: `Tasks close in ${insights.averageDaysToClose} days on average` });
  if (insights.stale.length > 0) signals.push({ kind: "risk", text: `${plural(insights.stale.length, "task", "tasks")} untouched for 3+ days` });
  signals.push({ kind: "info", text: openRequests ? `${plural(openRequests, "new request", "new requests")} in the main bucket` : "No new requests in the main bucket" });
  if (syncing > 0) signals.push({ kind: "info", text: `${plural(syncing, "AI agent", "AI agents")} waiting for first sync` });

  return (
    <section aria-labelledby="overview-heading" className="pulse">
      <AgentOrbit />
      <Ticker signals={signals} />
      <div className="section-head big-head">
        <h2 id="overview-heading">Studio pulse</h2>
        <p className="meta">Every number comes with what it means. Figures update live from HQ.</p>
      </div>

      <div className="bento">
        <Tile className="t-lime">
          <h3>Open tasks</h3>
          <p className="num huge">{insights.openCount}</p>
          <div className="split" aria-hidden="true">
            <span style={{ width: `${insights.openCount ? (owned / insights.openCount) * 100 : 0}%`, background: "var(--on-lime)" }} />
            <span style={{ width: `${insights.openCount ? (unownedCount / insights.openCount) * 100 : 0}%`, background: "var(--pink)" }} />
          </div>
          <p className="legend">
            <span><i style={{ background: "var(--on-lime)" }} /><b>{owned}</b> owned</span>
            <span><i style={{ background: "var(--pink)" }} /><b>{unownedCount}</b> no owner</span>
          </p>
          <div className="stats3">
            <div><p className="num">{insights.stale.length}</p><span>untouched 3+ days</span></div>
            <div><p className="num">{openRequests}</p><span>new requests</span></div>
          </div>
          <p className="read">{openRead}</p>
        </Tile>

        <Tile className="t-pink">
          <h3>Overdue</h3>
          <p className="num mid">{overdueCount}</p>
          {overdueCount === 0 ? <p>Nothing is late.</p> : null}
          <ul className="mini">
            {insights.overdueByPerson.map((row) => (
              <li key={row.personId}>
                <span>{row.personId === "unassigned" ? "No owner" : name(row.personId)}</span>
                <b>{row.count}</b>
              </li>
            ))}
          </ul>
        </Tile>

        <Tile className="t-blue">
          <h3>Shipped this week</h3>
          <p className="num mid">{insights.closedThisWeek}</p>
          <p className="delta">
            {weekDelta === 0 ? "Same as last week" : `${weekDelta > 0 ? "+" : ""}${weekDelta} vs last week`}
          </p>
          <svg className="spark" viewBox="0 0 280 60" role="img" aria-label={`${doneTotal} tasks closed over the last 14 days`}>
            {insights.donePerDay.map((day, index) => {
              const height = Math.max(3, (day.count / maxDone) * 50);
              return <rect key={day.day} x={index * 20 + 2} y={56 - height} width={14} height={height} rx={4} />;
            })}
          </svg>
          <p className="meta-inv">
            Last 14 days{insights.averageDaysToClose != null ? ` · ${insights.averageDaysToClose}d average to close` : ""}
          </p>
        </Tile>

        <Tile className="t-panel">
          <h3>Needs you</h3>
          <div className="queue">
            <QueueItem tone="var(--pink)" done={unownedCount === 0} text={unownedCount ? `${plural(unownedCount, "task has", "tasks have")} no owner` : "Every open task has an owner"} action={unownedCount ? "Balance in orbit" : undefined} onAct={() => go("agents")} primary />
            <QueueItem tone="var(--orange)" done={insights.stale.length === 0} text={insights.stale.length ? `${plural(insights.stale.length, "task", "tasks")} untouched for 3+ days` : "Nothing has gone stale"} action={insights.stale.length ? "Open team board" : undefined} onAct={() => go("board")} />
            <QueueItem tone="var(--cyan)" done={openRequests === 0} text={openRequests ? `${plural(openRequests, "request", "requests")} waiting in the main bucket` : "Main bucket is clear"} action={openRequests ? "Open main bucket" : undefined} onAct={() => go("inbox")} />
            {insights.agentsWaiting.length > 0 ? (
              <QueueItem tone="var(--violet)" text={`${plural(insights.agentsWaiting.length, "agent is", "agents are")} waiting on you`} action="Open agents" onAct={() => go("agents")} />
            ) : syncing > 0 ? (
              <QueueItem tone="var(--violet)" text={`${plural(syncing, "agent is", "agents are")} waiting for a first sync`} action="Open orbit" onAct={() => go("agents")} />
            ) : null}
          </div>
        </Tile>

        <Tile className="t-orange">
          <h3>Luxskybox pipeline</h3>
          {!kraya ? <p>Waiting for Kraya sync</p> : null}
          {kraya?.syncedAt ? <p className="meta-dark">Synced from Kraya {formatStamp(kraya.syncedAt)}</p> : null}
          <div className="funnel-bars">
            {kraya?.stages.map((row) => (
              <div className="fr" key={row.name}>
                <span>{row.name}</span>
                <span className="fbar"><span style={{ width: `${(row.count / funnelMax) * 100}%` }} /></span>
                <b>{row.count}</b>
              </div>
            ))}
          </div>
        </Tile>

        <Tile className="t-crew">
          <h3>Crew load</h3>
          {insights.workload.length === 0 ? <p className="meta">No team roster yet.</p> : null}
          <div className="crew">
            {insights.workload
              .filter((row) => row.personId !== "unassigned")
              .map((row) => (
                <div className="cr" key={row.personId}>
                  <span>{orgSeat(row.personId) ? `${orgSeat(row.personId)?.name} · ${orgSeat(row.personId)?.title}` : name(row.personId)}</span>
                  <span className="cbar">
                    <span className={`load-${loadLevel(row.count)}`} style={{ width: `${Math.max((row.count / maxLoad) * 100, row.count ? 6 : 2)}%` }} />
                  </span>
                  <b>{row.count}</b>
                </div>
              ))}
            <div className="cr unowned">
              <span>No owner</span>
              <span className="cbar"><span style={{ width: `${Math.max((unownedCount / maxLoad) * 100, 2)}%` }} /></span>
              <b>{unownedCount}</b>
            </div>
          </div>
          {heaviest && lightest && heaviest.personId !== lightest.personId ? (
            <p className="read">
              {name(heaviest.personId)} has the heaviest load at {heaviest.count}. {name(lightest.personId)} has the most room with {lightest.count}.
            </p>
          ) : null}
        </Tile>

        <Tile className="t-brands">
          <h3>Brands</h3>
          {data.brands.length === 0 ? <p className="meta">No brand records yet.</p> : null}
          <div className="brands">
            {[...data.brands].sort((a, b) => a.order - b.order).map((brand, index) => (
              <article key={brand.id} className="brand-item">
                <span className="orb" aria-hidden="true" style={{ ["--orb" as string]: BRAND_COLOR[brand.id], animationDelay: `${-index * 2.3}s` }} />
                <div>
                  <h4>{brand.name}</h4>
                  <p className="meta">{brand.headlines.map((item) => `${item.label} ${item.value}`).join(" · ")}</p>
                  {brand.waitingOnFounder.length > 0 ? <p className="meta">{brand.waitingOnFounder.join(" ")}</p> : null}
                  <span className={`chip-status status-${brand.status}`}>{BRAND_STATUS_LABEL[brand.status]}</span>
                </div>
              </article>
            ))}
          </div>
        </Tile>

        <Tile className="t-panel">
          <h3>Intern rotation</h3>
          <p className="meta">{rotation.daysLeft} days left · day {rotation.day} of {diffDays(rotation.start, rotation.end)}</p>
          {rotation.interns.map((intern) => (
            <div key={intern.id} className="stack">
              <p><b>{intern.name}</b> · {intern.title} · reports to {intern.reportsTo}</p>
              <p className="meta">{intern.done} of {intern.total} done{intern.strongest ? ` · strongest in ${intern.strongest}` : ""}</p>
              {intern.brands.map((row) => (
                <p key={row.brand} className="meta">{row.brand}: {row.done} done of {row.total}</p>
              ))}
            </div>
          ))}
          <p className="read">Planned department assignment is decided after day 45. Dates are set in INTERN_ROTATION.</p>
        </Tile>
      </div>
    </section>
  );
}

function Ticker({ signals }: { signals: Signal[] }) {
  const label = { risk: "Risk", signal: "Signal", info: "Info" };
  const row = signals.map((item, index) => (
    <span className="sig" key={index}>
      <em className={item.kind}>{label[item.kind]}</em>
      {item.text}
    </span>
  ));
  return (
    <div className="ticker" role="region" aria-label="Signals">
      <div className="ticker-track">
        {row}
        <span aria-hidden="true" className="ticker-dup">{row}</span>
      </div>
    </div>
  );
}

function QueueItem({
  tone,
  text,
  action,
  onAct,
  done,
  primary,
}: {
  tone: string;
  text: string;
  action?: string;
  onAct: () => void;
  done?: boolean;
  primary?: boolean;
}) {
  return (
    <div className={`q${done ? " done" : ""}`}>
      <span className="dot" style={{ background: tone }} />
      <p>{text}</p>
      {action ? (
        <button type="button" className={primary ? "primary" : "ghost"} onClick={onAct}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

function Tile({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover)").matches) return;
    const move = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateZ(6px)`;
    };
    const leave = () => {
      el.style.transform = "";
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);
  return (
    <article ref={ref} className={`tile ${className}`}>
      {children}
    </article>
  );
}
