import { useMemo, useState } from "react";
import { closedDay, kpis, PERIODS, windowFor, type PeriodId } from "../../lib/analytics";
import { diffDays, formatDay, isOverdue } from "../../lib/dates";
import { useHqContext } from "../../lib/hq";
import { ORG, orgSeat } from "../../lib/orbit";
import { visibleTasks } from "../../lib/tasks";
import type { Task } from "../../lib/types";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const BRAND: Record<string, string> = { skybox: "Skybox", stays: "Stays", fh: "Forest Hills", braj: "Braj Murliwala" };

/**
 * Admin-only: pick one person and a period, and see everything they closed
 * (with timing) plus what is still open on their plate.
 */
export function PersonReview({ today, onOpen }: { today: string; onOpen?: (id: string) => void }) {
  const { data, isAdmin } = useHqContext();
  const people = useMemo(() => {
    const ids = [...new Set([...ORG.map((seat) => seat.id), ...data.people.map((person) => person.id)])].filter((id) => id !== "unassigned" && id !== "everyone");
    return ids.map((id) => ({ id, name: orgSeat(id)?.name ?? data.people.find((person) => person.id === id)?.name ?? id }));
  }, [data.people]);
  const [personId, setPersonId] = useState(() => (people.some((p) => p.id === "shrishti") ? "shrishti" : people[0]?.id ?? ""));
  const [period, setPeriod] = useState<PeriodId>("15");
  if (!isAdmin) return null;

  const days = PERIODS.find((item) => item.id === period)!.days;
  const w = windowFor(today, days);
  const prev = windowFor(today, days, 1);
  const tasks = visibleTasks(data.tasks).filter((task) => task.ownerId === personId);
  const k = kpis(tasks, w, today);
  const kPrev = kpis(tasks, prev, today);
  const done = tasks
    .filter((task) => {
      const day = closedDay(task);
      return day >= w.start && day <= w.end;
    })
    .sort((a, b) => closedDay(b).localeCompare(closedDay(a)));
  const open = tasks
    .filter((task) => task.status === "open")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.givenDate.localeCompare(b.givenDate));
  const brands = new Map<string, number>();
  for (const task of done) brands.set(task.brand ?? "none", (brands.get(task.brand ?? "none") ?? 0) + 1);
  const files = (task: Task) => data.attachments.filter((item) => item.parentType === "task" && item.parentId === task.id).length;
  const name = people.find((p) => p.id === personId)?.name ?? personId;
  const seat = orgSeat(personId);

  return (
    <article className="ix-card pr">
      <div className="pr-head">
        <div>
          <h3>Person review</h3>
          <p className="meta">Everything one person closed in a period, and what is still on their plate. Admins only.</p>
        </div>
        <div className="ix-actions">
          <label>
            Person
            <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <label>
            Period
            <select value={period} onChange={(event) => setPeriod(event.target.value as PeriodId)}>
              {PERIODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <p className="pr-lede">
        <b>{name}</b>{seat ? ` · ${seat.title}` : ""} closed <b>{k.closed}</b> {k.closed === 1 ? "task" : "tasks"} from {formatDay(w.start)} to {formatDay(w.end)}
        {kPrev.closed !== k.closed ? ` (${k.closed > kPrev.closed ? "up" : "down"} from ${kPrev.closed} the period before)` : " (same as the period before)"}
        {brands.size ? `; by brand: ${[...brands.entries()].sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b === "none" ? "no brand" : BRAND[b] ?? b} ${n}`).join(", ")}` : ""}.
      </p>

      <div className="pr-kpis">
        <div><b>{k.closed}</b><span>closed</span></div>
        <div><b>{k.created}</b><span>given</span></div>
        <div><b>{pct(k.onTimeRate)}</b><span>{k.datedClosed ? `${k.onTimeClosed} of ${k.datedClosed} on time` : "on time"}</span></div>
        <div><b>{k.medianCycleDays ?? "—"}</b><span>median days to close</span></div>
        <div><b>{open.length}</b><span>open now</span></div>
        <div><b>{open.filter((t) => isOverdue("open", t.givenDate, today, t.flagAfterDays, t.longTerm) || (t.dueDate !== null && t.dueDate < today)).length}</b><span>late now</span></div>
      </div>

      <div className="pr-cols">
        <section>
          <h4>Completed ({done.length})</h4>
          {done.length === 0 ? <p className="empty">Nothing closed in this period.</p> : null}
          <ul className="pr-list">
            {done.map((task) => {
              const closed = closedDay(task);
              const took = Math.max(0, diffDays(task.givenDate, closed));
              const onTime = task.dueDate ? closed <= task.dueDate : null;
              return (
                <li key={task.id}>
                  <button type="button" className="pr-title" onClick={() => onOpen?.(task.id)} title={task.title}>{task.title}</button>
                  <span className="pr-meta">
                    Done {formatDay(closed)} · took {took} {took === 1 ? "day" : "days"}
                    {onTime === null ? " · no due date" : onTime ? " · on time" : ` · late (due ${formatDay(task.dueDate!)})`}
                    {task.brand ? ` · ${BRAND[task.brand] ?? task.brand}` : ""}
                    {files(task) ? ` · ${files(task)} file${files(task) === 1 ? "" : "s"}` : ""}
                  </span>
                  {onTime === false ? <i className="pr-tag late">late</i> : onTime ? <i className="pr-tag ok">on time</i> : null}
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h4>Still open ({open.length})</h4>
          {open.length === 0 ? <p className="empty">Nothing open.</p> : null}
          <ul className="pr-list">
            {open.map((task) => {
              const late = task.dueDate !== null && task.dueDate < today;
              return (
                <li key={task.id}>
                  <button type="button" className="pr-title" onClick={() => onOpen?.(task.id)} title={task.title}>{task.title}</button>
                  <span className="pr-meta">
                    Given {formatDay(task.givenDate)} ({diffDays(task.givenDate, today)}d ago) · {task.dueDate ? `due ${formatDay(task.dueDate)}` : "no due date"} · {task.lane ?? "todo"}
                  </span>
                  {late ? <i className="pr-tag late">late</i> : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </article>
  );
}
