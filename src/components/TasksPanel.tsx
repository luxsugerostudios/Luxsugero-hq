import { useEffect, useMemo, useState } from "react";
import { closedThisWeek, daysOpen, formatDay, isCarriedForward, isOverdue, kolkataDay } from "../lib/dates";
import { burst } from "../lib/burst";
import { useHqContext } from "../lib/hq";
import { orgSeat } from "../lib/orbit";
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

export function TasksPanel({ mode = "board" }: { mode?: "mine" | "board" }) {
  const hq = useHqContext();
  const today = kolkataDay();
  const people = [...hq.data.people].sort((a, b) => a.order - b.order);
  const [personFilter, setPersonFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);

  const collapsed = useMemo(() => collapseOpenTasks(hq.data.tasks), [hq.data.tasks]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return collapsed.filter(({ task }) => {
      if (personFilter !== "all" && task.ownerId !== personFilter) return false;
      if (brandFilter === "none" && task.brand) return false;
      if (brandFilter !== "all" && brandFilter !== "none" && task.brand !== brandFilter) return false;
      if (statusFilter === "open" && task.status !== "open") return false;
      if (statusFilter === "done" && task.status !== "done") return false;
      if (
        statusFilter === "overdue" &&
        !isOverdue(task.status, task.givenDate, today, task.flagAfterDays, task.longTerm)
      ) {
        return false;
      }
      if (!needle) return true;
      return `${task.title} ${task.note}`.toLowerCase().includes(needle);
    });
  }, [brandFilter, collapsed, personFilter, query, statusFilter, today]);

  const mine =
    hq.personId && hq.personId !== "founder" && hq.personId !== "admin"
      ? visible.filter((item) => item.task.ownerId === hq.personId)
      : [];

  if (mode === "mine") {
    const linked = hq.personId && hq.personId !== "founder" && hq.personId !== "admin";
    return (
      <section aria-labelledby="mine-heading">
        <div className="section-head">
          <h2 id="mine-heading">My tasks</h2>
        </div>
        {hq.access === "signed-out" || hq.access === "pending" ? (
          <p className="empty">Sign in to see tasks assigned to you.</p>
        ) : null}
        {hq.access === "guest" ? (
          <p className="empty">Ask the founder to add your email.</p>
        ) : null}
        {hq.isAdmin && !linked ? (
          <p className="empty">This account is not linked to a person. Assign work from the team board.</p>
        ) : null}
        {linked ? <MyTasks tasks={mine} today={today} people={people} history={hq.data.history} /> : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="tasks-heading">
      <div className="section-head">
        <h2 id="tasks-heading">Team board</h2>
      </div>
      {hq.access === "guest" && hq.phase === "live" ? (
        <p className="banner" role="status">
          Ask the founder to add your email.
        </p>
      ) : null}
      <div className="toolbar filters">
        <label>
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title or note"
            aria-label="Search tasks"
          />
        </label>
      </div>
      <div className="filters" role="group" aria-label="Filter by brand">
        <FilterChip pressed={brandFilter === "all"} onClick={() => setBrandFilter("all")}>All brands</FilterChip>
        {BRAND_IDS.map((id) => (
          <FilterChip key={id} pressed={brandFilter === id} onClick={() => setBrandFilter(id)}>{id}</FilterChip>
        ))}
      </div>
      <div className="filters" role="group" aria-label="Filter by status">
        <FilterChip pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All</FilterChip>
        <FilterChip pressed={statusFilter === "open"} onClick={() => setStatusFilter("open")}>Open</FilterChip>
        <FilterChip pressed={statusFilter === "overdue"} onClick={() => setStatusFilter("overdue")}>Overdue</FilterChip>
        <FilterChip pressed={statusFilter === "done"} onClick={() => setStatusFilter("done")}>Done</FilterChip>
      </div>
      <div className="filters" role="group" aria-label="Filter by person">
        <FilterChip pressed={personFilter === "all"} onClick={() => setPersonFilter("all")}>
          All
        </FilterChip>
        {people.map((person) => (
          <FilterChip
            key={person.id}
            pressed={personFilter === person.id}
            onClick={() => setPersonFilter(person.id)}
          >
            {person.name}
          </FilterChip>
        ))}
      </div>
      <div className="kanban">
        {(["todo", "doing", "waiting", "done"] as const).map((lane) => {
          const tasks = visible.filter(({ task }) => {
            if (taskLane(task) !== lane) return false;
            if (lane === "done" && statusFilter !== "done" && !closedThisWeek(task.status, task.closedAt, today)) return false;
            return true;
          });
          const title = lane === "todo" ? "To do" : lane === "doing" ? "Doing" : lane === "waiting" ? "Waiting" : "Done";
          return (
            <article
              key={lane}
              className={`person${dragOver === lane ? " is-drop" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(lane);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(null);
                const taskId = event.dataTransfer.getData("text/task-id");
                const task = hq.data.tasks.find((item) => item.id === taskId);
                if (!task || taskLane(task) === lane) return;
                const mine = Boolean(hq.personId && task.ownerId === hq.personId);
                if (!hq.isAdmin && !(hq.isMember && mine)) return;
                void hq.placeTask(task, lane)
                  .then(() => {
                    if (lane === "done") burst(event.clientX, event.clientY);
                  })
                  .catch(() => undefined);
              }}
            >
              <header>
                <h3>{title}</h3>
                <p className="meta">{tasks.length}</p>
              </header>
              {tasks.length === 0 ? <p className="empty">None</p> : null}
              <div className="stack">
                {tasks.map(({ task, duplicateIds }) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    duplicateIds={duplicateIds}
                    today={today}
                    people={people}
                    history={hq.data.history[task.id] ?? []}
                    showOwner
                  />
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MyTasks({
  tasks,
  today,
  people,
  history,
}: {
  tasks: ShownTask[];
  today: string;
  people: Person[];
  history: Record<string, TaskHistory[]>;
}) {
  return (
    <section className="my-tasks">
      {tasks.length === 0 ? <p className="empty">Nothing assigned to you.</p> : null}
      <div className="stack">
        {tasks.map(({ task, duplicateIds }) => (
          <TaskCard
            key={task.id}
            task={task}
            duplicateIds={duplicateIds}
            today={today}
            people={people}
            history={history[task.id] ?? []}
            emphasis
          />
        ))}
      </div>
    </section>
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
        <OwnerPicker value={ownerId} onChange={setOwnerId} />
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

function OwnerPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useHqContext();
  const groups = [
    {
      label: "People",
      options: data.people
        .filter((person) => person.id !== "unassigned")
        .map((person) => ({ id: person.id, label: orgSeat(person.id)?.name ?? person.name })),
    },
    {
      label: "Brand PMs",
      options: data.agents.filter((agent) => agent.group === "Brand PM").map((agent) => ({ id: agent.id, label: agent.name })),
    },
    {
      label: "Agents",
      options: data.agents.filter((agent) => agent.group !== "Brand PM").map((agent) => ({ id: agent.id, label: agent.name })),
    },
  ];
  return (
    <div className="tag-groups">
      {groups.map((group) => (
        <fieldset key={group.label}>
          <legend>{group.label}</legend>
          <div className="tag-grid">
            {group.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="chip"
                aria-pressed={value === option.id}
                onClick={() => onChange(option.id)}
              >
                {option.label.slice(0, 1)} {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}


function TaskCard({
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
          <OwnerPicker
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

function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}
