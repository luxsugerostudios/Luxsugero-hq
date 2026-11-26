import assert from "node:assert/strict";
import test from "node:test";
import { mapPipeline } from "./pipeline.ts";
import { buildPublicSnapshot } from "./publicSnapshot.ts";
import type { Agent, Brand, Person, Task } from "./types.ts";

function task(partial: Partial<Task> & Pick<Task, "id" | "title" | "ownerId" | "status">): Task {
  return {
    givenDate: "2026-11-16",
    dueDate: null,
    closedAt: null,
    lane: null,
    longTerm: false,
    flagAfterDays: null,
    note: "secret note",
    brand: null,
    inboxId: "inbox-1",
    createdAt: "2026-11-16T09:00:00.000Z",
    updatedAt: "2026-11-16T09:00:00.000Z",
    ...partial,
  };
}

const people: Person[] = [
  { id: "hari-om", name: "Hari Om", role: "old", order: 1 },
  { id: "debo", name: "Debo", role: "", order: 2 },
];

const agents: Agent[] = [
  {
    id: "hq-main",
    name: "HQ",
    group: "HQ",
    focus: "Run the studio",
    waitingOnFounder: [],
    updatedAt: "2026-11-16T09:00:00.000Z",
    order: 1,
  },
];

const brands: Brand[] = [
  {
    id: "skybox",
    name: "Luxskybox",
    short: "Skybox",
    status: "active",
    summary: "homes",
    url: null,
    headlines: [{ label: "Build cost", value: "₹50L" }],
    waitingOnFounder: [],
    order: 1,
  },
];

test("the public snapshot keeps first names and drops notes, money, and emails", () => {
  const snapshot = buildPublicSnapshot({
    people,
    tasks: [
      task({ id: "1", title: "Layout the deck", ownerId: "hari-om", status: "open" }),
      task({ id: "2", title: "Mail founder@example.com", ownerId: "debo", status: "open" }),
      task({ id: "3", title: "Quote ₹50000", ownerId: "debo", status: "open" }),
    ],
    agents,
    brands,
    pipelines: [
      {
        id: "skybox",
        brand: "skybox",
        source: "kraya",
        account: "Skyboxbylux",
        stages: [{ name: "New Lead", count: 4 }, { name: "Won", count: 1 }],
        total: 5,
        syncedAt: "2026-11-18T04:00:00.000Z",
      },
    ],
    today: "2026-11-18",
    publishedAt: "2026-11-18T04:00:00.000Z",
  });
  const body = JSON.stringify(snapshot);
  assert.equal(body.includes("secret"), false);
  assert.equal(body.includes("inbox"), false);
  assert.equal(body.includes("@"), false);
  assert.equal(body.includes("₹"), false);
  assert.equal(body.includes("hari-om"), false);
  assert.equal(body.includes("Skyboxbylux"), false);
  assert.equal(snapshot.tasks.some((row) => row.title === "Layout the deck" && row.owner === "Hari"), true);
  assert.equal(snapshot.crew.find((row) => row.name === "Hari")?.title, "Operations & Automation Head · Project Head");
  assert.equal(snapshot.crew.some((row) => row.name === "Abhay" && row.title === "Director & Founder"), true);
  assert.deepEqual(snapshot.pipeline[0].stages, [{ name: "New Lead", count: 4 }, { name: "Won", count: 1 }]);
  assert.equal(snapshot.pipeline[1].stages.length, 0);
  assert.equal(snapshot.brands[0].status, "active");
  assert.equal(JSON.stringify(snapshot.brands).includes("Build cost"), false);
});

test("Kraya board keeps stage order and drops a non-kraya doc", () => {
  assert.equal(mapPipeline("skybox", { source: "sheet", stages: [] }), null);
  assert.equal(mapPipeline("stays", { source: "kraya", stages: [] }), null);
  const board = mapPipeline("fnh", {
    source: "kraya",
    brand: "fnh",
    account: "Forest",
    total: 3,
    syncedAt: { seconds: 1763443200 },
    stages: [
      { name: "New Lead", count: 2 },
      { name: "bad@mail", count: 1 },
      { name: "Won", count: 1 },
    ],
    name: "Hidden Person",
  });
  assert.equal(board?.stages.map((row) => row.name).join("|"), "New Lead|Won");
  assert.equal(board?.brand, "fnh");
  assert.equal(JSON.stringify(board).includes("@"), false);
  assert.equal(JSON.stringify(board).includes("Hidden"), false);
});
