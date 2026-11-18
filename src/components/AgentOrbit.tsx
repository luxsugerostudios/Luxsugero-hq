import { useEffect, useMemo, useRef, useState } from "react";
import { formatStamp, kolkataDay } from "../lib/dates";
import { buildInsights } from "../lib/insights";
import { useHqContext } from "../lib/hq";
import {
  AGENT_STATE_LABEL,
  BRAND_COLOR,
  BUCKET_IDS,
  LOAD_LABEL,
  REPORTS_TO,
  agentState,
  brandOfAgent,
  loadLevel,
  planBalance,
  type Assignment,
} from "../lib/orbit";
import type { OrbitAgent, OrbitCrew, OrbitFilter, OrbitScene } from "../lib/orbitScene";
import { visibleTasks } from "../lib/tasks";
import { actorName } from "./TasksPanel";

type Panel = { kind: "node"; id: string } | { kind: "plan"; plan: Assignment[] } | null;

const STATE_SWATCH: Record<string, string> = {
  working: "var(--lime)",
  waiting: "var(--orange)",
  queued: "var(--cyan)",
  idle: "#6b6b88",
  sync: "#4a4a62",
};

export function AgentOrbit() {
  const { data, isAdmin, reassignTask } = useHqContext();
  const today = kolkataDay();
  const tasks = visibleTasks(data.tasks);
  const insights = buildInsights(tasks, data.people, data.leads, data.agents, data.brands, today);
  const name = (id: string) => actorName(id, data.people);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OrbitScene | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [filter, setFilter] = useState<OrbitFilter>("all");
  const [paused, setPaused] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const unowned = insights.unowned.filter((task) => !preview[task.id]);
  const load = insights.workload.map((row) => ({
    personId: row.personId,
    count:
      row.personId === "unassigned"
        ? unowned.length
        : row.count + Object.values(preview).filter((personId) => personId === row.personId).length,
  }));
  const loadOf = (id: string) => load.find((row) => row.personId === id)?.count ?? 0;

  const agentsView = useMemo<OrbitAgent[]>(
    () =>
      [...data.agents]
        .sort((a, b) => a.order - b.order)
        .map((agent) => {
          const brand = brandOfAgent(agent.id);
          const parent = REPORTS_TO[agent.id];
          return {
            id: agent.id,
            name: agent.name,
            kind: agent.group === "HQ" ? "hq" : agent.group === "Brand PM" ? "brand" : "dept",
            color: agent.group === "HQ" ? "#c6ff3d" : brand ? BRAND_COLOR[brand] : "#5b5bff",
            state: agentState(agent, data.directives),
            parentId: parent && data.agents.some((item) => item.id === parent) ? parent : null,
          };
        }),
    [data.agents, data.directives],
  );

  const crewKey = load.map((row) => `${row.personId}:${row.count}`).join("|");
  const crewView = useMemo<OrbitCrew[]>(
    () =>
      [...data.people]
        .filter((person) => person.id !== "unassigned")
        .sort((a, b) => a.order - b.order)
        .map((person) => {
          const count = loadOf(person.id);
          return { id: person.id, name: person.name, count, level: loadLevel(count) };
        }),
    [data.people, crewKey],
  );
  const cometKey = unowned.map((task) => task.id).join("|");

  useEffect(() => {
    let disposed = false;
    let scene: OrbitScene | null = null;
    import("../lib/orbitScene")
      .then(({ OrbitScene }) => {
        if (disposed || !canvasRef.current || !labelsRef.current) return;
        scene = new OrbitScene(canvasRef.current, labelsRef.current, {
          onNode: (id) => nodeClick.current(id),
          onComet: (taskId) => setSelected((current) => (current === taskId ? null : taskId)),
          onEmpty: () => setSelected(null),
        });
        sceneRef.current = scene;
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ready) sceneRef.current?.setAgents(agentsView);
  }, [ready, agentsView]);
  useEffect(() => {
    if (ready) sceneRef.current?.setCrew(crewView);
  }, [ready, crewView]);
  useEffect(() => {
    if (ready) sceneRef.current?.setComets(cometKey ? cometKey.split("|") : [], selected);
  }, [ready, cometKey, selected]);
  useEffect(() => {
    sceneRef.current?.setFilter(filter);
  }, [filter, ready]);
  useEffect(() => {
    sceneRef.current?.setPaused(paused);
  }, [paused, ready]);
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  async function assign(taskId: string, personId: string): Promise<boolean> {
    const task = insights.unowned.find((item) => item.id === taskId);
    if (!task) return false;
    if (BUCKET_IDS.has(personId)) {
      setNote(`Pick a person, not the shared "${name(personId)}" bucket.`);
      return false;
    }
    setSelected(null);
    const landed = sceneRef.current?.fly(taskId, personId) ?? Promise.resolve();
    if (isAdmin) {
      try {
        await Promise.all([reassignTask(task, personId), landed]);
        return true;
      } catch {
        sceneRef.current?.setComets(cometKey ? cometKey.split("|") : [], null);
        setNote(`Could not assign "${task.title}". It is back in orbit.`);
        return false;
      }
    }
    await landed;
    setPreview((current) => ({ ...current, [taskId]: personId }));
    return true;
  }

  const nodeClick = useRef<(id: string) => void>(() => undefined);
  nodeClick.current = (id: string) => {
    const isPerson = data.people.some((person) => person.id === id);
    if (isPerson && selected) {
      const task = insights.unowned.find((item) => item.id === selected);
      void assign(selected, id).then((ok) => {
        if (ok && task) setNote(`"${task.title}" is now with ${name(id)}${isAdmin ? "." : ". Preview only, sign in as an admin to save."}`);
      });
      return;
    }
    setPanel({ kind: "node", id });
  };

  function runPlan(plan: Assignment[]) {
    setPanel(null);
    plan.forEach((step, index) => {
      setTimeout(() => {
        void assign(step.taskId, step.personId).then(() => {
          if (index === plan.length - 1) {
            const who = [...new Set(plan.map((item) => name(item.personId)))].join(", ");
            setNote(`${plan.length} ${plan.length === 1 ? "task" : "tasks"} spread across ${who}${isAdmin ? "." : ". Preview only, nothing saved."}`);
          }
        });
      }, index * 320);
    });
  }

  const selectedTask = selected ? insights.unowned.find((task) => task.id === selected) : null;
  const hint = selectedTask
    ? `Picked up "${selectedTask.title}". Click a crew member (white diamond) to hand it over.`
    : unowned.length
      ? "Drag to spin. Click a pink shard (a task with no owner), then click a crew member."
      : "Drag to spin. Every open task has an owner.";

  return (
    <div className="orbit-wrap">
      <div className="stage">
        <canvas ref={canvasRef} className="orbit-canvas" aria-label="3D map of the team and AI agents. Drag to rotate. Use the list below for a text version." />
        <div ref={labelsRef} className="orbit-labels" aria-hidden="true" />
        {failed ? <p className="orbit-fallback">The 3D view could not start in this browser. The agent list below has everything.</p> : null}
        <div className="orbit-ctrls">
          {(["all", "ai", "crew"] as const).map((item) => (
            <button key={item} type="button" className="pillbtn" aria-pressed={filter === item} onClick={() => setFilter(item)}>
              {item === "all" ? "All" : item === "ai" ? "AI only" : "Crew only"}
            </button>
          ))}
          <span className="sp" />
          <button type="button" className="pillbtn" aria-label="Zoom in" onClick={() => sceneRef.current?.zoom(-1)}>+</button>
          <button type="button" className="pillbtn" aria-label="Zoom out" onClick={() => sceneRef.current?.zoom(1)}>−</button>
          <button type="button" className="pillbtn" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className="primary"
            disabled={unowned.length === 0}
            onClick={() => setPanel({ kind: "plan", plan: planBalance(unowned, load) })}
          >
            Auto-balance
          </button>
          {!isAdmin && Object.keys(preview).length > 0 ? (
            <button type="button" className="pillbtn" onClick={() => setPreview({})}>Reset</button>
          ) : null}
        </div>
        <p className="orbit-hint">{hint}</p>
        <div className="orbit-key" aria-hidden="true">
          <span><i className="sq" />Human</span>
          <span><i style={{ background: "var(--lime)" }} />Working</span>
          <span><i style={{ background: "var(--orange)" }} />Waiting on you</span>
          <span><i style={{ background: "var(--cyan)" }} />Queued</span>
          <span><i style={{ background: "#4a4a62" }} />Awaiting sync</span>
          <span><i style={{ background: "var(--pink)" }} />No owner</span>
        </div>
        {panel ? (
          <aside className="orbit-panel" aria-live="polite">
            <button type="button" className="pillbtn close" onClick={() => setPanel(null)}>Close</button>
            {panel.kind === "plan" ? (
              <PlanCard plan={panel.plan} name={name} isAdmin={isAdmin} tasks={insights.unowned} onRun={() => runPlan(panel.plan)} />
            ) : (
              <NodeCard
                id={panel.id}
                count={loadOf(panel.id)}
                overdue={insights.overdueByPerson.find((row) => row.personId === panel.id)?.count ?? 0}
                canGive={unowned.length > 0 && !BUCKET_IDS.has(panel.id)}
                onGive={() => {
                  const target = selected ?? unowned[0]?.id;
                  if (target) void assign(target, panel.id).then((ok) => ok && setNote(`Task handed to ${name(panel.id)}${isAdmin ? "." : ". Preview only."}`));
                }}
              />
            )}
          </aside>
        ) : null}
      </div>
      {note ? <p className="orbit-note" role="status">{note}</p> : null}
    </div>
  );
}

function PlanCard({
  plan,
  name,
  isAdmin,
  tasks,
  onRun,
}: {
  plan: Assignment[];
  name: (id: string) => string;
  isAdmin: boolean;
  tasks: { id: string; title: string }[];
  onRun: () => void;
}) {
  const byPerson = new Map<string, string[]>();
  for (const step of plan) {
    const title = tasks.find((task) => task.id === step.taskId)?.title ?? step.taskId;
    byPerson.set(step.personId, [...(byPerson.get(step.personId) ?? []), title]);
  }
  return (
    <>
      <p className="meta">Auto-balance plan</p>
      <h3>Spread {plan.length} {plan.length === 1 ? "task" : "tasks"} to the lightest loads</h3>
      {plan.length === 0 ? <p>There is nobody on the roster to give work to.</p> : null}
      <ul className="plan">
        {[...byPerson.entries()].map(([personId, titles]) => (
          <li key={personId}>
            <b>{name(personId)} +{titles.length}</b>
            <span>{titles.join(", ")}</span>
          </li>
        ))}
      </ul>
      <p className="meta">{isAdmin ? "This reassigns the tasks in HQ and logs it in each task's history." : "You are not signed in as an admin, so this only previews the result."}</p>
      <div className="acts">
        <button type="button" className="primary" disabled={plan.length === 0} onClick={onRun}>
          {isAdmin ? "Assign all" : "Preview"}
        </button>
      </div>
    </>
  );
}

function NodeCard({
  id,
  count,
  overdue,
  canGive,
  onGive,
}: {
  id: string;
  count: number;
  overdue: number;
  canGive: boolean;
  onGive: () => void;
}) {
  const { data } = useHqContext();
  const person = data.people.find((item) => item.id === id);
  if (person) {
    const level = loadLevel(count);
    const bucket = BUCKET_IDS.has(id);
    return (
      <>
        <p className="meta">Human{person.role ? ` · ${person.role}` : ""}</p>
        <h3>{person.name}</h3>
        {bucket ? <span className="state" style={{ background: "#6b6b88" }}>Shared bucket</span> : <span className={`state load-${level}`}>{LOAD_LABEL[level]}</span>}
        <dl>
          <dt>Open tasks</dt><dd>{count}</dd>
          <dt>Overdue</dt><dd>{overdue}</dd>
        </dl>
        {canGive ? (
          <div className="acts">
            <button type="button" className="primary" onClick={onGive}>Give a task</button>
          </div>
        ) : null}
      </>
    );
  }
  const agent = data.agents.find((item) => item.id === id);
  if (!agent) return null;
  const state = agentState(agent, data.directives);
  const brand = brandOfAgent(agent.id);
  const brandRow = brand ? data.brands.find((item) => item.id === brand) : null;
  const parent = REPORTS_TO[agent.id];
  const directives = data.directives.filter((item) => item.agentId === agent.id);
  return (
    <>
      <p className="meta">AI agent · {agent.group}</p>
      <h3>{agent.name}</h3>
      <span className="state" style={{ background: STATE_SWATCH[state] }}>{AGENT_STATE_LABEL[state]}</span>
      <p>{agent.focus}</p>
      {agent.waitingOnFounder.length > 0 ? (
        <ul className="waiting">
          {agent.waitingOnFounder.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      <dl>
        <dt>Reports to</dt><dd>{parent ? data.agents.find((item) => item.id === parent)?.name ?? parent : "—"}</dd>
        {brandRow?.headlines.map((item) => (
          <FragmentRow key={item.label} label={item.label} value={item.value} />
        ))}
        <dt>Directives</dt><dd>{directives.length}</dd>
        <dt>Updated</dt><dd>{agent.updatedAt ? formatStamp(agent.updatedAt) : "—"}</dd>
      </dl>
      <p className="meta">Directives and full details are in the agent list below the orbit.</p>
    </>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
