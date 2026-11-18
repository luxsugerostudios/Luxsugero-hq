import { useEffect, useState } from "react";
import { formatDay, kolkataDay } from "../../lib/dates";
import { useHqContext } from "../../lib/hq";
import { orgSeat } from "../../lib/orbit";
import { LANES } from "../../lib/types";
import { actorName } from "../TasksPanel";
import { PersonPicker } from "./PersonPicker";

export function TaskDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const hq = useHqContext();
  const task = hq.data.tasks.find((item) => item.id === taskId);
  const [note, setNote] = useState(task?.note ?? "");
  const [longTerm, setLongTerm] = useState(Boolean(task?.longTerm));
  const mine = Boolean(hq.personId && task && task.ownerId === hq.personId);
  const canUpdate = Boolean(task && (hq.isAdmin || (hq.isMember && mine)));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!task) return null;
  const seat = orgSeat(task.ownerId);

  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={task.title} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="ghost" onClick={onClose}>Close</button>
        <h3>{task.title}</h3>
        <p className="meta">{seat ? `${seat.name} · ${seat.title}` : actorName(task.ownerId, hq.data.people)}</p>
        <p className="meta">
          {task.brand ?? "No brand"} · Given {formatDay(task.givenDate)}
          {task.dueDate ? ` · Due ${formatDay(task.dueDate)}` : " · No due date"}
          {` · ${task.lane ?? "todo"}`}
        </p>
        {canUpdate ? (
          <label>
            Lane
            <select
              value={task.status === "done" ? "done" : task.lane === "doing" || task.lane === "waiting" ? task.lane : "todo"}
              onChange={(event) => {
                const lane = event.target.value as (typeof LANES)[number];
                void hq.placeTask(task, lane).catch(() => undefined);
              }}
            >
              {LANES.map((lane) => <option key={lane} value={lane}>{lane}</option>)}
            </select>
          </label>
        ) : <p className="meta">You can only update your own tasks.</p>}
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canUpdate) return;
            void hq.setTaskNote(task, note.trim()).catch(() => undefined);
          }}
        >
          <label>
            Note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} disabled={!canUpdate} />
          </label>
          {canUpdate ? <button type="submit" className="ghost">Save note</button> : null}
        </form>
        {hq.isAdmin ? (
          <>
            <p className="meta">Reassign</p>
            <PersonPicker value={task.ownerId} onChange={(ownerId) => void hq.reassignTask(task, ownerId).catch(() => undefined)} />
            <label className="check">
              <input
                type="checkbox"
                checked={longTerm}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setLongTerm(checked);
                  void hq.saveTask({
                    ...task,
                    longTerm: checked,
                    flagAfterDays: checked ? 7 : null,
                    updatedAt: new Date().toISOString(),
                  }, checked ? "Marked long-term" : "Cleared long-term").catch(() => undefined);
                }}
              />
              Long-term (flag after 7 days)
            </label>
          </>
        ) : <p className="meta">Only an admin can reassign or change the long-term flag.</p>}
        <h4>History</h4>
        {(hq.data.history[task.id] ?? []).length === 0 ? <p className="empty">No changes yet</p> : null}
        <ul>
          {(hq.data.history[task.id] ?? []).map((event) => (
            <li key={event.id}>{formatDay(event.at.slice(0, 10))} · {event.summary}</li>
          ))}
        </ul>
        <p className="meta">{kolkataDay()}</p>
      </aside>
    </div>
  );
}
