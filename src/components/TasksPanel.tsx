import { useEffect, useMemo, useState } from "react";
import { addDays, closedThisWeek, daysOpen, formatDay, isCarriedForward, isOverdue, kolkataDay, weekBounds } from "../lib/dates";
import { burst } from "../lib/burst";
import { useHqContext } from "../lib/hq";
import { BRAND_COLOR, ORG, firstName, loadLevel, orgSeat } from "../lib/orbit";
import { AgeBadge } from "./ui/AgeBadge";
import { TaskDrawer } from "./ui/TaskDrawer";
import { OwnerSelect } from "./ui/OwnerSelect";
import { BalancePanel } from "./ui/BalancePanel";
import { QuickAssign, TaskList, sortForDesk } from "./TaskList";
import { collapseOpenTasks, taskLane, type ShownTask } from "../lib/tasks";

import type { BrandId, Person, Task, TaskHistory } from "../lib/types";
import { BRAND_IDS } from "../lib/types";

const LONG_TERM_DAYS = 7;

function longTermFields(checked: boolean): { longTerm: boolean; flagAfterDays: number | null } {
  return checked
    ? { longTerm: true, flagAfterDays: LONG_TERM_DAYS }
    : { longTerm: false, flagAfterDays: null };
}

export function actorName(personId: string, people: Person[]): string {
  if (personId === "founder") return "Founder";
  if (personId === "admin") return "Admin";
  return people.find((person) => person.id === personId)?.name ?? personId;
}

function ownerLine(ownerId: string, people: Person[], agents: { id: string; name: string }[] = []): string {
  const seat = orgSeat(ownerId);
  if (seat) return `${seat.name} · ${seat.title}`;
  const person = people.find((item) => item.id === ownerId);
  if (person) return person.name;
  return agents.find((agent) => agent.id === ownerId)?.name ?? actorName(ownerId, people);
}

type Show = "open" | "loose" | "late" | "today" | "done";
type View = "list" | "matrix" | "radar";

