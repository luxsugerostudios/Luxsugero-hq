import { useState } from "react";
import { formatDay, kolkataDay } from "../lib/dates";
import { useHqContext } from "../lib/hq";
import { actorName } from "./TasksPanel";
import type { BrandId, InboxItem } from "../lib/types";
import { BRAND_IDS } from "../lib/types";

export function InboxPanel() {
  const hq = useHqContext();
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const needle = query.trim().toLowerCase();
  const items = hq.data.inbox
    .filter((item) => (brand === "all" ? true : item.brand === brand))
    .filter((item) =>
      needle ? `${item.title} ${item.details} ${item.note ?? ""}`.toLowerCase().includes(needle) : true,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <section aria-labelledby="inbox-heading">
      <div className="section-head">
        <h2 id="inbox-heading">Main bucket</h2>
      </div>
      {hq.access === "guest" && hq.phase === "live" ? (
        <p className="banner" role="status">
          Ask the founder to add your email
        </p>
      ) : null}
      {(hq.isAdmin || hq.isMember) && hq.personId ? <RequestForm /> : null}
      <div className="toolbar">
        <label>
          Search
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search requests" />
        </label>
        <label>
          Brand
          <select value={brand} onChange={(event) => setBrand(event.target.value)}>
            <option value="all">All brands</option>
            {BRAND_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      </div>
      {items.length === 0 ? <p className="empty">The main bucket is clear.</p> : null}
      <div className="stack">
        {items.map((item) => (
          <RequestCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function RequestForm() {
  const { data, createInbox, personId } = useHqContext();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [brand, setBrand] = useState<"" | BrandId>("");
  const [tags, setTags] = useState<string[]>(["HQ"]);
  const people = data.people.filter((person) => person.id !== "everyone" && person.id !== "unassigned");
  const choices = ["HQ", ...people.map((person) => person.id), ...data.agents.map((agent) => agent.id)];

  function label(id: string) {
    if (id === "HQ") return "HQ";
    return data.people.find((person) => person.id === id)?.name
      ?? data.agents.find((agent) => agent.id === id)?.name
      ?? id;
  }

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!personId || tags.length === 0) return;
        const now = new Date().toISOString();
        const item: InboxItem = {
          id: crypto.randomUUID(),
          title: title.trim(),
          details: details.trim(),
          raisedBy: personId,
          assignees: tags,
          dueDate: dueDate || null,
          brand: brand || null,
          status: "new",
          response: null,
          note: null,
          taskId: null,
          createdAt: now,
          updatedAt: now,
        };
        void createInbox(item)
          .then(() => {
            setTitle("");
            setDetails("");
            setTags(["HQ"]);
          })
          .catch(() => undefined);
      }}
    >
      <label className="wide">
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required />
      </label>
      <label className="wide">
        Details
        <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={3} maxLength={4000} required />
      </label>
      <fieldset className="wide tags">
        <legend>Tag</legend>
        {choices.map((id) => (
          <label key={id} className="check">
            <input
              type="checkbox"
              checked={tags.includes(id)}
              onChange={(event) =>
                setTags((current) =>
                  event.target.checked ? [...current, id] : current.filter((item) => item !== id),
                )
              }
            />
            {label(id)}
          </label>
        ))}
      </fieldset>
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
      <button type="submit" className="primary" disabled={tags.length === 0}>
        Add to main bucket
      </button>
    </form>
  );
}

function RequestCard({ item }: { item: InboxItem }) {
  const hq = useHqContext();
  const [ownerId, setOwnerId] = useState(hq.data.people[0]?.id ?? "unassigned");
  const [response, setResponse] = useState(item.response ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [tags, setTags] = useState(item.assignees);
  const tagged = Boolean(hq.personId && item.assignees.includes(hq.personId));
  const raised = item.raisedBy === hq.personId;
  const canRespond = hq.isAdmin || ((hq.isMember || hq.isAdmin) && (tagged || raised));
  const people = hq.data.people.filter((person) => person.id !== "everyone" && person.id !== "unassigned");

  function tagLabel(id: string) {
    if (id === "HQ") return "HQ";
    return actorName(id, hq.data.people) === id
      ? hq.data.agents.find((agent) => agent.id === id)?.name ?? id
      : actorName(id, hq.data.people);
  }

  return (
    <article className={`lead inbox-card status-${item.status}`}>
      <header>
        <h3>{item.title}</h3>
        <span className="pill">{item.status.replace("_", " ")}</span>
      </header>
      <p>{item.details}</p>
      <p className="meta">
        Raised by {actorName(item.raisedBy, hq.data.people)}
        {item.brand ? ` · ${item.brand}` : ""}
        {item.dueDate ? ` · Due ${formatDay(item.dueDate)}` : ""}
      </p>
      <p className="meta">Tagged {item.assignees.map(tagLabel).join(", ")}</p>
      {item.response ? <p className="response">{item.response}</p> : null}
      {item.note ? <p className="focus">{item.note}</p> : null}
      {hq.isMember && tagged && item.status !== "done" ? (
        <div className="row">
          <button type="button" className="tick" onClick={() => void hq.acceptInbox(item).catch(() => undefined)}>
            Accept
          </button>
          <button
            type="button"
            className="tick ghost"
            onClick={() => void hq.updateInbox(item.id, { status: "done" }).catch(() => undefined)}
          >
            Mark done
          </button>
        </div>
      ) : null}
      {hq.isAdmin ? (
        <div className="stack">
          <label>
            Convert into
            <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              {hq.data.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button type="button" className="primary" onClick={() => void hq.convertInbox(item, ownerId).catch(() => undefined)}>
              Convert to task
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void hq.updateInbox(item.id, { status: "done" }).catch(() => undefined)}
            >
              Close
            </button>
          </div>
          <fieldset className="tags">
            <legend>Reassign</legend>
            {["HQ", ...people.map((person) => person.id), ...hq.data.agents.map((agent) => agent.id)].map((id) => (
              <label key={id} className="check">
                <input
                  type="checkbox"
                  checked={tags.includes(id)}
                  onChange={(event) =>
                    setTags((current) =>
                      event.target.checked ? [...current, id] : current.filter((itemId) => itemId !== id),
                    )
                  }
                />
                {tagLabel(id)}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="ghost"
            disabled={tags.length === 0}
            onClick={() => void hq.updateInbox(item.id, { assignees: tags }).catch(() => undefined)}
          >
            Save tags
          </button>
        </div>
      ) : null}
      {canRespond ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void hq
              .updateInbox(item.id, { response: response.trim() || null, note: note.trim() || null })
              .catch(() => undefined);
          }}
        >
          <label>
            Response
            <input value={response} onChange={(event) => setResponse(event.target.value)} maxLength={4000} />
          </label>
          <label>
            Note
            <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} />
          </label>
          <button type="submit" className="ghost">
            Save response
          </button>
        </form>
      ) : null}
      <p className="meta">Added {item.createdAt ? formatDay(item.createdAt.slice(0, 10)) : kolkataDay()}</p>
    </article>
  );
}
