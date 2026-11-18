import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { isFirebaseConfigured } from "../firebaseConfig";
import { formatStamp } from "../lib/dates";
import { getServices } from "../lib/firebase";
import { loadSeed } from "../lib/map";
import { BRAND_COLOR, LOAD_LABEL, loadLevel } from "../lib/orbit";
import type { OrbitAgent, OrbitCrew, OrbitFilter, OrbitScene } from "../lib/orbitScene";
import { buildPublicSnapshot, type PublicSnapshot } from "../lib/publicSnapshot";
import { OrbitCaption } from "./AgentOrbit";

const KIND_COLOR = { hq: "#c6ff3d", brand: "#3de8ff", dept: "#5b5bff" } as const;
const orbitScenePromise = import("../lib/orbitScene");

export function PublicView() {
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setPhase("empty");
      return;
    }
    const services = getServices();
    if (!services) {
      setPhase("empty");
      return;
    }
    return onSnapshot(
      doc(services.db, "public", "snapshot"),
      (snap) => {
        if (!snap.exists()) {
          if (import.meta.env.DEV) {
            const seed = loadSeed();
            setSnapshot(buildPublicSnapshot({ ...seed, pipelines: [] }));
            setPhase("ready");
            return;
          }
          setSnapshot(null);
          setPhase("empty");
          return;
        }
        setSnapshot(snap.data() as PublicSnapshot);
        setPhase("ready");
      },
      () => {
        if (import.meta.env.DEV) {
          const seed = loadSeed();
          setSnapshot(buildPublicSnapshot({ ...seed, pipelines: [] }));
          setPhase("ready");
          return;
        }
        setPhase("error");
      },
    );
  }, []);

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <p className="brand"><span>Luxsugero</span> HQ</p>
        <p className="meta">Public view</p>
      </header>
      <main id="main" className="content">
        {phase === "loading" ? <p className="empty">Loading…</p> : null}
        {phase === "empty" ? <p className="empty">This view has not been published yet.</p> : null}
        {phase === "error" ? <p className="empty">The public view could not be loaded.</p> : null}
        {phase === "ready" && snapshot ? <PublicBody snapshot={snapshot} /> : null}
      </main>
    </div>
  );
}

type PublicTask = PublicSnapshot["tasks"][number];
type PublicStatus = PublicTask["status"];

const STATUS_RANK: Record<PublicStatus, number> = { overdue: 0, open: 1, done: 2 };
const STATUS_LABEL: Record<PublicStatus, string> = { open: "Open", overdue: "Late", done: "Done this week" };
const UNOWNED = /^(no owner|unassigned)$/i;

