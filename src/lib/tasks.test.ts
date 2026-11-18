import assert from "node:assert/strict";
import test from "node:test";
import { collapseOpenTasks } from "./tasks.ts";
import type { Task } from "./types.ts";

function task(partial: Partial<Task> & Pick<Task, "id" | "title" | "ownerId" | "status">): Task {
  return {
    givenDate: "2026-11-16",
    dueDate: null,
    closedAt: null,
    longTerm: false,
    flagAfterDays: null,
    note: "",
    brand: null,
    inboxId: null,
    createdAt: "2026-11-16T09:00:00.000Z",
    updatedAt: "2026-11-16T09:00:00.000Z",
    ...partial,
  };
}

test("open tasks with the same owner and title count once", () => {
  const collapsed = collapseOpenTasks([
    task({
      id: "later",
      title: "debo teach content grok ai  images creation",
      ownerId: "debo",
      status: "open",
      createdAt: "2026-11-16T09:42:57.293Z",
    }),
    task({
      id: "from-inbox",
      title: "Debo teach content grok ai images creation",
      ownerId: "debo",
      status: "open",
      inboxId: "inbox-1",
      createdAt: "2026-11-16T09:41:07.418Z",
    }),
    task({
      id: "done-copy",
      title: "debo teach content grok ai images creation",
      ownerId: "hari-om",
      status: "done",
      closedAt: "2026-11-18T07:39:46.324Z",
    }),
  ]);
  const open = collapsed.filter((item) => item.task.status === "open");
  assert.equal(open.length, 1);
  assert.equal(open[0]?.task.id, "from-inbox");
  assert.deepEqual(open[0]?.duplicateIds, ["later"]);
  assert.equal(collapsed.some((item) => item.task.id === "done-copy"), true);
});
