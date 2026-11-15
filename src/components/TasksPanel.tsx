import { useState } from "react";
import { closedThisWeek, daysOpen, formatDay, isCarriedForward, isOverdue, kolkataDay } from "../lib/dates";
import { useHqContext } from "../lib/hq";
import type { Person, Task } from "../lib/types";

export function TasksPanel() {
  const { data, canEdit, saveTask, deleteTask } = useHqContext();
  const today = kolkataDay();
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const people = [...data.people].sort((a, b) => a.order - b.order);
  const known = new Set(people.map((person) => person.id));
  const open = data.tasks.filter((task) => task.status === "open");
  const overdue = open.filter((task) =>
    isOverdue(task.status, task.givenDate, today, task.flagAfterDays),
  );
  const closed = data.tasks.filter((task) =>
    closedThisWeek(task.status, task.closedAt, today),
  );
  const visible = filter === "all" ? people : people.filter((person) => person.id === filter);

  return (
    <section aria-labelledby="tasks-heading">
      <div className="section-head">
        <h2 id="tasks-heading">Team tasks</h2>
        <div className="stats">
          <Stat value={open.length} label="Open" />
          <Stat value={overdue.length} label="Overdue" tone="bad" />
          <Stat value={closed.length} label="Closed this week" tone="good" />
        </div>
      </div>
      <div className="filters" role="group" aria-label="Filter by person">
        <FilterChip pressed={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterChip>
        {people.map((person) => (
          <FilterChip
            key={person.id}
            pressed={filter === person.id}
            onClick={() => setFilter(person.id)}
          >
            {person.name}
          </FilterChip>
        ))}
      </div>
      {canEdit ? (
        <TaskForm
          people={people}
          busy={busy}
          onCreate={async (task) => {
            setBusy(true);
            try {
              await saveTask(task);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      <div className="board">
        {visible.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            today={today}
            people={people}
            canEdit={canEdit}
            tasks={tasksFor(person.id, data.tasks, known)}
            onSave={saveTask}
            onDelete={deleteTask}
          />
        ))}
      </div>
    </section>
  );
}

function tasksFor(personId: string, tasks: Task[], known: Set<string>): Task[] {
  const mine =
    personId === "unassigned"
      ? tasks.filter((task) => task.ownerId === "unassigned" || !known.has(task.ownerId))
      : tasks.filter((task) => task.ownerId === personId);
  return [...mine].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "bad" | "good";
}) {
  return (
    <p className={`stat${tone ? ` ${tone}` : ""}`}>
      <b>{value}</b>
      <span>{label}</span>
    </p>
  );
}

const LONG_TERM_DAYS = 7;

function longTermFields(checked: boolean): { longTerm: boolean; flagAfterDays: number | null } {
  return checked
    ? { longTerm: true, flagAfterDays: LONG_TERM_DAYS }
    : { longTerm: false, flagAfterDays: null };
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
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
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

function TaskForm({
  people,
  busy,
  onCreate,
}: {
  people: Person[];
  busy: boolean;
  onCreate: (task: Task) => Promise<void>;
}) {
  const today = kolkataDay();
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState("unassigned");
  const [givenDate, setGivenDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
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
          givenDate,
          dueDate: dueDate || null,
          status: "open",
          closedAt: null,
          ...longTermFields(longTerm),
          createdAt: now,
          updatedAt: now,
        };
        void onCreate(task)
          .then(() => {
            setTitle("");
            setLongTerm(false);
          })
          .catch(() => undefined);
      }}
    >
      <label className="wide">
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={180}
          required
        />
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
        Given
        <input
          type="date"
          value={givenDate}
          onChange={(event) => setGivenDate(event.target.value)}
          required
        />
      </label>
      <label>
        Due
        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
      </label>
      <LongTermField checked={longTerm} onChange={setLongTerm} />
      <button type="submit" className="primary" disabled={busy}>
        Add task
      </button>
    </form>
  );
}

function PersonCard({
  person,
  tasks,
  today,
  people,
  canEdit,
  onSave,
  onDelete,
}: {
  person: Person;
  tasks: Task[];
  today: string;
  people: Person[];
  canEdit: boolean;
  onSave: (task: Task) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const openCount = tasks.filter((task) => task.status === "open").length;
  return (
    <article className="person">
      <header>
        <div>
          <h3>{person.name}</h3>
          {person.role ? <p className="role">{person.role}</p> : null}
        </div>
        <p className="meta">{openCount} open</p>
      </header>
      {tasks.length === 0 ? <p className="empty">Clear</p> : null}
      <div className="stack">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            today={today}
            people={people}
            canEdit={canEdit}
            onSave={onSave}
            onDelete={onDelete}
          />
        ))}
      </div>
    </article>
  );
}

