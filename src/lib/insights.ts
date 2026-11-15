import { addDays, diffDays, isOverdue, stampToKolkataDay, weekBounds } from "./dates.ts";
import type { Agent, Brand, Lead, Person, Stage, Task } from "./types.ts";
import { STAGES } from "./types.ts";

export type DayCount = { day: string; count: number };
export type PersonCount = { personId: string; count: number };

export type Insights = {
  overdueByPerson: PersonCount[];
  averageDaysToClose: number | null;
  closedThisWeek: number;
  closedLastWeek: number;
  openCount: number;
  completionThisWeek: number | null;
  completionLastWeek: number | null;
  oldestOpen: Task | null;
  peopleWithoutTaskToday: string[];
  rosterMissing: boolean;
  unowned: Task[];
  stale: Task[];
  workload: PersonCount[];
  donePerDay: DayCount[];
  skybox: { stage: Stage; count: number; conversion: number | null }[] | null;
  skyboxLost: number;
  agentsWaiting: Agent[];
  brandsHeld: Brand[];
};

function closedOn(task: Task): string {
  if (task.status !== "done" || !task.closedAt) return "";
  return stampToKolkataDay(task.closedAt);
}

function updatedOn(task: Task): string {
  if (task.updatedAt) {
    const day = stampToKolkataDay(task.updatedAt);
    if (day) return day;
  }
  return task.givenDate;
}

export function buildInsights(
  tasks: Task[],
  people: Person[],
  leads: Lead[],
  agents: Agent[],
  brands: Brand[],
  today: string,
): Insights {
  const open = tasks.filter((task) => task.status === "open");
  const overdue = open.filter((task) =>
    isOverdue(task.status, task.givenDate, today, task.flagAfterDays),
  );
  const overdueByPerson = new Map<string, number>();
  for (const task of overdue) {
    overdueByPerson.set(task.ownerId, (overdueByPerson.get(task.ownerId) ?? 0) + 1);
  }

  const closeDays = tasks
    .filter((task) => task.status === "done" && task.closedAt)
    .map((task) => diffDays(task.givenDate, closedOn(task)))
    .filter((days) => days >= 0);
  const averageDaysToClose =
    closeDays.length === 0
      ? null
      : Math.round((closeDays.reduce((sum, days) => sum + days, 0) / closeDays.length) * 10) / 10;

  const week = weekBounds(today);
  const lastStart = addDays(week.start, -7);
  const closedThisWeek = tasks.filter((task) => {
    const day = closedOn(task);
    return day >= week.start && day <= week.end;
  }).length;
  const closedLastWeek = tasks.filter((task) => {
    const day = closedOn(task);
    return day >= lastStart && day < week.start;
  }).length;
  const openCount = open.length;
  const completionThisWeek =
    closedThisWeek + openCount === 0 ? null : closedThisWeek / (closedThisWeek + openCount);
  const completionLastWeek =
    closedLastWeek + closedThisWeek + openCount === 0
      ? null
      : closedLastWeek / (closedLastWeek + closedThisWeek + openCount);

  const oldestOpen = open.reduce<Task | null>((oldest, task) => {
    if (!oldest || task.givenDate < oldest.givenDate) return task;
    return oldest;
  }, null);

  const givenToday = new Set(
    tasks.filter((task) => task.givenDate === today).map((task) => task.ownerId),
  );
  const peopleWithoutTaskToday = people
    .filter((person) => !givenToday.has(person.id))
    .map((person) => person.id);

  const known = new Set(people.map((person) => person.id));
  const unowned = tasks.filter(
    (task) => task.status === "open" && (task.ownerId === "unassigned" || !known.has(task.ownerId)),
  );
  const stale = open.filter((task) => diffDays(updatedOn(task), today) >= 3);
  const workload = people.map((person) => ({
    personId: person.id,
    count: open.filter((task) => task.ownerId === person.id).length,
  }));

  const donePerDay = Array.from({ length: 14 }, (_, index) => {
    const day = addDays(today, index - 13);
    return {
      day,
      count: tasks.filter((task) => closedOn(task) === day).length,
    };
  });

  const skyboxLeads = leads.filter((lead) => lead.brand === "skybox");
  const skyboxLost = skyboxLeads.filter((lead) => lead.stage === "lost").length;
  const activeStages = STAGES.filter((stage) => stage !== "lost");
  const skybox =
    skyboxLeads.length === 0
      ? null
      : activeStages.map((stage, index) => {
          const fromHere = activeStages.slice(index);
          const reached = skyboxLeads.filter((lead) =>
            fromHere.some((item) => item === lead.stage),
          ).length;
          const previous =
            index === 0
              ? skyboxLeads.length - skyboxLost
              : skyboxLeads.filter((lead) =>
                  activeStages.slice(index - 1).some((item) => item === lead.stage),
                ).length;
          return {
            stage,
            count: skyboxLeads.filter((lead) => lead.stage === stage).length,
            conversion: index === 0 || previous === 0 ? null : reached / previous,
          };
        });

  return {
    overdueByPerson: [...overdueByPerson.entries()]
      .map(([personId, count]) => ({ personId, count }))
      .sort((a, b) => b.count - a.count),
    averageDaysToClose,
    closedThisWeek,
    closedLastWeek,
    openCount,
    completionThisWeek,
    completionLastWeek,
    oldestOpen,
    peopleWithoutTaskToday,
    rosterMissing: people.length === 0,
    unowned,
    stale,
    workload,
    donePerDay,
    skybox,
    skyboxLost,
    agentsWaiting: agents.filter((agent) => agent.waitingOnFounder.length > 0),
    brandsHeld: brands.filter(
      (brand) => brand.status === "paused" || brand.status === "founder-led",
    ),
  };
}
