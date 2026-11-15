import { useEffect, useState } from "react";
import { AgentsPanel } from "./components/AgentsPanel";
import { Header, bannerCopy } from "./components/Header";
import { InboxPanel } from "./components/InboxPanel";
import { OverviewPanel } from "./components/OverviewPanel";
import { PipelinePanel } from "./components/PipelinePanel";
import { TasksPanel } from "./components/TasksPanel";
import { HqProvider, useHqContext } from "./lib/hq";

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "mine", label: "My tasks" },
  { id: "board", label: "Team board" },
  { id: "inbox", label: "Main bucket" },
  { id: "pipeline", label: "Pipeline" },
  { id: "agents", label: "Agents" },
] as const;

type NavId = (typeof NAV)[number]["id"];

function navFromHash(): NavId {
  const hash = window.location.hash.replace("#", "");
  return NAV.some((item) => item.id === hash) ? (hash as NavId) : "overview";
}

export function App() {
  return (
    <HqProvider>
      <Shell />
    </HqProvider>
  );
}

function Shell() {
  const hq = useHqContext();
  const [nav, setNav] = useState<NavId>(navFromHash);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("hq-theme", theme);
    } catch {
      /* ignore private-mode storage failures */
    }
  }, [theme]);

  useEffect(() => {
    const onHash = () => setNav(navFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const banner = bannerCopy(hq.phase);
  const loading = hq.configured && hq.phase === "connecting";

  function select(id: NavId) {
    setNav(id);
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <p className="brand"><span>Luxsugero</span> HQ</p>
        <Header theme={theme} onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))} />
      </header>
      <div className="frame">
        <nav className="sidenav" aria-label="Sections">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={nav === item.id ? "is-on" : ""}
              aria-current={nav === item.id ? "page" : undefined}
              onClick={() => select(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <main id="main" className="content">
          {banner ? <p className="banner" role="status">{banner}</p> : null}
          {hq.actionError ? (
            <p className="banner error" role="alert">
              {hq.actionError}{" "}
              <button type="button" className="ghost" onClick={hq.clearActionError}>Dismiss</button>
            </p>
          ) : null}
          {loading ? <p className="empty">Loading…</p> : null}
          {!loading && nav === "overview" ? <OverviewPanel /> : null}
          {!loading && nav === "mine" ? <TasksPanel mode="mine" /> : null}
          {!loading && nav === "board" ? <TasksPanel mode="board" /> : null}
          {!loading && nav === "inbox" ? <InboxPanel /> : null}
          {!loading && nav === "pipeline" ? <PipelinePanel /> : null}
          {!loading && nav === "agents" ? <AgentsPanel /> : null}
        </main>
      </div>
    </div>
  );
}