function TaskCard({
  task,
  today,
  people,
  canEdit,
  onSave,
  onDelete,
}: {
  task: Task;
  today: string;
  people: Person[];
  canEdit: boolean;
  onSave: (task: Task) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [givenDate, setGivenDate] = useState(task.givenDate);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [longTerm, setLongTerm] = useState(task.longTerm);
  const age = daysOpen(task.givenDate, today);
  const overdue = isOverdue(task.status, task.givenDate, today, task.flagAfterDays);
  const carried = isCarriedForward(task.status, task.givenDate, today);

  const save = (next: Task) => onSave({ ...next, updatedAt: new Date().toISOString() });

  return (
    <article className={`task${overdue ? " is-overdue" : ""}${task.status === "done" ? " is-done" : ""}`}>
      {editing ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void save({
              ...task,
              title: title.trim(),
              givenDate,
              dueDate: dueDate || null,
              ...longTermFields(longTerm),
            })
              .then(() => setEditing(false))
              .catch(() => undefined);
          }}
        >
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            Given
            <input
              type="date"
              value={givenDate}
              onChange={(event) => setGivenDate(event.target.value)}
              required
            />
          </label>
          <label>
            Due
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <LongTermField checked={longTerm} onChange={setLongTerm} />
          <div className="row">
            <button type="submit" className="primary">
              Save
            </button>
            <button type="button" className="ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div>
            <h4>{task.title}</h4>
            {task.longTerm ? <span className="long-term">Long-term</span> : null}
            <p className="meta">Given {formatDay(task.givenDate)}</p>
            {task.dueDate ? <p className="meta">Due {formatDay(task.dueDate)}</p> : null}
            {task.status === "done" && task.closedAt ? (
              <p className="meta">Closed {formatDay(task.closedAt.slice(0, 10))}</p>
            ) : null}
          </div>
          {task.status === "open" ? (
            <p className="age">
              <b>{age}</b>
              <span>{age === 1 ? "day open" : "days open"}</span>
              {carried ? <span className="carried">Carried</span> : null}
              {overdue ? <span className="flag">OVERDUE</span> : null}
            </p>
          ) : (
            <p className="meta">Done</p>
          )}
        </>
      )}
      {canEdit ? (
        <div className="row actions">
          <label>
            Owner
            <select
              aria-label={`Owner for ${task.title}`}
              value={people.some((person) => person.id === task.ownerId) ? task.ownerId : "unassigned"}
              onChange={(event) =>
                void save({ ...task, ownerId: event.target.value }).catch(() => undefined)
              }
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          {!editing ? (
            <button type="button" className="ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
          ) : null}
          {task.status === "open" ? (
            <button
              type="button"
              className="ghost"
              onClick={() =>
                void save({ ...task, status: "done", closedAt: new Date().toISOString() }).catch(
                  () => undefined,
                )
              }
            >
              Mark done
            </button>
          ) : (
            <button
              type="button"
              className="ghost"
              onClick={() =>
                void save({ ...task, status: "open", closedAt: null }).catch(() => undefined)
              }
            >
              Reopen
            </button>
          )}
          <button
            type="button"
            className="warn"
            onClick={() => {
              if (window.confirm(`Delete “${task.title}”?`)) void onDelete(task.id);
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </article>
  );
}