export function TasksPanel({ mode = "board" }: { mode?: "mine" | "board" }) {
  const hq = useHqContext();
  const today = kolkataDay();
  const people = [...hq.data.people].sort((a, b) => a.order - b.order);
  const [brandFilter, setBrandFilter] = useState("all");
  const [show, setShow] = useState<Show>("open");
  const [personFilter, setPersonFilter] = useState("all");
  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [balanceOpen, setBalanceOpen] = useState(false);

  const collapsed = useMemo(() => collapseOpenTasks(hq.data.tasks), [hq.data.tasks]);
  const late = (task: Task) => isOverdue(task.status, task.givenDate, today, task.flagAfterDays, task.longTerm);
  const open = collapsed.filter(({ task }) => task.status === "open");
  const counts = {
    open: open.length,
    loose: open.filter(({ task }) => task.ownerId === "unassigned").length,
    late: open.filter(({ task }) => late(task)).length,
    today: open.filter(({ task }) => task.dueDate === today).length,
    done: collapsed.filter(({ task }) => closedThisWeek(task.status, task.closedAt, today)).length,
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return collapsed.filter(({ task }) => {
      if (brandFilter !== "all" && task.brand !== brandFilter) return false;
      if (personFilter !== "all" && task.ownerId !== personFilter) return false;
      if (needle && !`${task.title} ${task.note}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [brandFilter, collapsed, personFilter, query]);

  const listed = sortForDesk(
    visible
      .map(({ task }) => task)
      .filter((task) => {
        if (show === "done") return closedThisWeek(task.status, task.closedAt, today);
        if (task.status !== "open") return false;
        if (show === "loose") return task.ownerId === "unassigned";
        if (show === "late") return late(task);
        if (show === "today") return task.dueDate === today;
        return true;
      }),
    today,
  );

  const linked = Boolean(hq.personId && hq.personId !== "founder" && hq.personId !== "admin");

  if (mode === "mine") {
    const myOpen = collapsed.filter(({ task }) => task.ownerId === hq.personId && task.status === "open").map(({ task }) => task);
    const mine = sortForDesk(
      show === "done"
        ? collapsed.map(({ task }) => task).filter((task) => task.ownerId === hq.personId && closedThisWeek(task.status, task.closedAt, today))
        : myOpen,
      today,
    );
    const seat = hq.personId ? orgSeat(hq.personId) : undefined;
    return (
      <section aria-labelledby="mine-heading">
        <div className="section-head">
          <h2 id="mine-heading">My tasks</h2>
          {linked ? (
            <p className="meta">
              {seat ? `${firstName(seat.name)} · ${seat.title} · ` : ""}
              {myOpen.filter(late).length} late · {myOpen.filter((task) => task.dueDate === today).length} due today · {myOpen.length} open
            </p>
          ) : null}
        </div>
        {hq.access === "signed-out" || hq.access === "pending" ? (
          <div className="stack">
            <p className="empty">Sign in to see your day.</p>
            <button type="button" className="primary" onClick={() => void hq.signIn()}>Sign in with Google</button>
          </div>
        ) : null}
        {hq.access === "guest" ? <p className="empty">Ask the founder to add your email.</p> : null}
        {hq.isAdmin ? <QuickAssign today={today} /> : null}
        {hq.isAdmin && !linked ? <p className="empty">This account has no tasks of its own. Use the Team board to see and assign everyone's work.</p> : null}
        {linked ? (
          <>
            <div className="toolbar filters">
              <label>
                Show
                <select value={show === "done" ? "done" : "open"} onChange={(event) => setShow(event.target.value as Show)}>
                  <option value="open">Open</option>
                  <option value="done">Done this week</option>
                </select>
              </label>
            </div>
            <TaskList
              tasks={mine}
              today={today}
              onOpen={setDrawer}
              empty={show === "done" ? "Nothing closed this week yet." : "Nothing assigned to you right now."}
            />
          </>
        ) : null}
        {drawer ? <TaskDrawer taskId={drawer} onClose={() => setDrawer(null)} /> : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="tasks-heading">
      <div className="section-head">
        <h2 id="tasks-heading">Team board</h2>
        <p className="meta">{counts.open} open · {counts.late} late · {counts.today} due today</p>
      </div>
      {hq.access === "guest" && hq.phase === "live" ? (
        <p className="banner" role="status">Ask the founder to add your email.</p>
      ) : null}
      {hq.isAdmin ? <QuickAssign today={today} /> : null}
      {hq.isAdmin && counts.loose > 0 ? (
        <p className="desk-alert" role="status">
          <b>{counts.loose}</b> {counts.loose === 1 ? "task has" : "tasks have"} no owner.
          {show !== "loose" ? (
            <button type="button" className="ghost" onClick={() => { setShow("loose"); setView("list"); }}>Show them</button>
          ) : null}
          <button type="button" className="primary" onClick={() => setBalanceOpen(true)}>Auto-balance</button>
        </p>
      ) : null}
      {balanceOpen ? <BalancePanel tasks={hq.data.tasks} onClose={() => setBalanceOpen(false)} /> : null}
      <div className="toolbar filters">
        <label>
          Search
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title or note" aria-label="Search tasks" />
        </label>
        <label>
          Show
          <select value={show} onChange={(event) => setShow(event.target.value as Show)}>
            <option value="open">All open ({counts.open})</option>
            <option value="loose">No owner ({counts.loose})</option>
            <option value="late">Late ({counts.late})</option>
            <option value="today">Due today ({counts.today})</option>
            <option value="done">Done this week ({counts.done})</option>
          </select>
        </label>
        <label>
          Person
          <select value={personFilter} onChange={(event) => setPersonFilter(event.target.value)}>
            <option value="all">Everyone</option>
            {people.filter((person) => person.id !== "unassigned").map((person) => (
              <option key={person.id} value={person.id}>{orgSeat(person.id)?.name ?? person.name}</option>
            ))}
          </select>
        </label>
        <label>
          Brand
          <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
            <option value="all">All brands</option>
            {BRAND_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label>
          View
          <select value={view} onChange={(event) => setView(event.target.value as View)}>
            <option value="list">List</option>
            <option value="matrix">By person</option>
            <option value="radar">By due date</option>
          </select>
        </label>
      </div>
      {view === "list" ? (
        <TaskList
          tasks={listed}
          today={today}
          onOpen={setDrawer}
          empty={show === "loose" ? "Every task has an owner." : "No tasks match these filters."}
        />
      ) : null}
      {view === "matrix" ? (
        <Matrix tasks={visible} people={people} today={today} dragOver={dragOver} setDragOver={setDragOver} expanded={expanded} setExpanded={setExpanded} onOpen={setDrawer} canDrag={hq.isAdmin} onMove={(task, column, ownerId) => {
          const next = async () => {
            if (ownerId && ownerId !== task.ownerId) await hq.reassignTask(task, ownerId);
            if (column === "done") await hq.setTaskStatus(task, "done");
            else if (column === "todo" || column === "doing" || column === "waiting") await hq.placeTask(task, column);
          };
          void next().then(() => { if (column === "done") burst(window.innerWidth / 2, 80); }).catch(() => undefined);
        }} />
      ) : null}
      {view === "radar" ? (
        <DueRadar tasks={visible} today={today} dragOver={dragOver} setDragOver={setDragOver} onOpen={setDrawer} canDrag={hq.isAdmin} onDue={(task, dueDate, summary) => {
          void hq.saveTask({ ...task, dueDate, updatedAt: new Date().toISOString() }, summary).catch(() => undefined);
        }} />
      ) : null}
      {drawer ? <TaskDrawer taskId={drawer} onClose={() => setDrawer(null)} /> : null}
    </section>
  );
}

type MatrixCol = "todo" | "doing" | "waiting" | "overdue" | "done";

function matrixColumn(task: Task, today: string): MatrixCol {
  if (closedThisWeek(task.status, task.closedAt, today)) return "done";
  if (isOverdue(task.status, task.givenDate, today, task.flagAfterDays, task.longTerm)) return "overdue";
  const lane = taskLane(task);
  if (lane === "doing" || lane === "waiting") return lane;
  return "todo";
}

function Matrix({
  tasks, people, today, dragOver, setDragOver, expanded, setExpanded, onOpen, canDrag, onMove,
}: {
  tasks: ShownTask[];
  people: Person[];
  today: string;
  dragOver: string | null;
  setDragOver: (id: string | null) => void;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  onOpen: (id: string) => void;
  canDrag: boolean;
  onMove: (task: Task, column: MatrixCol, ownerId?: string) => void;
}) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const rows = [
    ...ORG.map((seat) => byId.get(seat.id) ?? { id: seat.id, name: seat.name, role: seat.title, order: 0 }),
    ...people.filter((person) => !ORG.some((seat) => seat.id === person.id) && person.id !== "everyone" && person.id !== "unassigned"),
    ...people.filter((person) => person.id === "everyone"),
    ...people.filter((person) => person.id === "unassigned"),
  ];
  const cols: [MatrixCol, string, boolean][] = [
    ["todo", "To do", true],
    ["doing", "Doing", true],
    ["waiting", "Waiting", true],
    ["overdue", "Overdue", false],
    ["done", "Done this week", true],
  ];
  return (
    <div className="sheet-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th>Person</th>
            {cols.map(([, label]) => <th key={label}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((person) => {
            const mine = tasks.filter((item) => item.task.ownerId === person.id);
            const openCount = mine.filter((item) => item.task.status === "open").length;
            return (
              <tr key={person.id}>
                <td className="who" style={person.id === "unassigned" ? { color: "var(--pink)" } : undefined}>
                  {orgSeat(person.id)?.name ?? person.name}
                  <div className="meta">{orgSeat(person.id)?.title ?? person.role}</div>
                  <b style={{ color: loadLevel(openCount) === "overloaded" ? "var(--pink)" : loadLevel(openCount) === "busy" ? "var(--orange)" : "var(--ink)" }}>{openCount}</b>
                </td>
                {cols.map(([key, , canDrop]) => {
                  const cell = mine.filter((item) => matrixColumn(item.task, today) === key);
                  const open = expanded === `${person.id}:${key}`;
                  const shown = key === "done" ? [] : open ? cell : cell.slice(0, 4);
                  return (
                    <td
                      key={key}
                      style={dragOver === `${person.id}:${key}` ? { outline: "2px solid var(--lime)" } : undefined}
                      onDragOver={(event) => { if (canDrag && canDrop) { event.preventDefault(); setDragOver(`${person.id}:${key}`); } }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragOver(null);
                        if (!canDrag || !canDrop) return;
                        const task = tasks.find((item) => item.task.id === event.dataTransfer.getData("text/task-id"))?.task;
                        if (!task) return;
                        onMove(task, key, task.ownerId === person.id ? undefined : person.id);
                      }}
                    >
                      {key === "done" && !open ? (
                        <button type="button" className="chip" onClick={() => setExpanded(`${person.id}:${key}`)}>{cell.length}</button>
                      ) : (
                        <div className="stack">
                          {shown.map(({ task }) => (
                            <button
                              key={task.id}
                              type="button"
                              className="chip-task"
                              draggable={canDrag}
                              title={task.title}
                              style={{ boxShadow: task.brand ? `inset 3px 0 0 ${BRAND_COLOR[task.brand]}` : undefined }}
                              onDragStart={(event) => event.dataTransfer.setData("text/task-id", task.id)}
                              onClick={() => onOpen(task.id)}
                            >
                              <span>{task.title}</span>
                              <AgeBadge task={task} today={today} />
                            </button>
                          ))}
                          {cell.length > 4 ? (
                            <button type="button" className="ghost" onClick={() => setExpanded(open ? null : `${person.id}:${key}`)}>{open ? "Show less" : `+${cell.length - 4}`}</button>
                          ) : null}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type RadarCol = "late" | "today" | "tomorrow" | "week" | "later" | "none";

function radarColumn(task: Task, today: string): RadarCol | null {
  if (task.status !== "open") return null;
  if (!task.dueDate) return "none";
  if (task.dueDate < today) return "late";
  if (task.dueDate === today) return "today";
  if (task.dueDate === addDays(today, 1)) return "tomorrow";
  const week = weekBounds(today);
  if (task.dueDate <= week.end) return "week";
  return "later";
}

function DueRadar({
  tasks, today, dragOver, setDragOver, onOpen, canDrag, onDue,
}: {
  tasks: ShownTask[];
  today: string;
  dragOver: string | null;
  setDragOver: (id: string | null) => void;
  onOpen: (id: string) => void;
  canDrag: boolean;
  onDue: (task: Task, dueDate: string | null, summary: string) => void;
}) {
  const cols: [RadarCol, string, boolean][] = [
    ["late", "Late", false],
    ["today", "Today", true],
    ["tomorrow", "Tomorrow", true],
    ["week", "This week", true],
    ["later", "Later", true],
    ["none", "No date", true],
  ];
  return (
    <div className="sheet-wrap">
      {!canDrag ? <p className="meta">Only an admin can change a due date.</p> : null}
      <table className="matrix">
        <thead>
          <tr>{cols.map(([, label]) => <th key={label}>{label === "No date" ? "Set a date" : label}</th>)}</tr>
        </thead>
        <tbody>
          <tr>
            {cols.map(([key, , canDrop]) => (
              <td
                key={key}
                style={dragOver === key ? { outline: "2px solid var(--lime)" } : undefined}
                onDragOver={(event) => { if (canDrag && canDrop) { event.preventDefault(); setDragOver(key); } }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(null);
                  if (!canDrag || !canDrop) return;
                  const task = tasks.find((item) => item.task.id === event.dataTransfer.getData("text/task-id"))?.task;
                  if (!task) return;
                  const week = weekBounds(today);
                  const due = key === "today" ? today : key === "tomorrow" ? addDays(today, 1) : key === "week" ? week.end : key === "later" ? addDays(today, 14) : null;
                  onDue(task, due, due ? `Due ${due}` : "Cleared the due date");
                }}
              >
                <div className="stack">
                  {tasks.filter((item) => radarColumn(item.task, today) === key).map(({ task }) => (
                    <button
                      key={task.id}
                      type="button"
                      className="chip-task"
                      draggable={canDrag}
                      title={task.title}
                      style={{ boxShadow: task.brand ? `inset 3px 0 0 ${BRAND_COLOR[task.brand]}` : undefined }}
                      onDragStart={(event) => event.dataTransfer.setData("text/task-id", task.id)}
                      onClick={() => onOpen(task.id)}
                    >
                      <span>{task.title}</span>
                      <i className="meta">{orgSeat(task.ownerId)?.name ?? task.ownerId}</i>
                    </button>
                  ))}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function AssignModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" role="presentation" onClick={onClose}>
      <div role="dialog" aria-labelledby="assign-heading" onClick={(event) => event.stopPropagation()}>
        <AssignForm onDone={onClose} />
      </div>
    </div>
  );
}

function AssignForm({ onDone }: { onDone?: () => void }) {
  const { data, saveTask } = useHqContext();
  const today = kolkataDay();
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(data.people.find((person) => person.id !== "unassigned")?.id ?? "unassigned");
  const [dueDate, setDueDate] = useState("");
  const [brand, setBrand] = useState<"" | BrandId>("");
  const [longTerm, setLongTerm] = useState(false);

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        const now = new Date().toISOString();
        const task: Task = {
          id: crypto.randomUUID(),
          title: title.trim(),
          ownerId,
          givenDate: today,
          dueDate: dueDate || null,
          status: "open",
          lane: "todo",
          closedAt: null,
          note: "",
          brand: brand || null,
          inboxId: null,
          createdAt: now,
          updatedAt: now,
          ...longTermFields(longTerm),
        };
        void saveTask(task, `Assigned to ${ownerId}`)
          .then(() => {
            setTitle("");
            setLongTerm(false);
            onDone?.();
          })
          .catch(() => undefined);
      }}
    >
      <h3 id="assign-heading" className="wide">Assign task</h3>
      <label className="wide">
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required />
      </label>
      <div className="wide">
        <p className="meta">Owner</p>
        <OwnerSelect value={ownerId} onChange={setOwnerId} />
      </div>
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
      <LongTermField checked={longTerm} onChange={setLongTerm} />
      <div className="row">
        <button type="submit" className="primary">Assign task</button>
        {onDone ? <button type="button" className="ghost" onClick={onDone}>Close</button> : null}
      </div>
    </form>
  );
}

export function TaskCard({
  task,
  duplicateIds = [],
  today,
  people,
  history,
  emphasis = false,
  showOwner = false,
}: {
  task: Task;
  duplicateIds?: string[];
  today: string;
  people: Person[];
  history: TaskHistory[];
  emphasis?: boolean;
  showOwner?: boolean;
}) {
  const { isAdmin, isMember, personId, setTaskStatus, setTaskNote, deleteTask, saveTask, reassignTask, data } = useHqContext();
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState(task.note);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [localStatus, setLocalStatus] = useState<Task["status"] | null>(null);
  const [saved, setSaved] = useState(false);
  const mine = Boolean(personId && task.ownerId === personId);
  const canTick = isAdmin || (isMember && mine);
  const status = localStatus ?? task.status;
  const age = daysOpen(task.givenDate, today);
  const overdue = status === "open" && isOverdue("open", task.givenDate, today, task.flagAfterDays, task.longTerm);
  const carried = status === "open" && isCarriedForward("open", task.givenDate, today);
  useEffect(() => {
    setLocalStatus(null);
    setNote(task.note);
    setTitle(task.title);
    setDueDate(task.dueDate ?? "");
  }, [task.status, task.note, task.title, task.dueDate, task.updatedAt]);

  async function tick(next: Task["status"], point?: { x: number; y: number }) {
    setLocalStatus(next);
    setSaved(false);
    try {
      await setTaskStatus(task, next);
      setSaved(true);
      if (next === "done" && point) burst(point.x, point.y);
      window.setTimeout(() => setSaved(false), 1200);
    } catch {
      setLocalStatus(null);
    }
  }
  return (
    <article
      className={`task${overdue ? " is-overdue" : ""}${status === "done" ? " is-done" : ""}${emphasis ? " is-emphasis" : ""}`}
      draggable={canTick}
      onDragStart={(event) => {
        if (!canTick) return;
        event.dataTransfer.setData("text/task-id", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div>
        {editing ? (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void saveTask(
                { ...task, title: title.trim(), dueDate: dueDate || null, updatedAt: new Date().toISOString() },
                "Edited the task",
              )
                .then(() => setEditing(false))
                .catch(() => undefined);
            }}
          >
            <label>
              Title
              <input value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label>
              Due
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
            <div className="row">
              <button type="submit" className="primary">Save</button>
              <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <h4>{task.title}</h4>
        )}
        {task.longTerm ? <span className="long-term">Long-term</span> : null}
        <p className="meta">
          {showOwner ? (
            isAdmin ? (
              <button type="button" className="chip" onClick={() => setPicking((open) => !open)}>
                {ownerLine(task.ownerId, people, data.agents)}
              </button>
            ) : (
              `${ownerLine(task.ownerId, people, data.agents)} · `
            )
          ) : null}
          Given {formatDay(task.givenDate)}
          {task.brand ? ` · ${task.brand}` : ""}
          {task.dueDate ? ` · Due ${formatDay(task.dueDate)}` : ""}
        </p>
        {task.note ? <p className="focus">{task.note}</p> : null}
        {picking && isAdmin ? (
          <OwnerSelect
            value={task.ownerId}
            onChange={(ownerId) => {
              setPicking(false);
              if (ownerId !== task.ownerId) void reassignTask(task, ownerId).catch(() => undefined);
            }}
          />
        ) : null}
      </div>
      {status === "open" ? (
        <p className="age">
          <b>{age}</b>
          <span>{age === 1 ? "day open" : "days open"}</span>
          {carried ? <span className="carried">Carried from {formatDay(task.givenDate)}</span> : null}
          {overdue ? <span className="flag">Overdue</span> : null}
        </p>
      ) : (
        <p className="meta">Done</p>
      )}
      {canTick ? (
        <div className="row">
          {status === "open" ? (
            <button type="button" className="tick" onClick={(event) => void tick("done", { x: event.clientX, y: event.clientY })}>
              Done
            </button>
          ) : (
            <button type="button" className="tick ghost" onClick={() => void tick("open")}>
              Undo
            </button>
          )}
          {saved ? <span className="saved" role="status">Saved</span> : null}
        </div>
      ) : null}
      {canTick ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void setTaskNote(task, note.trim()).catch(() => undefined);
          }}
        >
          <label>
            Note
            <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} />
          </label>
          <button type="submit" className="ghost">
            Save note
          </button>
        </form>
      ) : null}
      {isAdmin ? (
        <div className="row">
          {!editing ? (
            <button type="button" className="ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
          ) : null}
          {duplicateIds.map((id) => (
            <button
              key={id}
              type="button"
              className="ghost"
              onClick={() => {
                if (window.confirm("Remove the duplicate copy of this task?")) void deleteTask(id);
              }}
            >
              Remove duplicate
            </button>
          ))}
          <button
            type="button"
            className="warn"
            onClick={() => {
              if (window.confirm(`Delete “${task.title}”?`)) void deleteTask(task.id);
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
      <details>
        <summary>History</summary>
        {history.length === 0 ? <p className="empty">No changes yet</p> : null}
        <ul>
          {[...history].sort((a, b) => b.at.localeCompare(a.at)).map((event) => (
            <li key={event.id}>
              {actorName(event.personId, people)} · {event.summary}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function LongTermField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      Long-term (flag after 7 days)
    </label>
  );
}
