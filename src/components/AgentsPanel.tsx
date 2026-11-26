import { useState } from "react";
import { formatStamp } from "../lib/dates";
import { useHqContext } from "../lib/hq";
import { DIRECTIVE_STATUS_LABEL } from "../lib/labels";
import { AGENT_STATE_LABEL, agentState } from "../lib/orbit";
import { AgentOrbit } from "./AgentOrbit";
import { AGENT_GROUPS, DIRECTIVE_STATUSES, type Agent, type Directive, type DirectiveStatus } from "../lib/types";

export function AgentsPanel() {
  const { data, canEdit, saveDirective } = useHqContext();
  const agents = [...data.agents].sort((a, b) => a.order - b.order);

  return (
    <section aria-labelledby="agents-heading">
      <div className="section-head big-head">
        <h2 id="agents-heading">Agent orbit</h2>
        <p className="meta">
          HQ at the core. Brand PMs on the inner ring, the crew on the tilted ring, departments on the outer ring. Pink shards are open tasks with no owner.
        </p>
      </div>
      <AgentOrbit />
      <h3 className="list-head">All agents</h3>
      {canEdit ? <DirectiveComposer agents={agents} onSave={saveDirective} /> : null}
      {AGENT_GROUPS.map((group) => {
        const rows = agents.filter((agent) => agent.group === group);
        if (rows.length === 0) return null;
        return (
          <div key={group} className="group">
            <h3 className="kicker">{group}</h3>
            <div className="board">
              {rows.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  canEdit={canEdit}
                  directives={data.directives.filter((item) => item.agentId === agent.id)}
                  onSave={saveDirective}
                />
              ))}
            </div>
          </div>
        );
      })}
      {canEdit ? (
        <BroadcastHistory
          directives={data.directives.filter((item) => item.agentId === "all")}
          onSave={saveDirective}
        />
      ) : null}
    </section>
  );
}

function AgentCard({
  agent,
  directives,
  canEdit,
  onSave,
}: {
  agent: Agent;
  directives: Directive[];
  canEdit: boolean;
  onSave: (directive: Directive) => Promise<void>;
}) {
  const answerFor = (item: string) => directives.find((d) => d.text.startsWith(`Re: ${item}\n`));
  const pending = agent.waitingOnFounder.filter((item) => !answerFor(item));
  const state = agentState({ ...agent, waitingOnFounder: pending }, directives);
  return (
    <article className={`agent state-${state}`}>
      <header>
        <h4>{agent.name}</h4>
        <span className="pill">{AGENT_STATE_LABEL[state]}</span>
      </header>
      <p className="focus">{agent.focus}</p>
      {agent.waitingOnFounder.length > 0 ? (
        <>
          <h4>Waiting on founder {pending.length ? <span className="wf-count">{pending.length} to answer</span> : <span className="wf-count done">all answered</span>}</h4>
          <ul className="wf-list">
            {agent.waitingOnFounder.map((item) => (
              <WaitingItem key={item} agentId={agent.id} item={item} answer={answerFor(item)} canEdit={canEdit} onSave={onSave} />
            ))}
          </ul>
        </>
      ) : null}
      <p className="meta">Updated {agent.updatedAt ? formatStamp(agent.updatedAt) : "—"}</p>
      {canEdit ? (
        <details>
          <summary>Directives ({directives.length})</summary>
          <DirectiveList directives={directives} onSave={onSave} />
        </details>
      ) : null}
    </article>
  );
}

/**
 * One thing an agent is waiting on. Approve in one click, or reply with a note
 * (edits, conditions, a no). The answer goes to the agent as a directive.
 */
