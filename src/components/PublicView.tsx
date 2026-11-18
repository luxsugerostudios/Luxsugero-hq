import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { isFirebaseConfigured } from "../firebaseConfig";
import { formatStamp } from "../lib/dates";
import { getServices } from "../lib/firebase";
import { loadSeed } from "../lib/map";
import { BRAND_COLOR, LOAD_LABEL, loadLevel } from "../lib/orbit";
import type { OrbitAgent, OrbitCrew, OrbitFilter, OrbitScene } from "../lib/orbitScene";
import { buildPublicSnapshot, type PublicSnapshot } from "../lib/publicSnapshot";

const KIND_COLOR = { hq: "#c6ff3d", brand: "#3de8ff", dept: "#5b5bff" } as const;

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

function PublicBody({ snapshot }: { snapshot: PublicSnapshot }) {
  const maxLoad = Math.max(1, ...snapshot.crew.map((row) => row.open));
  return (
    <section className="pulse" aria-label="Public view">
      <PublicOrbit snapshot={snapshot} />
      <div className="section-head big-head">
        <h2>Studio pulse</h2>
        <p className="meta">Counts and first names. No notes, no inbox, no contact details.</p>
      </div>
      <div className="bento">
        <article className="tile t-lime">
          <h3>Open tasks</h3>
          <p className="num huge">{snapshot.open}</p>
        </article>
        <article className="tile t-pink">
          <h3>Overdue</h3>
          <p className="num mid">{snapshot.overdue}</p>
        </article>
        <article className="tile t-blue">
          <h3>Shipped this week</h3>
          <p className="num mid">{snapshot.shippedThisWeek}</p>
        </article>
        <article className="tile t-crew">
          <h3>Crew load</h3>
          <div className="crew">
            {snapshot.crew.map((row) => (
              <div className="cr" key={`${row.name}-${row.title}`}>
                <span>{row.title ? `${row.name} · ${row.title}` : row.name}</span>
                <span className="cbar">
                  <span className={`load-${loadLevel(row.open)}`} style={{ width: `${Math.max((row.open / maxLoad) * 100, row.open ? 6 : 2)}%` }} />
                </span>
                <b>{row.open}</b>
              </div>
            ))}
          </div>
        </article>
        <article className="tile t-brands">
          <h3>Brands</h3>
          <div className="brands">
            {snapshot.brands.map((brand) => (
              <article key={brand.name} className="brand-item">
                <span className="orb" aria-hidden="true" style={{ ["--orb" as string]: brandColor(brand.name) }} />
                <div>
                  <h4>{brand.name}</h4>
                  <span className={`chip-status status-${brand.status}`}>{brand.status}</span>
                </div>
              </article>
            ))}
          </div>
        </article>
        <article className="tile t-orange">
          <h3>Kraya</h3>
          {snapshot.pipeline.every((board) => board.stages.length === 0) ? <p>Waiting for Kraya sync</p> : null}
          {snapshot.pipeline.map((board) => (
            <div key={board.brand} className="stack">
              <p className="meta-dark">
                {board.brand}
                {board.syncedAt ? ` · Synced from Kraya ${formatStamp(board.syncedAt)}` : ""}
                {board.stages.length === 0 ? " · Waiting for Kraya sync" : ` · ${board.total}`}
              </p>
              <div className="funnel-bars">
                {board.stages.map((stage) => (
                  <div className="fr" key={stage.name}>
                    <span>{stage.name}</span>
                    <span className="fbar"><span style={{ width: `${board.total ? (stage.count / board.total) * 100 : 0}%` }} /></span>
                    <b>{stage.count}</b>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </article>
      </div>
      <h3 className="list-head">Observations</h3>
      <p className="meta">HQ insights. Counts only.</p>
      {(snapshot.insights?.observations.length ?? 0) === 0 ? <p className="empty">Nothing to flag from the published counts.</p> : null}
      <ul className="mini">
        {snapshot.insights?.observations.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <h3 className="list-head">Recommendations</h3>
      {(snapshot.insights?.recommendations.length ?? 0) === 0 ? <p className="empty">No recommendation from these counts.</p> : null}
      <ul className="mini">
        {snapshot.insights?.recommendations.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <h3 className="list-head">Board</h3>
      {snapshot.tasks.length === 0 ? <p className="empty">No tasks in this view.</p> : null}
      <div className="stack">
        {snapshot.tasks.map((task) => (
          <article key={`${task.owner}-${task.title}`} className="task">
            <h4>{task.title}</h4>
            <p className="meta">{task.owner} · {task.status}</p>
          </article>
        ))}
      </div>
    </section>
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
    import("../lib/orbitScene")
      .then(({ OrbitScene }) => {
        if (disposed || !canvasRef.current || !labelsRef.current) return;
        scene = new OrbitScene(canvasRef.current, labelsRef.current, {
          onNode: () => undefined,
          onComet: () => undefined,
          onEmpty: () => undefined,
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

  return (
    <div className="orbit-wrap">
      <div className="stage">
        <canvas ref={canvasRef} className="orbit-canvas" aria-label="View-only map of the team and agents. Drag to rotate." />
        <div ref={labelsRef} className="orbit-labels" aria-hidden="true" />
        {failed ? <p className="orbit-fallback">The 3D view could not start. The lists below have the same names.</p> : null}
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
      </div>
    </div>
  );
}
