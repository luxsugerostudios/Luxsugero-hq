import { useMemo, useState } from "react";
import { closedThisWeek, daysOpen, formatDay, isOverdue, kolkataDay } from "../lib/dates";
import { useHqContext } from "../lib/hq";
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

export function TasksPanel() {
  const hq = useHqContext();
  const today = kolkataDay();
  const people = [...hq.data.people].sort((a, b) => a.order - b.order);
  const [personFilter, setPersonFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return hq.data.tasks.filter((task) => {
      if (personFilter !== "all" && task.ownerId !== personFilter) return false;
      if (brandFilter === "none" && task.brand) return false;
      if (brandFilter !== "all" && brandFilter !== "none" && task.brand !== brandFilter) return false;
      if (statusFilter === "open" && task.status !== "open") return false;
      if (statusFilter === "done" && task.status !== "done") return false;
      if (
        statusFilter === "overdue" &&
        !isOverdue(task.status, task.givenDate, today, task.flagAfterDays)
      ) {
        return false;
      }
      if (!needle) return true;
      return `${task.title} ${task.note}`.toLowerCase().includes(needle);
    });
  }, [brandFilter, hq.data.tasks, personFilter, query, statusFilter, today]);

  const mine =
    hq.personId && hq.personId !== "founder" && hq.personId !== "admin"
      ? visible.filter((task) => task.ownerId === hq.personId)
      : [];

  const shownPeople =
    personFilter === "all" ? people : people.filter((person) => person.id === personFilter);

  return (
    <section aria-labelledby="tasks-heading">
      <div className="section-head">
        <h2 id="tasks-heading">Team tasks</h2>
      </div>
      {hq.access === "guest" && hq.phase === "live" ? (
        <p className="banner" role="status">
          Ask the founder to add your email
        </p>
      ) : null}
      {hq.isMember ? (
        <MyTasks tasks={mine} today={today} people={people} history={hq.data.history} />
      ) : null}
      {hq.isAdmin ? <AssignForm people={people} /> : null}
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
        <label>
          Brand
          <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
            <option value="all">All brands</option>
            <option value="none">No brand</option>
            {BRAND_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="overdue">Overdue</option>
            <option value="done">Done</option>
          </select>
        </label>
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
        {shownPeople.map((person) => (
          <PersonColumn
            key={person.id}
            person={person}
            tasks={visible.filter((task) => task.ownerId === person.id)}
            today={today}
            people={people}
            history={hq.data.history}
            showAllDone={statusFilter === "done"}
            dragOver={dragOver === person.id}
            onDragOver={() => hq.isAdmin && setDragOver(person.id)}
            onDragLeave={() => setDragOver(null)}
            onDrop={(taskId) => {
              setDragOver(null);
              const task = hq.data.tasks.find((item) => item.id === taskId);
              if (task && task.ownerId !== person.id) {
                void hq.reassignTask(task, person.id).catch(() => undefined);
              }
            }}
          />
        ))}
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
  tasks: Task[];
  today: string;
  people: Person[];
  history: Record<string, TaskHistory[]>;
}) {
  return (
    <section className="my-tasks">
      <h3>My tasks</h3>
      {tasks.length === 0 ? <p className="empty">Nothing assigned to you.</p> : null}
      <div className="stack">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} today={today} people={people} history={history[task.id] ?? []} emphasis />
        ))}
      </div>
    </section>
  );
}

function AssignForm({ people }: { people: Person[] }) {
  const { saveTask } = useHqContext();
  const today = kolkataDay();
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(people[0]?.id ?? "unassigned");
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
          })
          .catch(() => undefined);
      }}
    >
      <h3 className="wide">Assign task</h3>
      <label className="wide">
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required />
      </label>
      <label>
        Owner
        <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
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
      <button type="submit" className="primary">
        Assign task
      </button>
    </form>
  );
}

