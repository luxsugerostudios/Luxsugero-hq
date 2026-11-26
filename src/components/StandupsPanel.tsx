import { useMemo, useState } from "react";
import { formatDay, kolkataDay } from "../lib/dates";
import { useHqContext } from "../lib/hq";
import { orgSeat } from "../lib/orbit";
import { parseStandup, type QuickDraft } from "../lib/quickAdd";
import { makeTask } from "./TaskList";
import { OwnerSelect, ownerLabel, useOwnerGroups } from "./ui/OwnerSelect";
import { actorName } from "./TasksPanel";

type Row = QuickDraft & { ownerId: string };

/**
 * Daily standup log. Admins (founder, Hari Om, Shrishti) write what happened
 * and list the next actions; each action line becomes a task in one save.
 */
export function StandupsPanel() {
  const hq = useHqContext();
  const today = kolkataDay();
  const groups = useOwnerGroups();
  const [date, setDate] = useState(today);
  const [summary, setSummary] = useState("");
  const [lines, setLines] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const roster = useMemo(
    () => hq.data.people.map((person) => ({ id: person.id, name: orgSeat(person.id)?.name ?? person.name })),
    [hq.data.people],
  );

  const author = (id: string) => (id === "founder" ? "Founder" : orgSeat(id)?.name ?? actorName(id, hq.data.people));

  function review(text: string) {
    setLines(text);
    setRows(parseStandup(text, date, roster).map((row) => ({ ...row, ownerId: row.ownerId ?? "unassigned" })));
  }

  async function save() {
    if (!summary.trim() && rows.length === 0) return;
    setSaving(true);
    const now = new Date().toISOString();
    const id = `${date}-${hq.personId ?? "admin"}-${now.slice(11, 19).replace(/:/g, "")}`;
    try {
      await hq.saveStandup({
        id,
        date,
        authorId: hq.personId ?? "admin",
        summary: summary.trim() || `${rows.length} action items`,
        taskCount: rows.length,
        createdAt: now,
        updatedAt: now,
      });
      await Promise.all(
        rows
          .filter((row) => row.title.trim())
          .map((row) =>
            hq.saveTask(
              makeTask({
                title: row.title.trim(),
                ownerId: row.ownerId,
                givenDate: date,
                dueDate: row.dueDate,
                brand: row.brand,
                longTerm: row.longTerm,
                flagAfterDays: row.longTerm ? 7 : null,
                note: `Standup ${formatDay(date)}`,
              }),
              `From the ${formatDay(date)} standup`,
            ),
          ),
      );
      setSaved(`Saved the ${formatDay(date)} standup${rows.length ? ` and created ${rows.length} ${rows.length === 1 ? "task" : "tasks"}` : ""}.`);
      setSummary("");
      setLines("");
      setRows([]);
    } catch {
      /* the banner already shows the reason */
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="standups-heading">
      <div className="section-head">
        <h2 id="standups-heading">Standups</h2>
        <p className="meta">One log per day: what happened, and the actions that came out of it.</p>
      </div>

      {hq.isAdmin ? (
        <form
          className="su-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="su-top">
            <label>
              Date
              <input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value || today)} />
            </label>
            <p className="meta">Logged by {author(hq.personId ?? "admin")}</p>
          </div>
          <label>
            Summary
            <textarea
              rows={5}
              maxLength={10000}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="What was discussed, decisions, blockers, numbers worth remembering."
            />
          </label>
          <label>
            Action items, one per line
            <textarea
              rows={5}
              value={lines}
              onChange={(event) => review(event.target.value)}
              placeholder={"Shrishti: ads live by 6 PM #skybox today\nGaurav: Woodman costing tomorrow\nEveryone: Google Business Profile 30 Nov"}
            />
          </label>
          <p className="meta">Start a line with a name and a colon to assign it. Add #skybox, #stays, #fh or #braj for the brand, and today, tomorrow, a weekday or a date like 30 Nov for the due date.</p>

          {rows.length > 0 ? (
            <ul className="su-rows" aria-label="Tasks to create">
              {rows.map((row, index) => (
                <li key={index} className={row.ownerId === "unassigned" ? "is-loose" : undefined}>
                  <input
                    value={row.title}
                    aria-label="Task title"
                    onChange={(event) => setRows((current) => current.map((item, i) => (i === index ? { ...item, title: event.target.value } : item)))}
                  />
                  <OwnerSelect
                    value={row.ownerId}
                    allowNone
                    label="Owner"
                    onChange={(ownerId) => setRows((current) => current.map((item, i) => (i === index ? { ...item, ownerId } : item)))}
                  />
                  <input
                    type="date"
                    value={row.dueDate ?? ""}
                    aria-label="Due date"
                    onChange={(event) => setRows((current) => current.map((item, i) => (i === index ? { ...item, dueDate: event.target.value || null } : item)))}
                  />
                  <button type="button" className="ghost" aria-label={`Remove ${row.title}`} onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="row">
            <button type="submit" className="primary" disabled={saving || (!summary.trim() && rows.length === 0)}>
              {saving ? "Saving…" : rows.length ? `Save standup and create ${rows.length} ${rows.length === 1 ? "task" : "tasks"}` : "Save standup"}
            </button>
            {saved ? <span className="saved" role="status">{saved}</span> : null}
          </div>
        </form>
      ) : null}

      {hq.access === "signed-out" || hq.access === "pending" ? <p className="empty">Sign in to read the standup log.</p> : null}

      <div className="su-log">
        <h3>Log</h3>
        {hq.data.standups.length === 0 && (hq.isAdmin || hq.isMember) ? <p className="empty">No standups logged yet.</p> : null}
        {hq.data.standups.map((entry) => {
          const open = openId === entry.id;
          return (
            <article key={entry.id} className="su-entry">
              <header>
                <b>{formatDay(entry.date)}</b>
                <span className="meta">{author(entry.authorId)}{entry.taskCount ? ` · ${entry.taskCount} ${entry.taskCount === 1 ? "task" : "tasks"}` : ""}</span>
              </header>
              <p className={open ? "su-text" : "su-text clamp"}>{entry.summary}</p>
              {entry.summary.length > 280 ? (
                <button type="button" className="ghost" onClick={() => setOpenId(open ? null : entry.id)}>{open ? "Show less" : "Read all"}</button>
              ) : null}
              {entry.taskCount ? (
                <ul className="su-made">
                  {hq.data.tasks
                    .filter((task) => task.note === `Standup ${formatDay(entry.date)}`)
                    .slice(0, 12)
                    .map((task) => (
                      <li key={task.id}>
                        <span>{task.title}</span>
                        <i>{ownerLabel(task.ownerId, groups)}{task.status === "done" ? " · done" : ""}</i>
                      </li>
                    ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
