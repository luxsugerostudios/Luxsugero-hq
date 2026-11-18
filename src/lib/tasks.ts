import type { Task } from "./types";

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export type ShownTask = {
  task: Task;
  duplicateIds: string[];
};

/** Collapse open tasks that share an owner and a title, so one request is not counted twice. */
export function collapseOpenTasks(tasks: Task[]): ShownTask[] {
  const done: ShownTask[] = [];
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.status !== "open") {
      done.push({ task, duplicateIds: [] });
      continue;
    }
    const key = `${task.ownerId}::${normalizeTitle(task.title)}`;
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  }
  const open: ShownTask[] = [];
  for (const list of groups.values()) {
    const ranked = [...list].sort((a, b) => {
      if (Boolean(a.inboxId) !== Boolean(b.inboxId)) return a.inboxId ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
    const [kept, ...rest] = ranked;
    open.push({ task: kept, duplicateIds: rest.map((item) => item.id) });
  }
  return [...done, ...open];
}

export function visibleTasks(tasks: Task[]): Task[] {
  return collapseOpenTasks(tasks).map((item) => item.task);
}

export type BoardLane = "todo" | "doing" | "waiting" | "done";

export function taskLane(task: Pick<Task, "status" | "lane">): BoardLane {
  if (task.status === "done") return "done";
  if (task.lane === "doing" || task.lane === "waiting") return task.lane;
  return "todo";
}
