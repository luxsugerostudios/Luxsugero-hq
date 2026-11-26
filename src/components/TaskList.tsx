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

type Draft = { ownerId: string; lane: Lane; dueDate: string };
type Toast = { text: string; taskId: string | null; undo?: () => void };

function draftOf(task: Task): Draft {
  return { ownerId: task.ownerId, lane: taskLane(task), dueDate: task.dueDate ?? "" };
}

/**
 * Every task on one line. Owner, status and due date can be changed in the
 * row; nothing is saved until Save, and after saving a note says where the
 * task went with a button that scrolls to it.
 */
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
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  function say(next: Toast) {
    window.clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast(null), 9000);
  }

  function showTask(id: string) {
    const row = document.querySelector(`[data-task="${id}"]`);
    if (!row) {
      say({ text: "It is hidden by the current filter. Set Show to All open, or pick the person, to see it.", taskId: null });
      return;
    }
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    window.setTimeout(() => setFlash(null), 2200);
  }

  async function save(task: Task, draft: Draft) {
    setSaving(task.id);
    const parts: string[] = [];
    try {
      if (draft.ownerId !== task.ownerId) {
        await hq.reassignTask(task, draft.ownerId);
        parts.push(draft.ownerId === "unassigned" ? "Owner removed" : `Assigned to ${ownerLabel(draft.ownerId, groups)}`);
      }
      const moved = { ...task, ownerId: draft.ownerId };
      if (draft.lane !== taskLane(task)) {
        await hq.placeTask(moved, draft.lane);
        parts.push(`Moved to ${STATUS_LABEL[draft.lane]}`);
      }
      if ((draft.dueDate || null) !== task.dueDate) {
        const dueDate = draft.dueDate || null;
        await hq.saveTask(
          { ...moved, status: draft.lane === "done" ? "done" : moved.status, lane: draft.lane, dueDate, updatedAt: new Date().toISOString() },
          dueDate ? `Due ${formatDay(dueDate)}` : "Cleared the due date",
        );
        parts.push(dueDate ? `due ${formatDay(dueDate)}` : "no due date");
      }
      setDrafts((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      const where =
        draft.lane === "done"
          ? "It is under Done this week."
          : draft.ownerId !== task.ownerId && draft.ownerId !== "unassigned"
            ? `It is now in ${ownerLabel(draft.ownerId, groups)}'s list.`
            : "";
      say({ text: `Saved: ${parts.join(", ") || "no changes"}. ${where}`.trim(), taskId: task.id });
      window.setTimeout(() => {
        const row = document.querySelector(`[data-task="${task.id}"]`);
        if (row) {
          setFlash(task.id);
          window.setTimeout(() => setFlash(null), 2200);
        }
      }, 80);
    } catch {
      /* the red banner at the top explains what failed */
    } finally {
      setSaving(null);
    }
  }

  if (tasks.length === 0) {
    return (
      <>
        <p className="empty">{empty}</p>
        {toast ? <ListToast toast={toast} onShow={showTask} onClose={() => setToast(null)} /> : null}
      </>
    );
  }

  return (
    <>
      <ul className="tlist" aria-label="Tasks">
        <li className="tl-head" aria-hidden="true">
          <span />
          <span>Task</span>
          <span>Owner</span>
          <span>Status</span>
          <span>Due</span>
          <span />
        </li>
        {tasks.map((task) => {
          const mine = Boolean(hq.personId && task.ownerId === hq.personId);
          const canUpdate = hq.isAdmin || (hq.isMember && mine);
          const draft = drafts[task.id] ?? draftOf(task);
          const base = draftOf(task);
          const dirty = draft.ownerId !== base.ownerId || draft.lane !== base.lane || draft.dueDate !== base.dueDate;
          const late = isOverdue(task.status, task.givenDate, today, task.flagAfterDays, task.longTerm);
          const loose = task.ownerId === "unassigned";
          const edit = (patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [task.id]: { ...draft, ...patch } }));
          return (
            <li
              key={task.id}
              data-task={task.id}
              className={`tl-row${loose ? " is-loose" : ""}${late ? " is-late" : ""}${task.status === "done" ? " is-done" : ""}${dirty ? " is-dirty" : ""}${flash === task.id ? " is-flash" : ""}`}
              style={{ boxShadow: task.brand ? `inset 3px 0 0 ${BRAND_COLOR[task.brand]}` : undefined }}
            >
              <input
                type="checkbox"
                className="tl-check"
                checked={task.status === "done"}
                disabled={!canUpdate || dirty}
                title={dirty ? "Save or cancel your changes first" : undefined}
                aria-label={task.status === "done" ? `Reopen ${task.title}` : `Mark ${task.title} done`}
                onChange={(event) => {
                  const done = event.target.checked;
                  if (done) burst(event.target.getBoundingClientRect().left, event.target.getBoundingClientRect().top);
                  void hq
                    .setTaskStatus(task, done ? "done" : "open")
                    .then(() =>
                      say({
                        text: done ? `Marked done: ${task.title}. It is under Done this week.` : `Reopened: ${task.title}.`,
                        taskId: task.id,
                        undo: () => void hq.setTaskStatus({ ...task, status: done ? "done" : "open" }, done ? "open" : "done").catch(() => undefined),
                      }),
                    )
                    .catch(() => undefined);
                }}
              />
              <button type="button" className="tl-title" title="Open notes and history" onClick={() => onOpen(task.id)}>
                <span>{task.title}</span>
                <AgeBadge task={task} today={today} />
              </button>
              {hq.isAdmin ? (
                <OwnerSelect
                  className={draft.ownerId === "unassigned" ? "tl-owner needs" : "tl-owner"}
                  value={draft.ownerId}
                  allowNone
                  label={`Owner of ${task.title}`}
                  onChange={(ownerId) => edit({ ownerId })}
                />
              ) : (
                <span className="tl-text">{ownerLabel(task.ownerId, groups)}</span>
              )}
              <select
                className={`tl-status s-${draft.lane}`}
                value={draft.lane}
                disabled={!canUpdate}
                aria-label={`Status of ${task.title}`}
                onChange={(event) => edit({ lane: event.target.value as Lane })}
              >
                {(Object.keys(STATUS_LABEL) as Lane[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
              </select>
              {hq.isAdmin ? (
                <input
                  type="date"
                  className={late ? "tl-due late" : "tl-due"}
                  value={draft.dueDate}
                  aria-label={`Due date of ${task.title}`}
                  onChange={(event) => edit({ dueDate: event.target.value })}
                />
              ) : (
                <span className={late ? "tl-text late" : "tl-text"}>{task.dueDate ? formatDay(task.dueDate) : "No date"}</span>
              )}
              <span className="tl-actions">
                {dirty ? (
                  <>
                    <button type="button" className="primary" disabled={saving === task.id} onClick={() => void save(task, draft)}>
                      {saving === task.id ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        setDrafts((current) => {
                          const next = { ...current };
                          delete next[task.id];
                          return next;
                        })
                      }
                    >
                      Cancel
                    </button>
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {toast ? <ListToast toast={toast} onShow={showTask} onClose={() => setToast(null)} /> : null}
    </>
  );
}

function ListToast({ toast, onShow, onClose }: { toast: Toast; onShow: (id: string) => void; onClose: () => void }) {
  return (
    <div className="tl-toast" role="status">
      <span>{toast.text}</span>
      {toast.taskId ? <button type="button" className="ghost" onClick={() => onShow(toast.taskId!)}>Show me</button> : null}
      {toast.undo ? (
        <button
          type="button"
          className="ghost"
          onClick={() => {
            toast.undo?.();
            onClose();
          }}
        >
          Undo
        </button>
      ) : null}
      <button type="button" className="ghost" aria-label="Dismiss" onClick={onClose}>✕</button>
    </div>
  );
}
