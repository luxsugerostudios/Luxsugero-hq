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
  const state = agentState(agent, directives);
  return (
    <article className={`agent state-${state}`}>
      <header>
        <h4>{agent.name}</h4>
        <span className="pill">{AGENT_STATE_LABEL[state]}</span>
      </header>
      <p className="focus">{agent.focus}</p>
      {agent.waitingOnFounder.length > 0 ? (
        <>
          <h4>Waiting on founder</h4>
          <ul>
            {agent.waitingOnFounder.map((item) => (
              <li key={item}>{item}</li>
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
