import { useEffect, useMemo, useState } from "react";
import { formatDay, kolkataDay } from "../lib/dates";
import { buildInsights } from "../lib/insights";
import { useHqContext } from "../lib/hq";
import { BRAND_COLOR, loadLevel, orgSeat } from "../lib/orbit";
import { visibleTasks } from "../lib/tasks";
import { actorName } from "./TasksPanel";
import { AgeBadge } from "./ui/AgeBadge";
import { PersonPicker } from "./ui/PersonPicker";
import { TaskDrawer } from "./ui/TaskDrawer";
import type { Agent, BrandId, InboxItem, Person } from "../lib/types";
import { BRAND_IDS } from "../lib/types";

function tagGroups(people: Person[], agents: Agent[]) {
  const humans = people.filter((person) => person.id !== "unassigned");
  return [
    {
      label: "People",
      ids: humans.map((person) => ({
        id: person.id,
        label: orgSeat(person.id)?.name ?? person.name,
      })),
    },
    {
      label: "Brand PMs",
      ids: agents.filter((agent) => agent.group === "Brand PM").map((agent) => ({ id: agent.id, label: agent.name })),
    },
    {
      label: "Departments",
      ids: [
        { id: "HQ", label: "HQ" },
        ...agents.filter((agent) => agent.group !== "Brand PM").map((agent) => ({ id: agent.id, label: agent.name })),
      ],
    },
  ];
}

