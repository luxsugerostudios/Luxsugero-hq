import assert from "node:assert/strict";
import { test } from "node:test";
import { agentState, loadLevel, planBalance } from "./orbit.ts";
import type { Agent, Directive } from "./types.ts";

const agent = (patch: Partial<Agent> = {}): Agent => ({
  id: "pm-skybox",
  name: "Luxskybox PM",
  group: "Brand PM",
  focus: "Awaiting first sync",
  waitingOnFounder: [],
  updatedAt: "2026-11-10T04:30:00.000Z",
  order: 1,
  ...patch,
});

const directive = (patch: Partial<Directive>): Directive => ({
  id: "d1",
  agentId: "pm-skybox",
  text: "Follow up",
  status: "queued",
  response: null,
  createdAt: "2026-11-10T04:30:00.000Z",
  updatedAt: "2026-11-10T04:30:00.000Z",
  ...patch,
});

test("balance gives each task to the lightest person and skips buckets", () => {
  const plan = planBalance(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    [
      { personId: "shrishti", count: 8 },
      { personId: "megha", count: 0 },
      { personId: "mayank", count: 1 },
      { personId: "unassigned", count: 0 },
      { personId: "everyone", count: 0 },
    ],
  );
  assert.deepEqual(plan, [
    { taskId: "a", personId: "megha" },
    { taskId: "b", personId: "megha" },
    { taskId: "c", personId: "mayank" },
  ]);
});

test("balance with nobody to give work to returns nothing", () => {
  assert.deepEqual(planBalance([{ id: "a" }], [{ personId: "unassigned", count: 0 }]), []);
});

test("load levels", () => {
  assert.equal(loadLevel(0), "room");
  assert.equal(loadLevel(2), "steady");
  assert.equal(loadLevel(4), "busy");
  assert.equal(loadLevel(8), "overloaded");
});

test("agent state comes from stored fields only", () => {
  assert.equal(agentState(agent(), []), "sync");
  assert.equal(agentState(agent({ focus: "Lead follow-ups" }), []), "idle");
  assert.equal(agentState(agent(), [directive({ status: "queued" })]), "queued");
  assert.equal(agentState(agent(), [directive({ status: "picked_up", agentId: "all" })]), "working");
  assert.equal(agentState(agent({ waitingOnFounder: ["Approve 6 emails"] }), []), "waiting");
  assert.equal(agentState(agent(), [directive({ status: "done" })]), "sync");
});
