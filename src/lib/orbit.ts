import type { Agent, BrandId, Directive, Task } from "./types.ts";

/** Owners that are buckets, not people. They never receive auto-balanced work. */
export const BUCKET_IDS = new Set(["unassigned", "everyone"]);

export const BRAND_COLOR: Record<BrandId, string> = {
  skybox: "#3de8ff",
  stays: "#ffb13b",
  fh: "#9b7bff",
  braj: "#ff4fa3",
};

export type LoadLevel = "room" | "steady" | "busy" | "overloaded";

export function loadLevel(count: number): LoadLevel {
  if (count === 0) return "room";
  if (count <= 2) return "steady";
  if (count <= 4) return "busy";
  return "overloaded";
}

export const LOAD_LABEL: Record<LoadLevel, string> = {
  room: "Has room",
  steady: "Steady",
  busy: "Busy",
  overloaded: "Overloaded",
};

export type AgentState = "working" | "waiting" | "queued" | "idle" | "sync";

export const AGENT_STATE_LABEL: Record<AgentState, string> = {
  working: "Working",
  waiting: "Waiting on you",
  queued: "Directive queued",
  idle: "Idle",
  sync: "Awaiting first sync",
};

/** Derive an agent's state only from what HQ actually stores. */
export function agentState(agent: Agent, directives: Directive[]): AgentState {
  if (agent.waitingOnFounder.length > 0) return "waiting";
  const mine = directives.filter((item) => item.agentId === agent.id || item.agentId === "all");
  if (mine.some((item) => item.status === "picked_up")) return "working";
  if (mine.some((item) => item.status === "queued")) return "queued";
  if (agent.focus.trim().toLowerCase() === "awaiting first sync") return "sync";
  return "idle";
}

/** Who each agent reports to. Brand PMs and department heads report to HQ. */
export const REPORTS_TO: Record<string, string> = {
  "hq-main": "Founder",
  "pm-skybox": "hq-main",
  "pm-stays": "hq-main",
  "pm-fh": "Founder (on ask)",
  "pm-braj": "hq-main",
  "dept-sales-head": "hq-main",
  "dept-inbound": "dept-sales-head",
  "dept-outbound": "dept-sales-head",
  "dept-marketing": "hq-main",
  "dept-content": "dept-marketing",
  "dept-copy": "dept-content",
  "dept-ota": "pm-stays",
  "dept-collab": "dept-marketing",
  "dept-rd": "hq-main",
  "dept-architect": "dept-rd",
  "dept-legal": "hq-main",
  "dept-hr": "hq-main",
  "dept-advisor": "Founder",
};

export function brandOfAgent(agentId: string): BrandId | null {
  const match = /^pm-(skybox|stays|fh|braj)$/.exec(agentId);
  return match ? (match[1] as BrandId) : null;
}

export type Assignment = { taskId: string; personId: string };

/**
 * Hand each unowned task to whoever has the fewest open tasks at that moment.
 * Ties go to the earlier name in the roster order given.
 */
export function planBalance(
  unowned: Pick<Task, "id">[],
  load: { personId: string; count: number }[],
): Assignment[] {
  const pool = load
    .filter((row) => !BUCKET_IDS.has(row.personId))
    .map((row, index) => ({ ...row, index }));
  if (pool.length === 0) return [];
  return unowned.map((task) => {
    pool.sort((a, b) => a.count - b.count || a.index - b.index);
    pool[0].count += 1;
    return { taskId: task.id, personId: pool[0].personId };
  });
}