export function InboxPanel() {
  const hq = useHqContext();
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [tab, setTab] = useState<InboxItem["status"]>("new");
  const [selected, setSelected] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState("");
  const [composing, setComposing] = useState(false);
  const [linked, setLinked] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const today = kolkataDay();
  const needle = query.trim().toLowerCase();
  const items = hq.data.inbox
    .filter((item) => (brand === "all" ? true : item.brand === brand))
    .filter((item) =>
      needle ? `${item.title} ${item.details} ${item.note ?? ""}`.toLowerCase().includes(needle) : true,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tabItems = items.filter((item) => item.status === tab);
  const current = tabItems.find((item) => item.id === selected) ?? tabItems[0] ?? null;
  const insights = buildInsights(visibleTasks(hq.data.tasks), hq.data.people, hq.data.leads, hq.data.agents, hq.data.brands, today);
  const lightest = useMemo(() => {
    const rows = insights.workload.filter((row) => row.personId !== "unassigned" && row.personId !== "everyone");
    return [...rows].sort((a, b) => a.count - b.count)[0];
  }, [insights.workload]);

  useEffect(() => {
    if (!current) return;
    const tagged = current.assignees
      .map((id) => insights.workload.find((row) => row.personId === id))
      .filter((row): row is { personId: string; count: number } => Boolean(row))
      .sort((a, b) => a.count - b.count)[0];
    setOwnerId(tagged?.personId ?? lightest?.personId ?? hq.data.people[0]?.id ?? "");
  }, [current?.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (!tabItems.length) return;
      const index = Math.max(0, tabItems.findIndex((item) => item.id === current?.id));
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        const next = tabItems[index + (event.key === "j" ? 1 : -1)];
        if (next) setSelected(next.id);
      }
      if (event.key === "Enter" && current && hq.isAdmin && !current.taskId) {
        event.preventDefault();
        void hq.convertInbox(current, ownerId).then(() => setSelected(tabItems[index + 1]?.id ?? null)).catch(() => undefined);
      }
      if (event.key.toLowerCase() === "d" && current && (hq.isAdmin || hq.isMember)) {
        event.preventDefault();
        void hq.updateInbox(current.id, { status: "done" }).then(() => setSelected(tabItems[index + 1]?.id ?? null)).catch(() => undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabItems, current, hq, ownerId]);

  return (
    <section aria-labelledby="inbox-heading">
      <div className="section-head page-head">
        <h2 id="inbox-heading">Main bucket</h2>
        {(hq.isAdmin || hq.isMember) && hq.personId ? (
          <button type="button" className="primary" onClick={() => setComposing(true)}>New request</button>
        ) : <p className="meta">Sign in with a registered account to add a request.</p>}
      </div>
      {hq.access === "guest" && hq.phase === "live" ? (
        <p className="banner" role="status">
          Ask the founder to add your email
        </p>
      ) : null}
      <div className="toolbar">
        <label>
          Search
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search requests" />
        </label>
        <label>
          Brand
          <select value={brand} onChange={(event) => setBrand(event.target.value)}>
            <option value="all">All brands</option>
            {BRAND_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="filters" role="tablist">
        {(["new", "picked_up", "done"] as const).map((status) => (
          <Filterish
            key={status}
            pressed={tab === status}
            onClick={() => setTab(status)}
            label={`${status === "picked_up" ? "Picked up" : status[0].toUpperCase() + status.slice(1)} ${items.filter((item) => item.status === status).length}`}
          />
        ))}
      </div>
      <div className={`triage${sheet ? " is-sheet" : ""}`}>
        <div className="triage-list">
          {tabItems.length === 0 ? <p className="empty">Nothing in this tab.</p> : null}
          {tabItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="row-item"
              aria-pressed={current?.id === item.id}
              onClick={() => { setSelected(item.id); setSheet(true); }}
            >
              <span>{item.title}</span>
              <span className="meta">{actorName(item.raisedBy, hq.data.people)}</span>
              {item.brand ? <i className="age-badge" style={{ background: BRAND_COLOR[item.brand] }}>{item.brand}</i> : null}
              <span className="meta">{item.dueDate ? formatDay(item.dueDate) : "No date"}</span>
              <AgeBadge task={{ status: "open", givenDate: item.createdAt.slice(0, 10), flagAfterDays: null, longTerm: false }} today={today} />
            </button>
          ))}
        </div>
        <div className="triage-mid">
          {current ? (
            <DeskDetail
              item={current}
              ownerId={ownerId}
              onOwner={setOwnerId}
              onDone={() => {
                const index = tabItems.findIndex((item) => item.id === current.id);
                setSelected(tabItems[index + 1]?.id ?? tabItems[index - 1]?.id ?? null);
                setSheet(false);
              }}
              onOpenTask={setLinked}
            />
          ) : <p className="empty">Pick a request.</p>}
          {sheet ? <button type="button" className="ghost" onClick={() => setSheet(false)}>Back to list</button> : null}
        </div>
        <aside className="triage-load">
          <h3>Crew load</h3>
          {insights.workload.filter((row) => row.personId !== "unassigned").map((row) => (
            <p key={row.personId} className="meta">{orgSeat(row.personId)?.name ?? actorName(row.personId, hq.data.people)} · {loadLevel(row.count)} · {row.count}</p>
          ))}
          {lightest ? <p className="meta">{orgSeat(lightest.personId)?.name ?? actorName(lightest.personId, hq.data.people)} has the most room ({lightest.count}).</p> : null}
        </aside>
      </div>
      {composing ? (
        <div className="drawer-back" onClick={() => setComposing(false)}>
          <aside className="drawer" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="ghost" onClick={() => setComposing(false)}>Close</button>
            <RequestForm onDone={() => setComposing(false)} />
          </aside>
        </div>
      ) : null}
      {linked ? <TaskDrawer taskId={linked} onClose={() => setLinked(null)} /> : null}
    </section>
  );
}

function DeskDetail({
  item,
  ownerId,
  onOwner,
  onDone,
  onOpenTask,
}: {
  item: InboxItem;
  ownerId: string;
  onOwner: (id: string) => void;
  onDone: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const hq = useHqContext();
  const [due, setDue] = useState(item.dueDate ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const linked = item.taskId || hq.data.tasks.find((task) => task.inboxId === item.id)?.id || null;
  const tagged = Boolean(hq.personId && item.assignees.includes(hq.personId));
  const canAct = hq.isAdmin || (hq.isMember && tagged);
  return (
    <article className="lead">
      <h3>{item.title}</h3>
      <p>{item.details}</p>
      <p className="meta">Raised by {actorName(item.raisedBy, hq.data.people)}{item.brand ? ` · ${item.brand}` : ""}</p>
      {linked ? <button type="button" className="chip" onClick={() => onOpenTask(linked)}>Linked to task</button> : null}
      <TagGroups groups={tagGroups(hq.data.people, hq.data.agents)} tags={item.assignees} onChange={(tags) => {
        if (!hq.isAdmin) return;
        void hq.updateInbox(item.id, { assignees: tags }).catch(() => undefined);
      }} />
      {item.note ? <p className="focus">{item.note}</p> : null}
      {hq.isAdmin || (hq.isMember && (tagged || item.raisedBy === hq.personId)) ? (
        <form className="stack" onSubmit={(event) => { event.preventDefault(); void hq.updateInbox(item.id, { note: note.trim() || null }).catch(() => undefined); }}>
          <label>Founder note<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} /></label>
          <button type="submit" className="ghost">Save note</button>
        </form>
      ) : <p className="meta">Only the founder, an admin, or a tagged member can write a note.</p>}
      {hq.isAdmin ? (
        <>
          <p className="meta">Make this a task for</p>
          <PersonPicker value={ownerId} onChange={onOwner} listenKeys />
          <div className="row">
            <button type="button" className="primary" disabled={Boolean(linked)} onClick={() => void hq.convertInbox(item, ownerId).then(onDone).catch(() => undefined)}>
              {linked ? "Linked to task" : "Make task"}
            </button>
            <button type="button" className="ghost" onClick={() => void hq.updateInbox(item.id, { status: "done" }).then(onDone).catch(() => undefined)}>Mark done</button>
          </div>
          <label>
            Set due
            <input type="date" value={due} onChange={(event) => {
              setDue(event.target.value);
              void hq.updateInbox(item.id, { dueDate: event.target.value || null }).catch(() => undefined);
            }} />
          </label>
        </>
      ) : canAct && item.status === "new" && !linked ? (
        <button type="button" className="tick" onClick={() => void hq.acceptInbox(item).then(onDone).catch(() => undefined)}>Accept</button>
      ) : <p className="meta">{hq.isMember ? "Accept is only for a tagged teammate on a new request." : "Sign in to act on this request."}</p>}
      {canAct && item.status !== "done" && !hq.isAdmin ? (
        <button type="button" className="ghost" onClick={() => void hq.updateInbox(item.id, { status: "done" }).then(onDone).catch(() => undefined)}>Mark done</button>
      ) : null}
    </article>
  );
}

function RequestForm({ onDone }: { onDone?: () => void }) {
  const { data, createInbox, personId } = useHqContext();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [brand, setBrand] = useState<"" | BrandId>("");
  const [tags, setTags] = useState<string[]>(["HQ"]);

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!personId || tags.length === 0) return;
        const now = new Date().toISOString();
        const item: InboxItem = {
          id: crypto.randomUUID(),
          title: title.trim(),
          details: details.trim(),
          raisedBy: personId,
          assignees: tags,
          dueDate: dueDate || null,
          brand: brand || null,
          status: "new",
          response: null,
          note: null,
          taskId: null,
          createdAt: now,
          updatedAt: now,
        };
        void createInbox(item)
          .then(() => {
            setTitle("");
            setDetails("");
            setTags(["HQ"]);
          })
          .then(() => onDone?.())
          .catch(() => undefined);
      }}
    >
      <label className="wide">
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required />
      </label>
      <label className="wide">
        Details
        <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={3} maxLength={4000} required />
      </label>
      <TagGroups groups={tagGroups(data.people, data.agents)} tags={tags} onChange={setTags} />
      <label>
        Due
        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
      </label>
      <label>
        Brand
        <select value={brand} onChange={(event) => setBrand(event.target.value as "" | BrandId)}>
          <option value="">None</option>
          {BRAND_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="primary" disabled={tags.length === 0}>
        Add to main bucket
      </button>
    </form>
  );
}

function Filterish({ pressed, onClick, label }: { pressed: boolean; onClick: () => void; label: string }) {
  return <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>{label}</button>;
}

function TagGroups({
  groups,
  tags,
  onChange,
}: {
  groups: { label: string; ids: { id: string; label: string }[] }[];
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  return (
    <div className="tag-groups wide">
      {groups.map((group) => {
        const ids = group.ids.map((item) => item.id);
        const allOn = ids.length > 0 && ids.every((id) => tags.includes(id));
        return (
          <fieldset key={group.label}>
            <legend>
              {group.label}{" "}
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  onChange(
                    allOn
                      ? tags.filter((id) => !ids.includes(id))
                      : [...new Set([...tags, ...ids])],
                  )
                }
              >
                {allOn ? "Clear" : "All"}
              </button>
            </legend>
            <div className="tag-grid">
              {group.ids.map((item) => (
                <label key={item.id} className="check">
                  <input
                    type="checkbox"
                    checked={tags.includes(item.id)}
                    onChange={(event) =>
                      onChange(
                        event.target.checked
                          ? [...tags, item.id]
                          : tags.filter((id) => id !== item.id),
                      )
                    }
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
