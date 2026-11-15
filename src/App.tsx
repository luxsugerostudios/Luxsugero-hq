import { useEffect, useState } from "react";
import { AgentsPanel } from "./components/AgentsPanel";
import { BrandsPanel } from "./components/BrandsPanel";
import { bannerCopy, Header } from "./components/Header";
import { PipelinePanel } from "./components/PipelinePanel";
import { TasksPanel } from "./components/TasksPanel";
import { HqProvider, useHqContext, type Phase } from "./lib/hq";

const TABS = [
  { id: "tasks", label: "Tasks" },
  { id: "agents", label: "Agents" },
  { id: "pipeline", label: "Pipeline" },
  { id: "brands", label: "Brands" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFromHash(): TabId {
  const hash = window.location.hash.replace("#", "");
  return TABS.some((tab) => tab.id === hash) ? (hash as TabId) : "tasks";
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
  const [tab, setTab] = useState<TabId>(tabFromHash);
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
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const banner = bannerCopy(hq.phase);
  const mode =
    hq.phase === "live"
      ? hq.canEdit
        ? "Editing"
        : hq.viewOnly
          ? "View only"
          : "Public view"
      : "Seed data · read only";

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />
      {banner ? (
        <p className="banner" role="status">
          {banner}
        </p>
      ) : null}
      {hq.actionError ? (
        <p className="banner error" role="alert">
          {hq.actionError}{" "}
          <button type="button" className="ghost" onClick={hq.clearActionError}>
            Dismiss
          </button>
        </p>
      ) : null}
      <div className="tabs" role="tablist" aria-label="Sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="main"
            className={tab === item.id ? "is-on" : ""}
            onClick={() => {
              setTab(item.id);
              history.replaceState(null, "", `#${item.id}`);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <main id="main" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "tasks" ? <TasksPanel /> : null}
        {tab === "agents" ? <AgentsPanel /> : null}
        {tab === "pipeline" ? <PipelinePanel /> : null}
        {tab === "brands" ? <BrandsPanel /> : null}
      </main>
      <footer>
        <span>Luxsugero · New Delhi</span>
        <span>{mode}</span>
      </footer>
    </div>
  );
}

export type { Phase };