function PersonColumn({
  person,
  tasks,
  today,
  people,
  history,
  showAllDone,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  person: Person;
  tasks: Task[];
  today: string;
  people: Person[];
  history: Record<string, TaskHistory[]>;
  showAllDone: boolean;
  dragOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (taskId: string) => void;
}) {
  const open = tasks.filter(
    (task) => task.status === "open" && !isOverdue(task.status, task.givenDate, today, task.flagAfterDays),
  );
  const overdue = tasks.filter((task) =>
    isOverdue(task.status, task.givenDate, today, task.flagAfterDays),
  );
  const done = tasks.filter((task) =>
    showAllDone ? task.status === "done" : closedThisWeek(task.status, task.closedAt, today),
  );
  return (
    <article
      className={`person${dragOver ? " is-drop" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(event.dataTransfer.getData("text/task-id"));
      }}
    >
      <header>
        <div>
          <h3>{person.name}</h3>
          {person.role ? <p className="role">{person.role}</p> : null}
        </div>
        <p className="meta">{open.length + overdue.length} open</p>
      </header>
      <Lane title="Open" tasks={open} today={today} people={people} history={history} />
      <Lane title="Overdue" tasks={overdue} today={today} people={people} history={history} />
      <Lane title="Done this week" tasks={done} today={today} people={people} history={history} />
    </article>
  );
}

function Lane({
  title,
  tasks,
  today,
  people,
  history,
}: {
  title: string;
  tasks: Task[];
  today: string;
  people: Person[];
  history: Record<string, TaskHistory[]>;
}) {
  return (
    <div className="lane">
      <p className="kicker">
        {title} <span>{tasks.length}</span>
      </p>
      {tasks.length === 0 ? <p className="empty">None</p> : null}
      <div className="stack">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} today={today} people={people} history={history[task.id] ?? []} />
        ))}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  today,
  people,
  history,
  emphasis = false,
}: {
  task: Task;
  today: string;
  people: Person[];
  history: TaskHistory[];
  emphasis?: boolean;
}) {
  const { isAdmin, isMember, personId, setTaskStatus, setTaskNote, deleteTask } = useHqContext();
  const [note, setNote] = useState(task.note);
  const mine = Boolean(personId && task.ownerId === personId);
  const canTick = isAdmin || (isMember && mine);
  const age = daysOpen(task.givenDate, today);
  const overdue = isOverdue(task.status, task.givenDate, today, task.flagAfterDays);
  return (
    <article
      className={`task${overdue ? " is-overdue" : ""}${task.status === "done" ? " is-done" : ""}${emphasis ? " is-emphasis" : ""}`}
      draggable={isAdmin}
      onDragStart={(event) => {
        if (!isAdmin) return;
        event.dataTransfer.setData("text/task-id", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div>
        <h4>{task.title}</h4>
        {task.longTerm ? <span className="long-term">Long-term</span> : null}
        <p className="meta">
          Given {formatDay(task.givenDate)}
          {task.brand ? ` · ${task.brand}` : ""}
          {task.dueDate ? ` · Due ${formatDay(task.dueDate)}` : ""}
        </p>
        {task.note ? <p className="focus">{task.note}</p> : null}
      </div>
      {task.status === "open" ? (
        <p className="age">
          <b>{age}</b>
          <span>{age === 1 ? "day open" : "days open"}</span>
          {overdue ? <span className="flag">OVERDUE</span> : null}
        </p>
      ) : (
        <p className="meta">Done</p>
      )}
      {canTick ? (
        <div className="row">
          {task.status === "open" ? (
            <button type="button" className="tick" onClick={() => void setTaskStatus(task, "done").catch(() => undefined)}>
              Done
            </button>
          ) : (
            <button type="button" className="tick ghost" onClick={() => void setTaskStatus(task, "open").catch(() => undefined)}>
              Undo
            </button>
          )}
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
        <button
          type="button"
          className="warn"
          onClick={() => {
            if (window.confirm(`Delete “${task.title}”?`)) void deleteTask(task.id);
          }}
        >
          Delete
        </button>
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
