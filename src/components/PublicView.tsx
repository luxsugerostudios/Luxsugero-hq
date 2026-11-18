import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { isFirebaseConfigured } from "../firebaseConfig";
import { formatStamp, kolkataDay } from "../lib/dates";
import { getServices } from "../lib/firebase";
import { loadSeed } from "../lib/map";
import { BRAND_COLOR, loadLevel } from "../lib/orbit";
import type { OrbitAgent, OrbitCrew, OrbitFilter, OrbitScene } from "../lib/orbitScene";
import { buildPublicSnapshot, type PublicSnapshot, type PublicTask } from "../lib/publicSnapshot";

const KIND_COLOR = { hq: "#c6ff3d", brand: "#3de8ff", dept: "#5b5bff" } as const;
const orbitScenePromise = import("../lib/orbitScene");

type PublicStatus = PublicTask["status"];
type Who = "person" | "ai" | "bucket";

const STATUS_RANK: Record<PublicStatus, number> = { overdue: 0, open: 1, done: 2 };
const STATUS_LABEL: Record<PublicStatus, string> = { overdue: "Late", open: "Open", done: "Done this week" };
const WHO_LABEL: Record<Who, string> = { person: "Team", ai: "AI agents", bucket: "No owner" };
const UNOWNED = /^(no owner|unassigned)$/i;

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: reduce ? "auto" : "smooth" });
}

function whoOf(task: PublicTask): Who {
  if (task.ownerKind) return task.ownerKind;
  return UNOWNED.test(task.owner) || /^everyone$/i.test(task.owner) ? "bucket" : "person";
}

/* ---------------- sign-in ---------------- */

function useAuthUser(): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const services = getServices();
    if (!services) return;
    return onAuthStateChanged(services.auth, setUser);
  }, []);
  return user;
}

function openHq() {
  window.location.hash = "overview";
  window.scrollTo({ top: 0 });
}

function SignInButton({ user, className = "primary" }: { user: User | null; className?: string }) {
  const [busy, setBusy] = useState(false);
  if (user) {
    const first = (user.displayName ?? "").trim().split(/\s+/)[0];
    return (
      <button type="button" className={className} onClick={openHq}>
        {first ? `Open HQ as ${first}` : "Open HQ"}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() => {
        const services = getServices();
        if (!services) {
          openHq();
          return;
        }
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        setBusy(true);
        signInWithPopup(services.auth, provider)
          .then(openHq)
          .catch((error: unknown) => {
            const code = (error as { code?: string })?.code ?? "";
            if (!code.includes("popup-closed")) openHq();
          })
          .finally(() => setBusy(false));
      }}
    >
      {busy ? "Signing in…" : "Sign in to HQ"}
    </button>
  );
}

/* ---------------- page ---------------- */

export function PublicView() {
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const user = useAuthUser();

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
    <div className="app pv-app">
      <header className="topbar pv-top">
        <p className="brand"><span>Luxsugero</span> HQ</p>
        <nav className="pv-nav" aria-label="Sections">
          <button type="button" onClick={() => scrollToId("today")}>Today</button>
          <button type="button" onClick={() => scrollToId("team")}>Team and AI</button>
          <button type="button" onClick={() => scrollToId("pipeline")}>Pipeline</button>
        </nav>
        <SignInButton user={user} />
      </header>
      <main id="main" className="content pv-content">
        {phase === "loading" ? <p className="empty">Loading…</p> : null}
        {phase === "empty" ? <p className="empty">This view has not been published yet.</p> : null}
        {phase === "error" ? <p className="empty">The public view could not be loaded.</p> : null}
        {phase === "ready" && snapshot ? <PublicBody snapshot={snapshot} user={user} /> : null}
      </main>
    </div>
  );
}

function PublicBody({ snapshot, user }: { snapshot: PublicSnapshot; user: User | null }) {
  return (
    <section className="pv" aria-label="Public view">
      <PublicOrbit snapshot={snapshot} user={user} />
      <div className="pv-layout">
        <div className="pv-main">
          <TodaySection tasks={snapshot.tasks} />
          <PublicBoard tasks={snapshot.tasks} />
          <PipelineSection snapshot={snapshot} />
        </div>
        <Sidebar snapshot={snapshot} user={user} />
      </div>
    </section>
  );
}

/* ---------------- sidebar ---------------- */