function WaitingItem({
  agentId,
  item,
  answer,
  canEdit,
  onSave,
}: {
  agentId: string;
  item: string;
  answer: Directive | undefined;
  canEdit: boolean;
  onSave: (directive: Directive) => Promise<void>;
}) {
  const [mode, setMode] = useState<"idle" | "reply">("idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const send = (kind: "Approved" | "Reply", body = "") => {
    const now = new Date().toISOString();
    setBusy(true);
    void onSave({
      id: answer?.id ?? crypto.randomUUID(),
      agentId,
      text: `Re: ${item}\n${kind === "Approved" ? "Decision: Approved" : `Note: ${body}`}`,
      status: "queued",
      response: null,
      createdAt: answer?.createdAt ?? now,
      updatedAt: now,
    })
      .then(() => {
        setMode("idle");
        setNote("");
      })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  const decided = answer?.text.split("\n").slice(1).join(" ").replace(/^Decision: /, "");
  return (
    <li className={answer ? "wf is-answered" : "wf"}>
      <span className="wf-text">{item}</span>
      {answer && mode === "idle" ? (
        <span className="wf-answer">
          <b>{decided?.startsWith("Approved") ? "✓ Approved" : "✎ Replied"}</b>
          {decided && !decided.startsWith("Approved") ? <em>{decided.replace(/^Note: /, "")}</em> : null}
          {answer.status !== "queued" ? <i>{DIRECTIVE_STATUS_LABEL[answer.status]}</i> : null}
          {canEdit ? <button type="button" className="wf-link" onClick={() => { setNote(decided?.startsWith("Note: ") ? decided.slice(6) : ""); setMode("reply"); }}>Change</button> : null}
        </span>
      ) : null}
      {canEdit && !answer && mode === "idle" ? (
        <span className="wf-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => send("Approved")}>Approve</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => setMode("reply")}>Reply</button>
        </span>
      ) : null}
      {canEdit && mode === "reply" ? (
        <form
          className="wf-reply"
          onSubmit={(event) => {
            event.preventDefault();
            if (note.trim()) send("Reply", note.trim());
          }}
        >
          <textarea
            autoFocus
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (note.trim()) send("Reply", note.trim());
              }
              if (event.key === "Escape") setMode("idle");
            }}
            placeholder="Your answer, edits or conditions"
            aria-label={`Reply about: ${item}`}
          />
          <span className="wf-actions">
            <button type="submit" className="primary" disabled={busy || !note.trim()}>{busy ? "Sending…" : "Send"}</button>
            {answer ? <button type="button" className="ghost" disabled={busy} onClick={() => send("Approved")}>Approve instead</button> : null}
            <button type="button" className="ghost" onClick={() => setMode("idle")}>Cancel</button>
          </span>
        </form>
      ) : null}
    </li>
  );
}

function DirectiveComposer({
  agents,
  onSave,
}: {
  agents: Agent[];
  onSave: (directive: Directive) => Promise<void>;
}) {
  const [agentId, setAgentId] = useState("all");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        const now = new Date().toISOString();
        const directive: Directive = {
          id: crypto.randomUUID(),
          agentId,
          text: text.trim(),
          status: "queued",
          response: null,
          createdAt: now,
          updatedAt: now,
        };
        setBusy(true);
        void onSave(directive)
          .then(() => setText(""))
          .catch(() => undefined)
          .finally(() => setBusy(false));
      }}
    >
      <label>
        To
        <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
          <option value="all">All</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>
      <label className="wide">
        Directive
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={2000}
          required
          rows={3}
        />
      </label>
      <button type="submit" className="primary" disabled={busy}>
        Queue directive
      </button>
    </form>
  );
}

function BroadcastHistory({
  directives,
  onSave,
}: {
  directives: Directive[];
  onSave: (directive: Directive) => Promise<void>;
}) {
  return (
    <section className="group">
      <h3 className="kicker">All agents</h3>
      <DirectiveList directives={directives} onSave={onSave} />
    </section>
  );
}

function DirectiveList({
  directives,
  onSave,
}: {
  directives: Directive[];
  onSave: (directive: Directive) => Promise<void>;
}) {
  const ordered = [...directives].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (ordered.length === 0) return <p className="empty">None yet</p>;
  return (
    <div className="stack">
      {ordered.map((directive) => (
        <DirectiveRow key={directive.id} directive={directive} onSave={onSave} />
      ))}
    </div>
  );
}

function DirectiveRow({
  directive,
  onSave,
}: {
  directive: Directive;
  onSave: (directive: Directive) => Promise<void>;
}) {
  const [status, setStatus] = useState<DirectiveStatus>(directive.status);
  const [response, setResponse] = useState(directive.response ?? "");

  return (
    <article className="directive">
      <p>{directive.text}</p>
      <p className="meta">
        {DIRECTIVE_STATUS_LABEL[directive.status]} · {formatStamp(directive.createdAt)}
      </p>
      {directive.response ? <p className="response">{directive.response}</p> : null}
      <div className="row">
        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as DirectiveStatus)}
          >
            {DIRECTIVE_STATUSES.map((item) => (
              <option key={item} value={item}>
                {DIRECTIVE_STATUS_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Response
          <input
            value={response}
            onChange={(event) => setResponse(event.target.value)}
            maxLength={2000}
          />
        </label>
        <button
          type="button"
          className="ghost"
          onClick={() =>
            void onSave({
              ...directive,
              status,
              response: response.trim() || null,
              updatedAt: new Date().toISOString(),
            }).catch(() => undefined)
          }
        >
          Update
        </button>
      </div>
    </article>
  );
}
