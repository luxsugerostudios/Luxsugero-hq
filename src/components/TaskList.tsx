import { useRef, useState } from "react";
import { burst } from "../lib/burst";
import { formatDay, isOverdue } from "../lib/dates";
import { useHqContext } from "../lib/hq";
import { BRAND_COLOR } from "../lib/orbit";
import { taskLane } from "../lib/tasks";
import { BRAND_IDS, type BrandId, type Lane, type Task } from "../lib/types";
import { AgeBadge } from "./ui/AgeBadge";
import { OwnerSelect, ownerLabel, useOwnerGroups } from "./ui/OwnerSelect";

const STATUS_LABEL: Record<Lane, string> = { todo: "To do", doing: "Doing", waiting: "Waiting", done: "Done" };

export function makeTask(fields: Pick<Task, "title" | "ownerId" | "givenDate"> & Partial<Task>): Task {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    dueDate: null,
    status: "open",
    lane: "todo",
    closedAt: null,
    longTerm: false,
    flagAfterDays: null,
    note: "",
    brand: null,
    inboxId: null,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

/** Sort: no owner first, then late, then by due date, then oldest given. */
export function sortForDesk(tasks: Task[], today: string): Task[] {
  const rank = (task: Task) =>
    task.status === "done" ? 3 : task.ownerId === "unassigned" ? 0 : isOverdue(task.status, task.givenDate, today, task.flagAfterDays, task.longTerm) ? 1 : 2;
  return [...tasks].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      a.givenDate.localeCompare(b.givenDate),
  );
}

/**
 * One line to assign a task: type the title, pick an owner, press Enter.
 * The owner stays picked so several tasks can go to one person in a row.
 */
export function QuickAssign({ today, defaultOwner = "" }: { today: string; defaultOwner?: string }) {
  const hq = useHqContext();
  const groups = useOwnerGroups();
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(defaultOwner);
  const [dueDate, setDueDate] = useState("");
  const [brand, setBrand] = useState<"" | BrandId>("");
  const [saved, setSaved] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  if (!hq.isAdmin) return null;
  const ready = title.trim().length > 0 && ownerId !== "";
  return (
    <form
      className="qa"
      aria-label="Assign a task"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        const task = makeTask({ title: title.trim(), ownerId, givenDate: today, dueDate: dueDate || null, brand: brand || null });
        void hq
          .saveTask(task, ownerId === "unassigned" ? "Added with no owner" : `Assigned to ${ownerLabel(ownerId, groups)}`)
          .then(() => {
            setSaved(`Assigned to ${ownerLabel(ownerId, groups)}`);
            setTitle("");
            titleRef.current?.focus();
            window.setTimeout(() => setSaved(""), 2500);
          })
          .catch(() => undefined);
      }}
    >
      <input
        ref={titleRef}
        className="qa-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={180}
        placeholder="New task, then pick an owner and press Enter"
        aria-label="Task title"
      />
      <OwnerSelect value={ownerId} onChange={setOwnerId} allowNone label="Assign to" />
      <input type="date" value={dueDate} min={today} onChange={(event) => setDueDate(event.target.value)} aria-label="Due date" />
      <select value={brand} onChange={(event) => setBrand(event.target.value as "" | BrandId)} aria-label="Brand">
        <option value="">No brand</option>
        {BRAND_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
      <button type="submit" className="primary" disabled={!ready}>Assign</button>
      <span className="qa-saved" role="status">{saved}</span>
    </form>
  );
}

/** Every task on one line with its owner, status and due date editable in place. */
export function TaskList({
  tasks,
  today,
  onOpen,
  empty = "Nothing here.",
}: {
  tasks: Task[];
  today: string;
  onOpen: (id: string) => void;
  empty?: string;
}) {
  const hq = useHqContext();
  const groups = useOwnerGroups();
  if (tasks.length === 0) return <p className="empty">{empty}</p>;
  return (
    <ul className="tl" aria-label="Tasks">
      <li className="tl-head" aria-hidden="true">
        <span />
        <span>Task</span>
        <span>Owner</span>
        <span>Status</span>
        <span>Due</span>
      </li>
      {tasks.map((task) => {
        const mine = Boolean(hq.personId && task.ownerId === hq.personId);
        const canUpdate = hq.isAdmin || (hq.isMember && mine);
        const lane = taskLane(task);
        const late = isOverdue(task.status, task.givenDate, today, task.flagAfterDays, task.longTerm);
        const loose = task.ownerId === "unassigned";
        return (
          <li
            key={task.id}
            className={`tl-row${loose ? " is-loose" : ""}${late ? " is-late" : ""}${task.status === "done" ? " is-done" : ""}`}
            style={{ boxShadow: task.brand ? `inset 3px 0 0 ${BRAND_COLOR[task.brand]}` : undefined }}
          >
            <input
              type="checkbox"
              className="tl-check"
              checked={task.status === "done"}
              disabled={!canUpdate}
              aria-label={task.status === "done" ? `Reopen ${task.title}` : `Mark ${task.title} done`}
              onChange={(event) => {
                const done = event.target.checked;
                if (done) burst(event.target.getBoundingClientRect().left, event.target.getBoundingClientRect().top);
                void hq.setTaskStatus(task, done ? "done" : "open").catch(() => undefined);
              }}
            />
            <button type="button" className="tl-title" title="Open notes and history" onClick={() => onOpen(task.id)}>
              <span>{task.title}</span>
              <AgeBadge task={task} today={today} />
            </button>
            {hq.isAdmin ? (
              <OwnerSelect
                className={loose ? "tl-owner needs" : "tl-owner"}
                value={task.ownerId}
                allowNone
                label={`Owner of ${task.title}`}
                onChange={(ownerId) => {
                  if (ownerId && ownerId !== task.ownerId) void hq.reassignTask(task, ownerId).catch(() => undefined);
                }}
              />
            ) : (
              <span className="tl-text">{ownerLabel(task.ownerId, groups)}</span>
            )}
            <select
              className={`tl-status s-${lane}`}
              value={lane}
              disabled={!canUpdate}
              aria-label={`Status of ${task.title}`}
              onChange={(event) => void hq.placeTask(task, event.target.value as Lane).catch(() => undefined)}
            >
              {(Object.keys(STATUS_LABEL) as Lane[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
            </select>
            {hq.isAdmin ? (
              <input
                type="date"
                className={late ? "tl-due late" : "tl-due"}
                value={task.dueDate ?? ""}
                aria-label={`Due date of ${task.title}`}
                onChange={(event) => {
                  const dueDate = event.target.value || null;
                  void hq.saveTask({ ...task, dueDate, updatedAt: new Date().toISOString() }, dueDate ? `Due ${formatDay(dueDate)}` : "Cleared the due date").catch(() => undefined);
                }}
              />
            ) : (
              <span className={late ? "tl-text late" : "tl-text"}>{task.dueDate ? formatDay(task.dueDate) : "No date"}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