function Sidebar({ snapshot, user }: { snapshot: PublicSnapshot; user: User | null }) {
  const crew = [...snapshot.crew].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  const maxLoad = Math.max(1, ...crew.map((row) => row.open));
  const observations = snapshot.insights?.observations ?? [];
  const recommendations = snapshot.insights?.recommendations ?? [];
  return (
    <aside className="pv-side" aria-label="Summary">
      <div className="pv-card pv-signin">
        <h3>{user ? "You're signed in" : "Work on this in HQ"}</h3>
        <p className="meta">
          {user ? "Open the full HQ to assign, update and close tasks." : "Sign in with Google to assign tasks, update status and use the triage desk."}
        </p>
        <SignInButton user={user} />
      </div>

      <div className="pv-card pv-stats">
        <div className="pv-stat lime"><b>{snapshot.open}</b><span>open</span></div>
        <div className="pv-stat pink"><b>{snapshot.overdue}</b><span>late</span></div>
        <div className="pv-stat blue"><b>{snapshot.shippedThisWeek}</b><span>shipped this week</span></div>
      </div>

      <div className="pv-card">
        <h3>Team load</h3>
        <ul className="pv-load">
          {crew.map((row) => (
            <li key={row.name}>
              <span className={`pv-name load-${loadLevel(row.open)}`}>{row.name}</span>
              <span className="cbar"><span className={`load-${loadLevel(row.open)}`} style={{ width: `${Math.max((row.open / maxLoad) * 100, row.open ? 8 : 3)}%` }} /></span>
              <b>{row.open}</b>
            </li>
          ))}
        </ul>
        {snapshot.orbit.unowned > 0 ? <p className="pv-flag">{snapshot.orbit.unowned} open tasks have no owner</p> : null}
      </div>

      {observations.length + recommendations.length > 0 ? (
        <div className="pv-card pv-notes">
          <details open>
            <summary>What HQ sees</summary>
            <ul className="pv-list">{observations.map((line) => <li key={line}>{line}</li>)}</ul>
          </details>
          <details>
            <summary>What to do next</summary>
            <ul className="pv-list">{recommendations.map((line) => <li key={line}>{line}</li>)}</ul>
          </details>
        </div>
      ) : null}
    </aside>
  );
}

/* ---------------- today ---------------- */

function TodaySection({ tasks }: { tasks: PublicTask[] }) {
  const today = kolkataDay();
  const active = tasks.filter((task) => task.status !== "done");
  const hasDates = tasks.some((task) => task.given !== undefined || task.due !== undefined);
  const late = active.filter((task) => task.status === "overdue" || (task.due && task.due < today));
  const lateSet = new Set(late);
  const due = active.filter((task) => !lateSet.has(task) && task.due === today);
  const fresh = active.filter((task) => !lateSet.has(task) && task.due !== today && task.given === today);
  const columns = [
    { key: "late", title: "Late", tone: "pink", rows: late, empty: "Nothing is late." },
    { key: "due", title: "Due today", tone: "orange", rows: due, empty: hasDates ? "Nothing is due today." : "Due dates show after the next HQ sync." },
    { key: "new", title: "New today", tone: "lime", rows: fresh, empty: hasDates ? "Nothing new yet today." : "New tasks show after the next HQ sync." },
  ];
  return (
    <section id="today" className="pv-section" aria-labelledby="today-h">
      <div className="pv-head">
        <h2 id="today-h">Today</h2>
      </div>
      <div className="pv-today">
        {columns.map((column) => (
          <TodayColumn key={column.key} title={column.title} tone={column.tone} rows={column.rows} empty={column.empty} />
        ))}
      </div>
    </section>
  );
}

function TodayColumn({ title, tone, rows, empty }: { title: string; tone: string; rows: PublicTask[]; empty: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <div className={`pv-col tone-${tone}`}>
      <div className="pv-col-head">
        <h3>{title}</h3>
        <span className="pv-count">{rows.length}</span>
      </div>
      {rows.length === 0 ? <p className="meta">{empty}</p> : null}
      <ul className="pv-tasks">
        {shown.map((task, index) => (
          <li key={`${task.title}-${index}`}>
            <span title={task.title}>{task.title}</span>
            <OwnerChip task={task} />
          </li>
        ))}
      </ul>
      {rows.length > 6 ? (
        <button type="button" className="pv-toggle" onClick={() => setAll((value) => !value)} aria-expanded={all}>
          {all ? "Show less" : `+${rows.length - 6} more`}
        </button>
      ) : null}
    </div>
  );
}

function OwnerChip({ task }: { task: PublicTask }) {
  const who = whoOf(task);
  return <em className={`pv-owner who-${who}`}>{who === "ai" ? `AI: ${task.owner}` : task.owner}</em>;
}

/* ---------------- board ---------------- */

type OwnerGroup = { owner: string; who: Who; tasks: PublicTask[]; open: number; overdue: number };

