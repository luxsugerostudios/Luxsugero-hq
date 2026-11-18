import assert from "node:assert/strict";
import test from "node:test";
import { buildHqNotes } from "./observations.ts";
import type { Person, PipelineBoard, Task } from "./types.ts";

function task(partial: Partial<Task> & Pick<Task, "id" | "ownerId" | "givenDate" | "status">): Task {
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
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...partial,
  };
}

const people: Person[] = [{ id: "debo", name: "Debo", role: "", order: 1 }];

function board(id: "skybox" | "fnh", stages: { name: string; count: number }[]): PipelineBoard {
  return {
    id,
    brand: id,
    source: "kraya",
    account: "",
    stages,
    total: stages.reduce((sum, row) => sum + row.count, 0),
    syncedAt: "2026-11-18T00:00:00.000Z",
  };
}

test("named insights use real counts and the public copy drops names", () => {
  const tasks = [1, 2, 3].map((n) =>
    task({ id: `t${n}`, ownerId: "debo", givenDate: "2026-11-01", status: "open" }),
  );
  const named = buildHqNotes({ tasks, people, pipelines: [], today: "2026-11-18", names: true });
  assert.equal(named.observations.includes("Debo has 3 tasks open more than 7 days."), true);
  const pub = buildHqNotes({ tasks, people, pipelines: [], today: "2026-11-18", names: false });
  assert.equal(pub.observations.includes("3 tasks have been open more than 7 days."), true);
  assert.equal(pub.observations.join(" ").includes("Debo"), false);
});

test("Kraya sentences only appear when those stages are in the data", () => {
  const notes = buildHqNotes({
    tasks: [],
    people,
    pipelines: [
      board("skybox", [{ name: "Quote Sent", count: 40 }, { name: "Deposit 50%", count: 0 }]),
      board("fnh", [{ name: "Qualified", count: 28 }, { name: "Site visit", count: 0 }]),
    ],
    today: "2026-11-18",
    names: true,
  });
  assert.equal(notes.observations.includes("Skybox: 40 quotes sent, 0 deposits."), true);
  assert.equal(notes.recommendations.includes("Skybox: follow up the quotes already sent."), true);
  assert.equal(notes.observations.includes("F&H: 28 Qualified, 0 site visits scheduled."), true);
  const missing = buildHqNotes({
    tasks: [],
    people,
    pipelines: [board("skybox", [{ name: "Quote Sent", count: 40 }])],
    today: "2026-11-18",
    names: false,
  });
  assert.equal(missing.observations.some((line) => line.includes("deposits")), false);
});
