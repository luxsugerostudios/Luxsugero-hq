import assert from "node:assert/strict";
import test from "node:test";
import { rotationClock, rotationInterns, rotationReports } from "./rotation.ts";
import { ORG } from "./orbit.ts";
import type { Task } from "./types.ts";

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
    createdAt: "2026-11-18T04:30:00.000Z",
    updatedAt: "2026-11-18T04:30:00.000Z",
    ...partial,
  };
}

test("the org chart matches the founder line", () => {
  const byId = Object.fromEntries(ORG.map((seat) => [seat.id, seat]));
  assert.equal(byId.abhay.title, "Director");
  assert.equal(byId.abhay.reportsTo, null);
  assert.equal(byId["hari-om"].reportsTo, "abhay");
  assert.equal(byId.shrishti.reportsTo, "hari-om");
  assert.equal(byId.debo.title, "Content Head");
  assert.equal(byId.intikhab.reportsTo, "hari-om");
  assert.equal(byId.megha.reportsTo, "hari-om");
  assert.equal(byId.mayank.reportsTo, "shrishti");
  assert.equal(byId.siddhant.reportsTo, "debo");
  assert.deepEqual(rotationInterns().map((seat) => seat.id), ["mayank", "siddhant"]);
});

test("rotation day 45 is 2 Jan 2027 and tasks group by brand", () => {
  assert.equal(rotationClock("2026-11-18").daysLeft, 45);
  assert.equal(rotationClock("2026-11-18").day, 0);
  assert.equal(rotationClock("2027-01-02").daysLeft, 0);
  assert.equal(rotationClock("2027-01-02").day, 45);
  const report = rotationReports(
    [
      task({ id: "a", ownerId: "mayank", status: "done", givenDate: "2026-11-20", brand: "skybox" }),
      task({ id: "b", ownerId: "mayank", status: "done", givenDate: "2026-11-21", brand: "skybox" }),
      task({ id: "c", ownerId: "mayank", status: "open", givenDate: "2026-12-01", brand: "fh" }),
      task({ id: "old", ownerId: "mayank", status: "done", givenDate: "2026-11-10", brand: "skybox" }),
      task({ id: "d", ownerId: "siddhant", status: "open", givenDate: "2026-11-19", brand: "braj" }),
    ],
    "2026-12-01",
  );
  const mayank = report.interns.find((row) => row.id === "mayank");
  assert.ok(mayank);
  assert.equal(mayank.total, 3);
  assert.equal(mayank.done, 2);
  assert.equal(mayank.strongest, "Skybox");
  assert.equal(mayank.brands.find((row) => row.brand === "Skybox")?.done, 2);
  assert.equal(report.interns.find((row) => row.id === "siddhant")?.total, 1);
});
