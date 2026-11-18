import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarCheck, ChartBar, ChartDonut, Eye, Funnel, ListChecks, MagnifyingGlass, Minus, Pause, Play, Plus, UsersThree } from "@phosphor-icons/react";
import type { User } from "firebase/auth";
import { addDays, kolkataDay } from "../lib/dates";
import { BRAND_COLOR, LOAD_LABEL, loadLevel } from "../lib/orbit";
import type { OrbitAgent, OrbitCrew, OrbitFilter, OrbitScene } from "../lib/orbitScene";
import type { PublicSnapshot, PublicTask } from "../lib/publicSnapshot";
import { SignInButton } from "./publicAuth";

const KIND_COLOR = { hq: "#c6ff3d", brand: "#3de8ff", dept: "#5b5bff" } as const;
const orbitScenePromise = import("../lib/orbitScene");
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 16, behavior: reduceMotion() ? "auto" : "smooth" });
}

/* ---------------- motion helpers ---------------- */

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(() => (reduceMotion() ? target : 0));
  const from = useRef(reduceMotion() ? target : 0);
  useEffect(() => {
    if (reduceMotion()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(origin + (target - origin) * eased);
      if (k < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

function Count({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const shown = useCountUp(value);
  return (
    <>
      {shown.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </>
  );
}

/* ---------------- small charts (SVG, drawn from real numbers) ---------------- */

function MiniBars({ values, labels, accent = "var(--lime)" }: { values: number[]; labels: string[]; accent?: string }) {
  const max = Math.max(1, ...values);
  const w = 120;
  const gap = 4;
  const bw = (w - gap * (values.length - 1)) / Math.max(1, values.length);
  return (
    <svg className="cp-mini" viewBox={`0 0 ${w} 40`} role="img" aria-label={labels.map((label, i) => `${label} ${values[i]}`).join(", ")}>
      {values.map((value, i) => {
        const h = Math.max(3, (value / max) * 36);
        return <rect key={i} x={i * (bw + gap)} y={40 - h} width={bw} height={h} rx={Math.min(4, bw / 2)} fill={i === values.length - 1 ? accent : "rgba(244,244,248,0.35)"} />;
      })}
    </svg>
  );
}

function SplitBar({ parts }: { parts: { value: number; color: string; label: string }[] }) {
  const total = Math.max(1, parts.reduce((sum, part) => sum + part.value, 0));
  return (
    <div className="cp-split" role="img" aria-label={parts.map((part) => `${part.value} ${part.label}`).join(", ")}>
      {parts.map((part) => (
        <span key={part.label} style={{ width: `${(part.value / total) * 100}%`, background: part.color }} />
      ))}
    </div>
  );
}

function HalfGauge({ ratio }: { ratio: number }) {
  const r = 34;
  const length = Math.PI * r;
  const shown = useCountUp(Math.max(0, Math.min(1, ratio)) * 100) / 100;
  return (
    <svg className="cp-gauge" viewBox="0 0 84 46" role="img" aria-label={`${Math.round(ratio * 100)} percent`}>
      <path d={`M 8 42 A ${r} ${r} 0 0 1 76 42`} fill="none" stroke="rgba(244,244,248,0.16)" strokeWidth="8" strokeLinecap="round" />
      <path
        d={`M 8 42 A ${r} ${r} 0 0 1 76 42`}
        fill="none"
        stroke="var(--lime)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${length * shown} ${length}`}
      />
    </svg>
  );
}

function Donut({ parts, center, sub }: { parts: { label: string; value: number; color: string }[]; center: string; sub: string }) {
  const total = Math.max(1, parts.reduce((sum, part) => sum + part.value, 0));
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="cp-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={parts.map((part) => `${part.label} ${Math.round((part.value / total) * 100)} percent`).join(", ")}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(244,244,248,0.08)" strokeWidth="16" />
        {parts.map((part) => {
          const len = (part.value / total) * c;
          const seg = (
            <circle
              key={part.label}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={part.color}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0, len - 6)} ${c}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              className="cp-arc"
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="cp-donut-center">
        <b>{center}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

function StageBars({ stages }: { stages: { name: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...stages.map((stage) => stage.count));
  // Square-root scale so a 1,300-lead top stage does not flatten every later stage.
  const scale = (n: number) => Math.sqrt(n) / Math.sqrt(max);
  return (
    <div className="cp-bars" onMouseLeave={() => setHover(null)}>
      {stages.map((stage, i) => (
        <button
          type="button"
          key={stage.name}
          className={`cp-bar${hover === i ? " is-on" : ""}`}
          onMouseEnter={() => setHover(i)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          aria-label={`${stage.name}: ${stage.count}`}
        >
          <span className="cp-bar-track">
            <span className="cp-bar-fill" style={{ height: `${Math.max(4, scale(stage.count) * 100)}%`, animationDelay: `${i * 60}ms` }} />
          </span>
          <span className="cp-bar-label">{stage.name}</span>
          {hover === i ? <span className="cp-tip">{stage.name} · {stage.count.toLocaleString("en-IN")}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ---------------- cockpit ---------------- */

type Picked = { kind: "crew"; index: number } | { kind: "agent"; index: number } | null;
type DockId = "numbers" | "leads" | "latest" | "find" | "view";

/**
 * A corner icon button that reveals a glass panel on hover (mouse) or tap/click
 * (pins it open). Esc or clicking elsewhere closes a pinned panel.
 */
function Dock({
  id,
  icon,
  label,
  open,
  pinned,
  onOpen,
  onClose,
  onPin,
  align,
  children,
}: {
  id: DockId;
  icon: ReactNode;
  label: string;
  open: boolean;
  pinned: boolean;
  onOpen: (id: DockId) => void;
  onClose: (id: DockId) => void;
  onPin: (id: DockId) => void;
  align: "tl" | "tr" | "bl" | "br";
  children: ReactNode;
}) {
  const hoverable = useRef(matchMedia("(hover: hover)").matches);
  return (
    <div
      className={`cp-dock ${align}${open ? " is-open" : ""}`}
      onMouseEnter={() => hoverable.current && onOpen(id)}
      onMouseLeave={() => hoverable.current && !pinned && onClose(id)}
    >
      <button
        type="button"
        className={`cp-icon glass${open ? " is-on" : ""}`}
        aria-expanded={open}
        aria-controls={`cp-panel-${id}`}
        aria-label={label}
        title={label}
        onClick={() => onPin(id)}
      >
        {icon}
      </button>
      <div id={`cp-panel-${id}`} className="cp-pop glass" role="dialog" aria-label={label} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

export function PublicCockpit({ snapshot, user }: { snapshot: PublicSnapshot; user: User | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OrbitScene | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<OrbitFilter>("all");
  const [paused, setPaused] = useState(false);
  const [picked, setPicked] = useState<Picked>(null);
  const [query, setQuery] = useState("");
  const [dock, setDock] = useState<{ id: DockId | null; pinned: boolean }>({ id: null, pinned: false });

  const openDock = (id: DockId) => setDock((cur) => (cur.pinned && cur.id !== id ? cur : { id, pinned: cur.pinned && cur.id === id }));
  const closeDock = (id: DockId) => setDock((cur) => (cur.id === id && !cur.pinned ? { id: null, pinned: false } : cur));
  const pinDock = (id: DockId) => setDock((cur) => (cur.id === id && cur.pinned ? { id: null, pinned: false } : { id, pinned: true }));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDock({ id: null, pinned: false });
        setPicked(null);
      }
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".cp-dock")) setDock((cur) => (cur.pinned ? { id: null, pinned: false } : cur));
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

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
    () => snapshot.orbit.crew.map((row, index) => ({ id: `c${index}`, name: row.name, count: row.open, level: loadLevel(row.open) })),
    [snapshot],
  );
  const comets = useMemo(() => Array.from({ length: snapshot.orbit.unowned }, (_, index) => `u${index}`), [snapshot.orbit.unowned]);

  useEffect(() => {
    let disposed = false;
    let scene: OrbitScene | null = null;
    orbitScenePromise
      .then(({ OrbitScene }) => {
        if (disposed || !canvasRef.current || !labelsRef.current) return;
        scene = new OrbitScene(canvasRef.current, labelsRef.current, {
          onNode: (id) => setPicked(id.startsWith("c") ? { kind: "crew", index: Number(id.slice(1)) } : { kind: "agent", index: Number(id.slice(1)) }),
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

  useEffect(() => { if (ready) sceneRef.current?.setAgents(agents); }, [ready, agents]);
  useEffect(() => { if (ready) sceneRef.current?.setCrew(crew); }, [ready, crew]);
  useEffect(() => { if (ready) sceneRef.current?.setComets(comets, null); }, [ready, comets]);
  useEffect(() => { sceneRef.current?.setFilter(filter); }, [filter, ready]);
  useEffect(() => { sceneRef.current?.setPaused(paused); }, [paused, ready]);
  useEffect(() => {
    sceneRef.current?.setPinned(picked ? `${picked.kind === "crew" ? "c" : "a"}${picked.index}` : null);
  }, [picked, ready]);

  /* ---- derived numbers, all from the published snapshot ---- */
  const today = kolkataDay();
  const tasks = snapshot.tasks;
  const active = tasks.filter((task) => task.status !== "done");
  const unowned = snapshot.orbit.unowned;
  const owned = Math.max(0, snapshot.open - unowned);
  const lateBy = new Map<string, number>();
  for (const task of tasks) if (task.status === "overdue") lateBy.set(task.owner, (lateBy.get(task.owner) ?? 0) + 1);
  const lateRows = [...lateBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const hasClosed = tasks.some((task) => task.closed);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const closedPerDay = week.map((day) => tasks.filter((task) => task.closed === day).length);
  const team = snapshot.crew.filter((row) => !/^everyone$/i.test(row.name));
  const withRoom = team.filter((row) => row.open <= 4).length;

  const leadParts = snapshot.pipeline
    .filter((board) => board.total > 0)
    .map((board) => ({ label: board.brand, value: board.total, color: /sky/i.test(board.brand) ? BRAND_COLOR.skybox : BRAND_COLOR.stays }));
  const leadTotal = leadParts.reduce((sum, part) => sum + part.value, 0);
  const boards = snapshot.pipeline.filter((board) => board.stages.length > 0);
  const [boardIndex, setBoardIndex] = useState(0);
  const board = boards[Math.min(boardIndex, Math.max(0, boards.length - 1))];

  const latest = [...active]
    .sort((a, b) => (b.given ?? "").localeCompare(a.given ?? "") || (a.status === "overdue" ? -1 : 1))
    .slice(0, 5);

  const q = query.trim().toLowerCase();
  const results = q
    ? [
        ...snapshot.crew
          .map((row, index) => ({ type: "crew" as const, index, label: row.name, sub: `${row.open} open` }))
          .filter((row) => row.label.toLowerCase().includes(q)),
        ...snapshot.orbit.agents
          .map((agent, index) => ({ type: "agent" as const, index, label: agent.name, sub: "AI agent" }))
          .filter((row) => row.label.toLowerCase().includes(q)),
        ...active
          .filter((task) => task.title.toLowerCase().includes(q))
          .map((task) => ({ type: "task" as const, index: snapshot.crew.findIndex((row) => row.name === task.owner), label: task.title, sub: task.owner })),
      ].slice(0, 7)
    : [];

  const pickedCrew = picked?.kind === "crew" ? snapshot.orbit.crew[picked.index] : null;
  const pickedAgent = picked?.kind === "agent" ? snapshot.orbit.agents[picked.index] : null;
  const dockProps = (id: DockId) => ({ id, open: dock.id === id, pinned: dock.pinned && dock.id === id, onOpen: openDock, onClose: closeDock, onPin: pinDock });

  return (
    <div ref={rootRef} className="cp">
      <div className="stage cp-stage">
        <canvas ref={canvasRef} className="orbit-canvas" aria-label="Live map of the team and AI agents. Drag to rotate, click a name for details." />
        <div ref={labelsRef} className="orbit-labels" aria-hidden="true" />
        {!ready && !failed ? <p className="orbit-fallback">Loading the orbit…</p> : null}
        {failed ? <p className="orbit-fallback">The 3D view could not start. Use the corner buttons and the sections below.</p> : null}
      </div>

      {/* top left: brand + search + sections */}
      <div className="cp-corner tl">
        <p className="cp-logo glass"><i aria-hidden="true" />Luxsugero HQ</p>
        <Dock {...dockProps("find")} align="tl" icon={<MagnifyingGlass size={20} weight="bold" />} label="Search people, agents and tasks">
          <label htmlFor="cp-search" className="sr-only">Search people, agents and tasks</label>
          <input
            id="cp-search"
            className="cp-search-input"
            type="search"
            placeholder="Search people, agents, tasks"
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => pinDock("find")}
          />
          {results.length ? (
            <ul className="cp-results">
              {results.map((row, i) => (
                <li key={`${row.type}-${row.label}-${i}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (row.type === "agent") setPicked({ kind: "agent", index: row.index });
                      else if (row.index >= 0) setPicked({ kind: "crew", index: row.index });
                      setQuery("");
                      setDock({ id: null, pinned: false });
                    }}
                  >
                    <b>{row.label}</b>
                    <span>{row.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : q ? <p className="cp-sub">No match.</p> : <p className="cp-sub">Try a name like Shrishti, an agent like Sales Head, or a task word.</p>}
        </Dock>
        <nav className="cp-sections" aria-label="Sections">
          <button type="button" className="cp-icon glass" title="Today" aria-label="Today" onClick={() => scrollToId("today")}><CalendarCheck size={20} weight="bold" /></button>
          <button type="button" className="cp-icon glass" title="Team and AI" aria-label="Team and AI" onClick={() => scrollToId("team")}><UsersThree size={20} weight="bold" /></button>
          <button type="button" className="cp-icon glass" title="Pipeline" aria-label="Pipeline" onClick={() => scrollToId("pipeline")}><Funnel size={20} weight="bold" /></button>
        </nav>
      </div>

      {/* top right: view filter + account */}
      <div className="cp-corner tr">
        <Dock {...dockProps("view")} align="tr" icon={<Eye size={20} weight="bold" />} label="What to show on the map">
          <h3>Show on the map</h3>
          <div className="cp-seg" role="group" aria-label="Show on the map">
            {(["all", "crew", "ai"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>
                {item === "all" ? "Everyone" : item === "crew" ? "Team" : "AI agents"}
              </button>
            ))}
          </div>
          <ul className="cp-key">
            <li><i className="sq" />Teammate, pill shows open tasks</li>
            <li><i style={{ background: "#5b5bff" }} />AI agent, hover to see the name</li>
            <li><i style={{ background: "var(--pink)" }} />Task with no owner</li>
          </ul>
        </Dock>
        <SignInButton user={user} className="cp-signin" label={user ? undefined : "Sign in"} />
      </div>

      {/* bottom left: numbers, lead mix, latest */}
      <div className="cp-corner bl">
        <Dock {...dockProps("numbers")} align="bl" icon={<ChartBar size={20} weight="bold" />} label="Key numbers">
          <div className="cp-kpis">
            <article className="cp-kpi">
              <h3>Open tasks</h3>
              <p className="cp-num"><Count value={snapshot.open} /></p>
              <span className="cp-pill pink">{unowned} no owner</span>
              <SplitBar parts={[{ value: owned, color: "var(--lime)", label: "owned" }, { value: unowned, color: "var(--pink)", label: "no owner" }]} />
            </article>
            <article className="cp-kpi">
              <h3>Late</h3>
              <p className="cp-num"><Count value={snapshot.overdue} /></p>
              <span className="cp-pill">{snapshot.open ? Math.round((snapshot.overdue / snapshot.open) * 100) : 0}% of open</span>
              <MiniBars values={lateRows.map((row) => row[1])} labels={lateRows.map((row) => row[0])} accent="var(--pink)" />
            </article>
            <article className="cp-kpi">
              <h3>Shipped this week</h3>
              <p className="cp-num"><Count value={snapshot.shippedThisWeek} /></p>
              <span className="cp-pill lime">{hasClosed ? `${closedPerDay[6]} today` : "Since Monday"}</span>
              {hasClosed ? <MiniBars values={closedPerDay} labels={week} /> : <SplitBar parts={[{ value: snapshot.shippedThisWeek, color: "var(--lime)", label: "shipped" }, { value: snapshot.open, color: "rgba(244,244,248,0.16)", label: "open" }]} />}
            </article>
            <article className="cp-kpi">
              <h3>Team with room</h3>
              <p className="cp-num"><Count value={withRoom} /><small> of {team.length}</small></p>
              <span className="cp-pill">4 or fewer open</span>
              <HalfGauge ratio={team.length ? withRoom / team.length : 0} />
            </article>
          </div>
        </Dock>
        <Dock {...dockProps("leads")} align="bl" icon={<ChartDonut size={20} weight="bold" />} label="Leads and pipeline">
          <div className="cp-chart-row">
            <div>
              <h3>Lead mix</h3>
              <p className="cp-sub">Kraya leads by brand</p>
              {leadParts.length ? (
                <div className="cp-mix">
                  <Donut parts={leadParts} center={leadTotal.toLocaleString("en-IN")} sub="leads" />
                  <ul className="cp-legend">
                    {leadParts.map((part) => (
                      <li key={part.label}>
                        <span><i style={{ background: part.color }} />{part.label}</span>
                        <b>{Math.round((part.value / leadTotal) * 100)}%</b>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : <p className="cp-sub">Waiting for the first Kraya sync.</p>}
            </div>
            <div className="cp-chart-wide">
              <div className="cp-card-head">
                <div>
                  <h3>Pipeline stages</h3>
                  <p className="cp-sub">Hover a bar for the count</p>
                </div>
                {boards.length > 1 ? (
                  <label className="cp-select">
                    <span className="sr-only">Brand</span>
                    <select value={boardIndex} onChange={(event) => setBoardIndex(Number(event.target.value))}>
                      {boards.map((item, i) => <option key={item.brand} value={i}>{item.brand}</option>)}
                    </select>
                  </label>
                ) : null}
              </div>
              {board ? <StageBars key={board.brand} stages={board.stages.filter((stage) => stage.count > 0)} /> : <p className="cp-sub">Waiting for the first Kraya sync.</p>}
            </div>
          </div>
        </Dock>
        <Dock {...dockProps("latest")} align="bl" icon={<ListChecks size={20} weight="bold" />} label="Latest work">
          <div className="cp-card-head">
            <h3>Latest work</h3>
            <button type="button" className="cp-link" onClick={() => scrollToId("team")}>View all</button>
          </div>
          <ul className="cp-latest">
            {latest.map((task, i) => (
              <li key={`${task.title}-${i}`}>
                <span className={`cp-avatar who-${task.ownerKind ?? "person"}`} aria-hidden="true">{task.ownerKind === "ai" ? "AI" : task.owner.slice(0, 1)}</span>
                <div>
                  <b>{task.owner}{task.status === "overdue" ? <em className="cp-late">late</em> : null}</b>
                  <span title={task.title}>{task.title}</span>
                </div>
              </li>
            ))}
          </ul>
        </Dock>
      </div>

      {/* bottom right: map controls + scroll on */}
      <div className="cp-corner br">
        <button type="button" className="cp-icon glass" aria-label="Zoom in" title="Zoom in" onClick={() => sceneRef.current?.zoom(-1)}><Plus size={18} weight="bold" /></button>
        <button type="button" className="cp-icon glass" aria-label="Zoom out" title="Zoom out" onClick={() => sceneRef.current?.zoom(1)}><Minus size={18} weight="bold" /></button>
        <button type="button" className="cp-icon glass" aria-label={paused ? "Play" : "Pause"} title={paused ? "Play" : "Pause"} aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
          {paused ? <Play size={18} weight="bold" /> : <Pause size={18} weight="bold" />}
        </button>
        <button type="button" className="cp-today glass" onClick={() => scrollToId("today")}>
          <span><b>{snapshot.open}</b> open</span>
          <span className="late"><b>{snapshot.overdue}</b> late</span>
          <span>Today's work</span>
        </button>
      </div>

      {/* person / agent detail slides in on the right */}
      <div className={`cp-detail-wrap${pickedCrew || pickedAgent ? " is-open" : ""}`}>
        <div className="cp-detail glass" aria-live="polite">
          {pickedCrew ? <CrewDetail name={pickedCrew.name} open={pickedCrew.open} tasks={tasks.filter((task) => task.owner === pickedCrew.name)} user={user} onClose={() => setPicked(null)} /> : null}
          {pickedAgent ? (
            <AgentDetail
              name={pickedAgent.name}
              state={pickedAgent.state}
              reportsTo={pickedAgent.reportsTo}
              tasks={tasks.filter((task) => task.owner === pickedAgent.name)}
              user={user}
              onClose={() => setPicked(null)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TaskMiniList({ tasks }: { tasks: PublicTask[] }) {
  const active = tasks.filter((task) => task.status !== "done").sort((a, b) => (a.status === "overdue" ? -1 : 0) - (b.status === "overdue" ? -1 : 0));
  if (!active.length) return <p className="cp-sub">Nothing open.</p>;
  return (
    <ul className="cp-tasks">
      {active.slice(0, 5).map((task, i) => (
        <li key={`${task.title}-${i}`} className={task.status}>
          <span title={task.title}>{task.title}</span>
          {task.status === "overdue" ? <em>late</em> : null}
        </li>
      ))}
      {active.length > 5 ? <li className="more">+{active.length - 5} more</li> : null}
    </ul>
  );
}

function CrewDetail({ name, open, tasks, user, onClose }: { name: string; open: number; tasks: PublicTask[]; user: User | null; onClose: () => void }) {
  const level = loadLevel(open);
  const late = tasks.filter((task) => task.status === "overdue").length;
  return (
    <>
      <div className={`cp-detail-hero lv-${level}`}>
        <span className="cp-badge">{LOAD_LABEL[level]}</span>
        <button type="button" className="cp-close" onClick={onClose} aria-label="Close details">×</button>
        <h3>{name}</h3>
        <p>Team</p>
      </div>
      <div className="cp-detail-stats">
        <div><b>{open}</b><span>open</span></div>
        <div><b>{late}</b><span>late</span></div>
        <div><b>{tasks.filter((task) => task.status === "done").length}</b><span>done this week</span></div>
      </div>
      <TaskMiniList tasks={tasks} />
      <SignInButton user={user} className="cp-cta" label={user ? `Assign work to ${name}` : `Sign in to assign ${name}`} />
    </>
  );
}

function AgentDetail({ name, state, reportsTo, tasks, user, onClose }: { name: string; state: string; reportsTo: string; tasks: PublicTask[]; user: User | null; onClose: () => void }) {
  return (
    <>
      <div className="cp-detail-hero ai">
        <span className="cp-badge">{state === "sync" ? "Awaiting first sync" : state}</span>
        <button type="button" className="cp-close" onClick={onClose} aria-label="Close details">×</button>
        <h3>{name}</h3>
        <p>AI agent{reportsTo ? ` · reports to ${reportsTo}` : ""}</p>
      </div>
      <TaskMiniList tasks={tasks} />
      <SignInButton user={user} className="cp-cta" label={user ? "Send a directive in HQ" : "Sign in to direct this agent"} />
    </>
  );
}
