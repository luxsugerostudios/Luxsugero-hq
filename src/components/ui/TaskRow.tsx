import { formatDay, kolkataDay } from "../../lib/dates";
import { useHqContext } from "../../lib/hq";
import { BRAND_COLOR, orgSeat } from "../../lib/orbit";
import type { Task } from "../../lib/types";
import { actorName } from "../TasksPanel";
import { AgeBadge } from "./AgeBadge";

export function TaskRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const hq = useHqContext();
  const today = kolkataDay();
  const mine = Boolean(hq.personId && task.ownerId === hq.personId);
  const canUpdate = hq.isAdmin || (hq.isMember && mine);
  const owner = orgSeat(task.ownerId)?.name ?? actorName(task.ownerId, hq.data.people);
  const edge = task.brand ? BRAND_COLOR[task.brand] : "transparent";

  return (
    <div className="row-item" style={{ boxShadow: `inset 3px 0 0 ${edge}` }}>
      <button type="button" className="chip-task" title={task.title} onClick={onOpen}>
        <span>{task.title}</span>
      </button>
      <span className="meta">{owner}</span>
      <AgeBadge task={task} today={today} />
      <span className="meta">{task.dueDate ? formatDay(task.dueDate) : "No date"}</span>
      <div className="hover-actions">
        {canUpdate && task.status === "open" ? (
          <button type="button" className="ghost" onClick={() => void hq.setTaskStatus(task, "done").catch(() => undefined)}>Done</button>
        ) : null}
        {canUpdate && task.status === "done" ? (
          <button type="button" className="ghost" onClick={() => void hq.setTaskStatus(task, "open").catch(() => undefined)}>Reopen</button>
        ) : null}
        {canUpdate ? (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const order = ["todo", "doing", "waiting"] as const;
              const current = task.lane === "doing" || task.lane === "waiting" ? task.lane : "todo";
              const next = order[(order.indexOf(current) + 1) % order.length];
              void hq.placeTask(task, next).catch(() => undefined);
            }}
          >
            Lane
          </button>
        ) : null}
        <button type="button" className="ghost" onClick={onOpen}>Note</button>
        {hq.isAdmin ? <button type="button" className="ghost" onClick={onOpen}>Reassign</button> : null}
      </div>
    </div>
  );
}