function groupByOwner(tasks: PublicTask[]): OwnerGroup[] {
  const map = new Map<string, PublicTask[]>();
  for (const task of tasks) map.set(task.owner, [...(map.get(task.owner) ?? []), task]);
  const order: Record<Who, number> = { bucket: 0, person: 1, ai: 2 };
  return [...map.entries()]
    .map(([owner, list]) => ({
      owner,
      who: whoOf(list[0]),
      tasks: [...list].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]),
      open: list.filter((task) => task.status === "open").length,
      overdue: list.filter((task) => task.status === "overdue").length,
    }))
    .sort((a, b) => {
      const aUn = UNOWNED.test(a.owner) ? 0 : 1;
      const bUn = UNOWNED.test(b.owner) ? 0 : 1;
      return aUn - bUn || order[a.who] - order[b.who] || b.open + b.overdue - (a.open + a.overdue) || a.owner.localeCompare(b.owner);
    });
}

function toggleItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}

function PublicBoard({ tasks }: { tasks: PublicTask[] }) {
  const owners = useMemo(() => groupByOwner(tasks).map((group) => group.owner), [tasks]);
  const hasAi = tasks.some((task) => whoOf(task) === "ai");
  const [people, setPeople] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<PublicStatus[]>(["overdue", "open"]);
  const [who, setWho] = useState<Who[]>(["bucket", "person", "ai"]);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = tasks.filter(
    (task) =>
      (people.length === 0 || people.includes(task.owner)) &&
      statuses.includes(task.status) &&
      who.includes(whoOf(task)) &&
      (!q || task.title.toLowerCase().includes(q)),
  );
  const groups = groupByOwner(filtered);
  const filtersOn = people.length > 0 || q !== "" || statuses.length !== 2 || statuses.includes("done") || who.length !== 3;

  return (
    <section id="team" className="pv-section" aria-labelledby="team-h">
      <div className="pv-head">
        <h2 id="team-h">Team and AI</h2>
        <p className="meta">{filtered.length} of {tasks.length} tasks</p>
      </div>
      <div className="pv-filters" role="group" aria-label="Filters">
        <label className="pv-search">
          <span className="sr-only">Search tasks</span>
          <input id="pv-search" type="search" placeholder="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <MultiSelect label="People" options={owners} value={people} onChange={setPeople} />
        <fieldset className="pv-checks">
          <legend className="sr-only">Status</legend>
          {(["overdue", "open", "done"] as const).map((status) => (
            <label key={status} className={`pv-check s-${status}`}>
              <input type="checkbox" checked={statuses.includes(status)} onChange={() => setStatuses((list) => toggleItem(list, status))} />
              {STATUS_LABEL[status]}
            </label>
          ))}
        </fieldset>
        {hasAi ? (
          <fieldset className="pv-checks">
            <legend className="sr-only">Owner type</legend>
            {(["person", "ai", "bucket"] as const).map((kind) => (
              <label key={kind} className={`pv-check w-${kind}`}>
                <input type="checkbox" checked={who.includes(kind)} onChange={() => setWho((list) => toggleItem(list, kind))} />
                {WHO_LABEL[kind]}
              </label>
            ))}
          </fieldset>
        ) : null}
        {filtersOn ? (
          <button
            type="button"
            className="pv-toggle"
            onClick={() => {
              setPeople([]);
              setStatuses(["overdue", "open"]);
              setWho(["bucket", "person", "ai"]);
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
    </section>
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
  const toggle = (option: string) => onChange(toggleItem(value, option));
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
    <article className={`pv-person${unowned ? " is-unowned" : ""} who-${group.who}`}>
      <header>
        <h4>
          {group.who === "ai" ? <span className="pv-ai-tag">AI</span> : null}
          <span className={group.who === "person" ? "pv-name-hl" : ""}>{group.owner}</span>
        </h4>
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

/* ---------------- pipeline ---------------- */

function PipelineSection({ snapshot }: { snapshot: PublicSnapshot }) {
  return (
    <section id="pipeline" className="pv-section" aria-labelledby="pipe-h">
      <div className="pv-head">
        <h2 id="pipe-h">Pipeline and brands</h2>
      </div>
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
      <div className="pv-funnels">
        {snapshot.pipeline.length === 0 ? <p className="meta">Waiting for Kraya sync.</p> : null}
        {snapshot.pipeline.map((board) => (
          <KrayaTile key={board.brand} board={board} />
        ))}
      </div>
    </section>
  );
}

function KrayaTile({ board }: { board: PublicSnapshot["pipeline"][number] }) {
  const [all, setAll] = useState(false);
  const live = board.stages.filter((stage) => stage.count > 0);
  const shown = all ? board.stages : live;
  const max = Math.max(1, ...board.stages.map((stage) => stage.count));
  const hidden = board.stages.length - live.length;
  return (
    <article className="pv-funnel-card">
      <div className="pv-tile-head">
        <h3>{board.brand}</h3>
        <span className="pv-total">{board.total} leads</span>
      </div>
      <p className="meta-dark">
        {board.stages.length === 0 ? "Waiting for Kraya sync" : board.syncedAt ? `Synced ${formatStamp(board.syncedAt)}` : "From Kraya"}
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

function brandColor(name: string): string {
  const key = name.toLowerCase();
  if (key.includes("sky")) return BRAND_COLOR.skybox;
  if (key.includes("stay")) return BRAND_COLOR.stays;
  if (key.includes("forest") || key.includes("hill")) return BRAND_COLOR.fh;
  if (key.includes("braj")) return BRAND_COLOR.braj;
  return BRAND_COLOR.skybox;
}

/* ---------------- orbit hero ---------------- */

function PublicOrbit({ snapshot, user }: { snapshot: PublicSnapshot; user: User | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OrbitScene | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<OrbitFilter>("all");
  const [paused, setPaused] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const agents = useMemo<OrbitAgent[]>(() => {
    const byName = new Map(snapshot.orbit.agents.map((agent, index) => [agent.name, `a${index}`] as const));
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
        name: row.name,
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
        scene.setLabelMode("people");
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
  useEffect(() => {
    sceneRef.current?.setPinned(picked);
  }, [picked, ready]);

  const pickedAgent = picked?.startsWith("a") ? snapshot.orbit.agents[Number(picked.slice(1))] : null;
  const pickedCrew = picked?.startsWith("c") ? snapshot.orbit.crew[Number(picked.slice(1))] : null;
  const crewTasks = pickedCrew ? snapshot.tasks.filter((task) => task.owner === pickedCrew.name && task.status !== "done") : [];

  return (
    <div className="orbit-wrap pv-hero">
      <div className="stage">
        <canvas ref={canvasRef} className="orbit-canvas" aria-label="View-only map of the team and AI agents. Drag to rotate." />
        <div ref={labelsRef} className="orbit-labels" aria-hidden="true" />
        {!ready && !failed ? <p className="orbit-fallback">Loading the orbit…</p> : null}
        {failed ? <p className="orbit-fallback">The 3D view could not start. The sections below have the same names.</p> : null}
        <div className="orbit-ctrls">
          {(["all", "ai", "crew"] as const).map((item) => (
            <button key={item} type="button" className="pillbtn" aria-pressed={filter === item} onClick={() => setFilter(item)}>
              {item === "all" ? "All" : item === "ai" ? "AI only" : "Team only"}
            </button>
          ))}
          <span className="sp" />
          <button type="button" className="pillbtn" aria-label="Zoom in" onClick={() => sceneRef.current?.zoom(-1)}>+</button>
          <button type="button" className="pillbtn" aria-label="Zoom out" onClick={() => sceneRef.current?.zoom(1)}>−</button>
          <button type="button" className="pillbtn" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
        <div className="pv-hero-copy">
          <h1>Humans and AI, one orbit</h1>
          <div className="pv-hero-stats">
            <span><b>{snapshot.open}</b> open</span>
            <span className="late"><b>{snapshot.overdue}</b> late</span>
            <span><b>{snapshot.shippedThisWeek}</b> shipped this week</span>
          </div>
          <div className="pv-hero-cta">
            <SignInButton user={user} />
            <button type="button" className="pillbtn" onClick={() => scrollToId("today")}>See today's work</button>
          </div>
        </div>
        <div className="orbit-key" aria-hidden="true">
          <span><i className="sq" />Team</span>
          <span><i style={{ background: "#5b5bff" }} />AI agent, hover for name</span>
          <span><i style={{ background: "var(--pink)" }} />No owner</span>
        </div>
        {pickedAgent || pickedCrew ? (
          <aside className="orbit-panel" aria-live="polite">
            <button type="button" className="pillbtn close" onClick={() => setPicked(null)}>Close</button>
            {pickedCrew ? (
              <>
                <p className="meta">Team</p>
                <h3>{pickedCrew.name}</h3>
                <dl>
                  <dt>Open tasks</dt><dd>{pickedCrew.open}</dd>
                </dl>
                {crewTasks.length ? (
                  <ul className="waiting">
                    {crewTasks.slice(0, 5).map((task, index) => <li key={`${task.title}-${index}`}>{task.title}</li>)}
                  </ul>
                ) : null}
              </>
            ) : pickedAgent ? (
              <>
                <p className="meta">AI agent</p>
                <h3>{pickedAgent.name}</h3>
                <span className="state" style={{ background: "var(--lime)" }}>{pickedAgent.state === "sync" ? "Awaiting first sync" : pickedAgent.state}</span>
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
