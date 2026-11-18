import { closedThisWeek, isOverdue, kolkataDay } from "./dates.ts";
import { ORG, agentState, firstName, orgSeat, REPORTS_TO, type AgentState } from "./orbit.ts";
import { buildHqNotes } from "./observations.ts";
import { KRAYA_BRANDS, KRAYA_LABEL } from "./pipeline.ts";
import { visibleTasks } from "./tasks.ts";
import type { Agent, Brand, Person, PipelineBoard, Task } from "./types.ts";

const EMAIL = /@/;
const MONEY = /[₹$€£]|\b(?:INR|USD|EUR|GBP|Rs\.?)\s?\d|\b\d[\d,]*\s*(?:lakh|crore)\b/i;

export type PublicTaskStatus = "open" | "overdue" | "done";

export type PublicSnapshot = {
  publishedAt: string;
  open: number;
  overdue: number;
  shippedThisWeek: number;
  brands: { name: string; status: string }[];
  crew: { name: string; title: string; open: number }[];
  tasks: { title: string; owner: string; status: PublicTaskStatus }[];
  orbit: {
    agents: { name: string; kind: "hq" | "brand" | "dept"; state: AgentState; reportsTo: string }[];
    crew: { name: string; title: string; open: number }[];
    unowned: number;
  };
  pipeline: { brand: string; total: number; syncedAt: string; stages: { name: string; count: number }[] }[];
  insights: { observations: string[]; recommendations: string[] };
};

function safeText(value: string, max = 180): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > max || EMAIL.test(trimmed) || MONEY.test(trimmed)) return "";
  return trimmed;
}

function ownerLabel(ownerId: string, people: Person[]): string {
  if (ownerId === "unassigned") return "No owner";
  if (ownerId === "everyone") return "Everyone";
  const seat = orgSeat(ownerId);
  if (seat) return firstName(seat.name);
  return firstName(people.find((item) => item.id === ownerId)?.name ?? "");
}

function taskStatus(task: Task, today: string): PublicTaskStatus {
  if (task.status === "done") return "done";
  return isOverdue(task.status, task.givenDate, today, task.flagAfterDays, task.longTerm) ? "overdue" : "open";
}

export function buildPublicSnapshot(input: {
  people: Person[];
  tasks: Task[];
  agents: Agent[];
  brands: Brand[];
  pipelines: PipelineBoard[];
  today?: string;
  publishedAt?: string;
}): PublicSnapshot {
  const today = input.today ?? kolkataDay();
  const tasks = visibleTasks(input.tasks);
  const openTasks = tasks.filter((task) => task.status === "open");
  const known = new Set(input.people.map((person) => person.id));
  const shown = tasks.filter(
    (task) => task.status === "open" || closedThisWeek(task.status, task.closedAt, today),
  );
  const publicTasks = shown.flatMap((task) => {
    const title = safeText(task.title);
    const owner = ownerLabel(task.ownerId, input.people);
    if (!title || !owner) return [];
    return [{ title, owner, status: taskStatus(task, today) }];
  });

  const openByOwner = new Map<string, number>();
  for (const task of openTasks) {
    openByOwner.set(task.ownerId, (openByOwner.get(task.ownerId) ?? 0) + 1);
  }
  const fromRoster = input.people
    .filter((person) => person.id !== "unassigned")
    .map((person) => ({
      name: firstName(orgSeat(person.id)?.name ?? person.name),
      title: orgSeat(person.id)?.title ?? "",
      open: openByOwner.get(person.id) ?? 0,
    }));
  const extras = ORG.filter((seat) => !known.has(seat.id)).map((seat) => ({
    name: firstName(seat.name),
    title: seat.title,
    open: openByOwner.get(seat.id) ?? 0,
  }));
  const crew = [...extras, ...fromRoster].filter((row) => row.name);

  const agents = [...input.agents]
    .sort((a, b) => a.order - b.order)
    .flatMap((agent) => {
      const name = safeText(agent.name, 80);
      if (!name) return [];
      const parent = REPORTS_TO[agent.id];
      const parentAgent = parent ? input.agents.find((item) => item.id === parent) : undefined;
      const kind = agent.group === "HQ" ? "hq" : agent.group === "Brand PM" ? "brand" : "dept";
      const reportsTo = parentAgent ? safeText(parentAgent.name, 80) : parent && !parent.includes("@") ? parent : "";
      return [{ name, kind: kind as "hq" | "brand" | "dept", state: agentState(agent, []), reportsTo }];
    });

  const brands = [...input.brands]
    .sort((a, b) => a.order - b.order)
    .flatMap((brand) => {
      const name = safeText(brand.name, 80);
      return name ? [{ name, status: brand.status }] : [];
    });

  return {
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    open: openTasks.length,
    overdue: openTasks.filter((task) => taskStatus(task, today) === "overdue").length,
    shippedThisWeek: tasks.filter((task) => closedThisWeek(task.status, task.closedAt, today)).length,
    brands,
    crew,
    tasks: publicTasks,
    orbit: {
      agents,
      crew,
      unowned: openTasks.filter((task) => task.ownerId === "unassigned" || !known.has(task.ownerId)).length,
    },
    pipeline: KRAYA_BRANDS.map((brand) => {
      const board = input.pipelines.find((item) => item.id === brand);
      return {
        brand: KRAYA_LABEL[brand],
        total: board?.total ?? 0,
        syncedAt: board?.syncedAt ?? "",
        stages: board?.stages ?? [],
      };
    }),
    insights: buildHqNotes({
      tasks,
      people: input.people,
      pipelines: input.pipelines,
      today,
      names: false,
    }),
  };
}

export function snapshotContentKey(snapshot: PublicSnapshot): string {
  const { publishedAt: _stamp, ...rest } = snapshot;
  return JSON.stringify(rest);
}
