import { useMemo, useState } from "react";
import { useHqContext } from "../../lib/hq";
import { ORG } from "../../lib/orbit";
import { planSmartBalance, TEAM } from "../../lib/team";
import type { Task } from "../../lib/types";
import { OwnerSelect, ownerLabel, useOwnerGroups } from "./OwnerSelect";

/** Open-task count per owner, for balancing. */
export function openCounts(tasks: Task[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const task of tasks) if (task.status === "open") counts[task.ownerId] = (counts[task.ownerId] ?? 0) + 1;
  return counts;
}

/**
 * Proposes an owner for every task that has none, by department, level and
 * load. Nothing changes until the admin presses Assign.
 */
export function BalancePanel({ tasks, onClose }: { tasks: Task[]; onClose: () => void }) {
  const hq = useHqContext();
  const groups = useOwnerGroups();
  const unowned = useMemo(() => tasks.filter((task) => task.status === "open" && task.ownerId === "unassigned"), [tasks]);
  const initial = useMemo(() => {
    const roster = new Set([...hq.data.people.map((person) => person.id), ...ORG.map((seat) => seat.id)]);
    return planSmartBalance(unowned, openCounts(hq.data.tasks), TEAM, roster);
  }, [unowned, hq.data.people, hq.data.tasks]);
  const [plan, setPlan] = useState(() => initial.map((row) => ({ ...row, on: true })));
  const [busy, setBusy] = useState(false);
  const chosen = plan.filter((row) => row.on && row.personId !== "unassigned");

  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer balance" role="dialog" aria-labelledby="balance-heading" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="ghost" onClick={onClose}>Close</button>
        <h3 id="balance-heading">Auto-balance {unowned.length} {unowned.length === 1 ? "task" : "tasks"} with no owner</h3>
        <p className="meta">Matched by department and role first, then by who has room. Change any owner or untick a task before assigning. Tasks that already have an owner are not touched.</p>
        {plan.length === 0 ? <p className="empty">Every task has an owner.</p> : null}
        <ul className="bal-list">
          {plan.map((row, index) => {
            const task = unowned.find((item) => item.id === row.taskId);
            if (!task) return null;
            return (
              <li key={row.taskId} className={row.on ? undefined : "is-off"}>
                <input
                  type="checkbox"
                  checked={row.on}
                  aria-label={`Include ${task.title}`}
                  onChange={(event) => setPlan((current) => current.map((item, i) => (i === index ? { ...item, on: event.target.checked } : item)))}
                />
                <div className="bal-task">
                  <b title={task.title}>{task.title}</b>
                  <span className="meta">{row.reason}</span>
                </div>
                <OwnerSelect
                  value={row.personId}
                  label={`Owner for ${task.title}`}
                  onChange={(personId) => setPlan((current) => current.map((item, i) => (i === index ? { ...item, personId, reason: "Picked by hand" } : item)))}
                />
              </li>
            );
          })}
        </ul>
        {plan.length > 0 ? (
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={busy || chosen.length === 0}
              onClick={() => {
                setBusy(true);
                void Promise.all(
                  chosen.map((row) => {
                    const task = unowned.find((item) => item.id === row.taskId);
                    return task ? hq.reassignTask(task, row.personId) : Promise.resolve();
                  }),
                )
                  .then(onClose)
                  .catch(() => undefined)
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "Assigning…" : `Assign ${chosen.length} ${chosen.length === 1 ? "task" : "tasks"}`}
            </button>
            <span className="meta">
              {[...new Set(chosen.map((row) => row.personId))]
                .map((id) => `${ownerLabel(id, groups)} +${chosen.filter((row) => row.personId === id).length}`)
                .join(" · ")}
            </span>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
