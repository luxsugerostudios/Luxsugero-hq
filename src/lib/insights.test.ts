import assert from "node:assert/strict";
import test from "node:test";
import { buildInsights } from "./insights.ts";
import type { Agent, Brand, Lead, Person, Task } from "./types.ts";

function task(partial: Partial<Task> & Pick<Task, "id" | "ownerId" | "status" | "givenDate">): Task {
  return {
    title: partial.id,
    dueDate: null,
    closedAt: null,
    lane: null,
    longTerm: false,
    flagAfterDays: null,
    note: "",
    brand: null,
    inboxId: null,
    createdAt: "2026-11-10T04:30:00.000Z",
    updatedAt: "2026-11-10T04:30:00.000Z",
    ...partial,
  };
}

const people: Person[] = [
  { id: "hari-om", name: "Hari Om", role: "", order: 1 },
  { id: "debo", name: "Debo", role: "", order: 2 },
];

test("insights use only the records they are given", () => {
  const tasks = [
    task({ id: "old", ownerId: "hari-om", status: "open", givenDate: "2026-11-01" }),
    task({
      id: "fresh",
      ownerId: "debo",
      status: "open",
      givenDate: "2026-11-16",
      updatedAt: "2026-11-16T04:30:00.000Z",
    }),
    task({
      id: "done",
      ownerId: "hari-om",
      status: "done",
      givenDate: "2026-11-10",
      closedAt: "2026-11-12T04:30:00.000Z",
    }),
    task({ id: "loose", ownerId: "unassigned", status: "open", givenDate: "2026-11-10" }),
  ];
  const leads: Lead[] = [
    {
      code: "SKY-PT-01",
      brand: "skybox",
      stage: "contacted",
      temperature: "warm",
      country: "PT",
      lastContactAt: "2026-11-12",
      createdAt: "",
      updatedAt: "",
    },
    {
      code: "SKY-PT-02",
      brand: "skybox",
      stage: "won",
      temperature: "hot",
      country: "PT",
      lastContactAt: "2026-11-12",
      createdAt: "",
      updatedAt: "",
    },
  ];
  const agents: Agent[] = [
    {
      id: "hq-main",
      name: "HQ Main Manager",
      group: "HQ",
      focus: "Awaiting first sync",
      waitingOnFounder: ["Approve the copy"],
      updatedAt: "",
      order: 1,
    },
  ];
  const brands: Brand[] = [
    {
      id: "fh",
      name: "Forest & Hills",
      short: "F&H",
      status: "founder-led",
      summary: "",
      url: null,
      headlines: [],
      waitingOnFounder: [],
      order: 1,
    },
  ];
  const insights = buildInsights(tasks, people, leads, agents, brands, "2026-11-16");
  assert.equal(insights.overdueByPerson[0]?.personId, "hari-om");
  assert.equal(insights.averageDaysToClose, 2);
  assert.equal(insights.oldestOpen?.id, "old");
  assert.deepEqual(insights.peopleWithoutTaskToday, ["hari-om"]);
  assert.equal(insights.unowned.length, 1);
  assert.equal(insights.stale.some((item) => item.id === "old"), true);
  assert.equal(insights.stale.some((item) => item.id === "fresh"), false);
  assert.equal(insights.donePerDay.reduce((sum, day) => sum + day.count, 0), 1);
  assert.equal(insights.skybox?.find((row) => row.stage === "won")?.count, 1);
  assert.equal(insights.agentsWaiting.length, 1);
  assert.equal(insights.brandsHeld.length, 1);
  assert.equal(buildInsights([], [], [], [], [], "2026-11-16").skybox, null);
  assert.equal(buildInsights([], [], [], [], [], "2026-11-16").averageDaysToClose, null);
});