function PublicBody({ snapshot }: { snapshot: PublicSnapshot }) {
  const maxLoad = Math.max(1, ...snapshot.crew.map((row) => row.open));
  const unowned = snapshot.orbit.unowned;
  const owned = Math.max(0, snapshot.open - unowned);
  const overdueBy = new Map<string, number>();
  for (const task of snapshot.tasks) {
    if (task.status === "overdue") overdueBy.set(task.owner, (overdueBy.get(task.owner) ?? 0) + 1);
  }
  const overdueRows = [...overdueBy.entries()].sort((a, b) => b[1] - a[1]);
  const heaviest = [...snapshot.crew].sort((a, b) => b.open - a.open)[0];
  const observations = snapshot.insights?.observations ?? [];
  const recommendations = snapshot.insights?.recommendations ?? [];

  return (
    <section className="pulse pv" aria-label="Public view">
      <PublicOrbit snapshot={snapshot} />
      <div className="section-head big-head">
        <h2>Studio pulse</h2>
        <p className="meta">Counts and first names. No notes, no inbox, no contact details.</p>
      </div>

      <div className="pv-grid">
        <article className="tile t-lime pv-4">
          <h3>Open tasks</h3>
          <p className="num pv-num">{snapshot.open}</p>
          <div className="split" aria-hidden="true">
            <span style={{ width: `${snapshot.open ? (owned / snapshot.open) * 100 : 0}%`, background: "var(--on-lime)" }} />
            <span style={{ width: `${snapshot.open ? (unowned / snapshot.open) * 100 : 0}%`, background: "var(--pink)" }} />
          </div>
          <p className="legend">
            <span><i style={{ background: "var(--on-lime)" }} /><b>{owned}</b> owned</span>
            <span><i style={{ background: "var(--pink)" }} /><b>{unowned}</b> no owner</span>
          </p>
          {heaviest && heaviest.open > 0 ? (
            <p className="pv-line">{heaviest.name} carries the most, with {heaviest.open} open.</p>
          ) : null}
        </article>

        <article className="tile t-pink pv-4">
          <h3>Overdue</h3>
          <p className="num pv-num">{snapshot.overdue}</p>
          {overdueRows.length === 0 ? <p className="pv-line">Nothing is late.</p> : null}
          <ul className="mini pv-cols">
            {overdueRows.map(([owner, count]) => (
              <li key={owner}><span>{owner}</span><b>{count}</b></li>
            ))}
          </ul>
        </article>

        <article className="tile t-blue pv-4">
          <h3>Shipped this week</h3>
          <p className="num pv-num">{snapshot.shippedThisWeek}</p>
          <p className="pv-line">
            {snapshot.shippedThisWeek === 0
              ? "Nothing closed yet this week."
              : `${snapshot.shippedThisWeek} ${snapshot.shippedThisWeek === 1 ? "task" : "tasks"} closed since Monday.`}
          </p>
        </article>

        <article className="tile t-crew pv-6">
          <h3>Crew load</h3>
          <div className="crew pv-crew">
            {snapshot.crew.map((row) => (
              <div className="cr" key={`${row.name}-${row.title}`}>
                <span className="pv-who">
                  <b>{row.name}</b>
                  {row.title ? <small>{row.title}</small> : null}
                </span>
                <span className="cbar">
                  <span className={`load-${loadLevel(row.open)}`} style={{ width: `${Math.max((row.open / maxLoad) * 100, row.open ? 6 : 2)}%` }} />
                </span>
                <b>{row.open}</b>
              </div>
            ))}
          </div>
        </article>

        <article className="tile t-panel pv-6 pv-attn">
          <div>
            <h3>What HQ sees</h3>
            {observations.length === 0 ? <p className="meta">Nothing to flag from the published counts.</p> : null}
            <ul className="pv-list">
              {observations.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <div>
            <h3>What to do next</h3>
            {recommendations.length === 0 ? <p className="meta">No recommendation from these counts.</p> : null}
            <ul className="pv-list">
              {recommendations.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        </article>

        <article className="tile t-brands pv-12">
          <h3>Brands</h3>
          <div className="pv-brands">
            {snapshot.brands.map((brand) => (
              <div key={brand.name} className="pv-brand">
                <span className="orb" aria-hidden="true" style={{ ["--orb" as string]: brandColor(brand.name) }} />
                <div>
                  <h4>{brand.name}</h4>
                  <span className={`chip-status status-${brand.status}`}>{brand.status}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        {snapshot.pipeline.length === 0 ? (
          <article className="tile t-orange pv-12"><h3>Kraya</h3><p>Waiting for Kraya sync</p></article>
        ) : null}
        {snapshot.pipeline.map((board) => (
          <KrayaTile key={board.brand} board={board} wide={snapshot.pipeline.length === 1} />
        ))}
      </div>

      <PublicBoard tasks={snapshot.tasks} crew={snapshot.crew} />
    </section>
  );
}

function KrayaTile({ board, wide }: { board: PublicSnapshot["pipeline"][number]; wide: boolean }) {
  const [all, setAll] = useState(false);
  const live = board.stages.filter((stage) => stage.count > 0);
  const shown = all ? board.stages : live;
  const max = Math.max(1, ...board.stages.map((stage) => stage.count));
  const hidden = board.stages.length - live.length;
  return (
    <article className={`tile t-orange ${wide ? "pv-12" : "pv-6"}`}>
      <div className="pv-tile-head">
        <h3>{board.brand} funnel</h3>
        <span className="pv-total">{board.total} leads</span>
      </div>
      <p className="meta-dark">
        {board.stages.length === 0 ? "Waiting for Kraya sync" : board.syncedAt ? `Synced from Kraya ${formatStamp(board.syncedAt)}` : "From Kraya"}
      </p>
      <div className="funnel-bars pv-funnel">
        {shown.map((stage) => (
          <div className={`fr${stage.count === 0 ? " zero" : ""}`} key={stage.name}>
            <span title={stage.name}>{stage.name}</span>
            <span className="fbar"><span style={{ width: `${(stage.count / max) * 100}%` }} /></span>
            <b>{stage.count}</b>
          </div>
        ))}
      </div>
      {hidden > 0 ? (
        <button type="button" className="pv-toggle" onClick={() => setAll((value) => !value)} aria-expanded={all}>
          {all ? "Hide empty stages" : `Show ${hidden} empty ${hidden === 1 ? "stage" : "stages"}`}
        </button>
      ) : null}
    </article>
  );
}

type OwnerGroup = { owner: string; title: string; tasks: PublicTask[]; open: number; overdue: number };

function groupByOwner(tasks: PublicTask[], crew: PublicSnapshot["crew"]): OwnerGroup[] {
  const map = new Map<string, PublicTask[]>();
  for (const task of tasks) map.set(task.owner, [...(map.get(task.owner) ?? []), task]);
  const groups = [...map.entries()].map(([owner, list]) => ({
    owner,
    title: crew.find((row) => row.name === owner)?.title ?? "",
    tasks: [...list].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]),
    open: list.filter((task) => task.status === "open").length,
    overdue: list.filter((task) => task.status === "overdue").length,
  }));
  return groups.sort((a, b) => {
    if (UNOWNED.test(a.owner) !== UNOWNED.test(b.owner)) return UNOWNED.test(a.owner) ? -1 : 1;
    return b.open + b.overdue - (a.open + a.overdue) || a.owner.localeCompare(b.owner);
  });
}

function PublicBoard({ tasks, crew }: { tasks: PublicTask[]; crew: PublicSnapshot["crew"] }) {
  const owners = useMemo(() => groupByOwner(tasks, crew).map((group) => group.owner), [tasks, crew]);
  const [people, setPeople] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<PublicStatus[]>(["overdue", "open"]);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = tasks.filter(
    (task) =>
      (people.length === 0 || people.includes(task.owner)) &&
      statuses.includes(task.status) &&
      (!q || task.title.toLowerCase().includes(q)),
  );
  const groups = groupByOwner(filtered, crew);
  const toggleStatus = (status: PublicStatus) =>
    setStatuses((current) => (current.includes(status) ? current.filter((item) => item !== status) : [...current, status]));
  const filtersOn = people.length > 0 || q !== "" || statuses.length !== 2 || !statuses.includes("open") || !statuses.includes("overdue");

  return (
    <>
      <div className="section-head big-head pv-board-head">
        <h2>Board</h2>
        <p className="meta">{filtered.length} of {tasks.length} tasks shown</p>
      </div>
      <div className="pv-filters" role="group" aria-label="Board filters">
        <label className="pv-search">
          <span className="sr-only">Search tasks</span>
          <input id="pv-search" type="search" placeholder="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <MultiSelect label="People" options={owners} value={people} onChange={setPeople} />
        <fieldset className="pv-checks">
          <legend className="sr-only">Status</legend>
          {(["overdue", "open", "done"] as const).map((status) => (
            <label key={status} className={`pv-check s-${status}`}>
              <input type="checkbox" checked={statuses.includes(status)} onChange={() => toggleStatus(status)} />
              {STATUS_LABEL[status]}
            </label>
          ))}
        </fieldset>
        {filtersOn ? (
          <button
            type="button"
            className="pv-toggle"
            onClick={() => {
              setPeople([]);
              setStatuses(["overdue", "open"]);
              setQuery("");
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>
      {groups.length === 0 ? <p className="empty">No tasks match these filters.</p> : null}
      <div className="pv-people">
        {groups.map((group) => (
          <PersonCard key={group.owner} group={group} />
        ))}
      </div>
    </>
  );
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent | KeyboardEvent) => {
      const el = ref.current;
      if (!el?.open) return;
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !el.contains(event.target as Node)) el.open = false;
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  const summary = value.length === 0 ? `All ${label.toLowerCase()}` : value.length === 1 ? value[0] : `${value.length} ${label.toLowerCase()}`;
  const toggle = (option: string) => onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option]);
  return (
    <details ref={ref} className="pv-multi">
      <summary aria-label={`${label}: ${summary}`}>
        <span>{summary}</span>
        <span aria-hidden="true" className="caret">▾</span>
      </summary>
      <div className="pv-menu" role="group" aria-label={label}>
        <div className="pv-menu-head">
          <button type="button" onClick={() => onChange([...options])}>Select all</button>
          <button type="button" onClick={() => onChange([])}>Clear</button>
        </div>
        {options.map((option) => (
          <label key={option} className="pv-opt">
            <input type="checkbox" checked={value.includes(option)} onChange={() => toggle(option)} />
            {option}
          </label>
        ))}
      </div>
    </details>
  );
}

function PersonCard({ group }: { group: OwnerGroup }) {
  const [more, setMore] = useState(false);
  const shown = more ? group.tasks : group.tasks.slice(0, 5);
  const unowned = UNOWNED.test(group.owner);
  return (
    <article className={`pv-person${unowned ? " is-unowned" : ""}`}>
      <header>
        <div>
          <h4>{group.owner}</h4>
          {group.title ? <p className="meta">{group.title}</p> : null}
        </div>
        <div className="pv-counts">
          {group.open ? <span className="pv-c open">{group.open} open</span> : null}
          {group.overdue ? <span className="pv-c late">{group.overdue} late</span> : null}
        </div>
      </header>
      <ul className="pv-tasks">
        {shown.map((task, index) => (
          <li key={`${task.title}-${index}`} className={task.status}>
            <span title={task.title}>{task.title}</span>
            {task.status === "overdue" ? <em>late</em> : task.status === "done" ? <em>done</em> : null}
          </li>
        ))}
      </ul>
      {group.tasks.length > 5 ? (
        <button type="button" className="pv-toggle" onClick={() => setMore((value) => !value)} aria-expanded={more}>
          {more ? "Show less" : `+${group.tasks.length - 5} more`}
        </button>
      ) : null}
    </article>
  );
}

function brandColor(name: string): string {
  const key = name.toLowerCase();
  if (key.includes("sky")) return BRAND_COLOR.skybox;
  if (key.includes("stay")) return BRAND_COLOR.stays;
  if (key.includes("forest") || key.includes("hill")) return BRAND_COLOR.fh;
  if (key.includes("braj")) return BRAND_COLOR.braj;
  return BRAND_COLOR.skybox;
}

function PublicOrbit({ snapshot }: { snapshot: PublicSnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OrbitScene | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<OrbitFilter>("all");
  const [paused, setPaused] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const agents = useMemo<OrbitAgent[]>(() => {
    const ids = snapshot.orbit.agents.map((agent, index) => [`${agent.name}`, `a${index}`] as const);
    const byName = new Map(ids);
    return snapshot.orbit.agents.map((agent, index) => ({
      id: `a${index}`,
      name: agent.name,
      kind: agent.kind,
      color: KIND_COLOR[agent.kind],
      state: agent.state,
      parentId: agent.reportsTo ? byName.get(agent.reportsTo) ?? null : null,
    }));
  }, [snapshot]);
  const crew = useMemo<OrbitCrew[]>(
    () =>
      snapshot.orbit.crew.map((row, index) => ({
        id: `c${index}`,
        name: row.title ? `${row.name} · ${row.title}` : row.name,
        count: row.open,
        level: loadLevel(row.open),
      })),
    [snapshot],
  );
  const comets = useMemo(
    () => Array.from({ length: snapshot.orbit.unowned }, (_, index) => `u${index}`),
    [snapshot.orbit.unowned],
  );

  useEffect(() => {
    let disposed = false;
    let scene: OrbitScene | null = null;
    orbitScenePromise
      .then(({ OrbitScene }) => {
        if (disposed || !canvasRef.current || !labelsRef.current) return;
        scene = new OrbitScene(canvasRef.current, labelsRef.current, {
          onNode: (id) => setPicked(id),
          onComet: () => undefined,
          onEmpty: () => setPicked(null),
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
    if (ready) sceneRef.current?.setAgents(agents);
  }, [ready, agents]);
  useEffect(() => {
    if (ready) sceneRef.current?.setCrew(crew);
  }, [ready, crew]);
  useEffect(() => {
    if (ready) sceneRef.current?.setComets(comets, null);
  }, [ready, comets]);
  useEffect(() => {
    sceneRef.current?.setFilter(filter);
  }, [filter, ready]);
  useEffect(() => {
    sceneRef.current?.setPaused(paused);
  }, [paused, ready]);

  const pickedAgent = picked?.startsWith("a") ? snapshot.orbit.agents[Number(picked.slice(1))] : null;
  const pickedCrew = picked?.startsWith("c") ? snapshot.orbit.crew[Number(picked.slice(1))] : null;

  return (
    <div className="orbit-wrap orbit-hero">
      <div className="stage">
        <canvas ref={canvasRef} className="orbit-canvas" aria-label="View-only map of the team and agents. Drag to rotate." />
        <div ref={labelsRef} className="orbit-labels" aria-hidden="true" />
        {!ready && !failed ? <p className="orbit-fallback">Loading the orbit…</p> : null}
        {failed ? <p className="orbit-fallback">The 3D view could not start. The lists below have the same names.</p> : null}
        <OrbitCaption open={snapshot.open} overdue={snapshot.overdue} shipped={snapshot.shippedThisWeek} />
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
        </div>
        <p className="orbit-hint">Drag to spin. This view cannot assign work.</p>
        <div className="orbit-key" aria-hidden="true">
          <span><i className="sq" />Human</span>
          <span><i style={{ background: "var(--lime)" }} />{LOAD_LABEL.steady}</span>
          <span><i style={{ background: "var(--pink)" }} />No owner</span>
        </div>
        {pickedAgent || pickedCrew ? (
          <aside className="orbit-panel" aria-live="polite">
            <button type="button" className="pillbtn close" onClick={() => setPicked(null)}>Close</button>
            {pickedCrew ? (
              <>
                <p className="meta">Human{pickedCrew.title ? ` · ${pickedCrew.title}` : ""}</p>
                <h3>{pickedCrew.name}</h3>
                <dl>
                  <dt>Open tasks</dt><dd>{pickedCrew.open}</dd>
                </dl>
              </>
            ) : pickedAgent ? (
              <>
                <p className="meta">AI agent</p>
                <h3>{pickedAgent.name}</h3>
                <span className="state" style={{ background: "var(--lime)" }}>{pickedAgent.state}</span>
                {pickedAgent.reportsTo ? (
                  <dl>
                    <dt>Reports to</dt><dd>{pickedAgent.reportsTo}</dd>
                  </dl>
                ) : null}
              </>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
