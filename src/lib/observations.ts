import { diffDays, isOverdue } from "./dates.ts";
import { firstName, orgSeat } from "./orbit.ts";
import { KRAYA_LABEL, type KrayaBrand } from "./pipeline.ts";
import type { Person, PipelineBoard, Task } from "./types.ts";

export type HqNotes = { observations: string[]; recommendations: string[] };

function personLabel(ownerId: string, people: Person[]): string | null {
  if (ownerId === "unassigned") return "No owner";
  if (ownerId === "everyone") return "Everyone";
  const seat = orgSeat(ownerId);
  if (seat) return firstName(seat.name) || null;
  const person = people.find((item) => item.id === ownerId);
  return person ? firstName(person.name) || null : null;
}

function stageCount(board: PipelineBoard, pattern: RegExp): number | null {
  const rows = board.stages.filter((stage) => pattern.test(stage.name));
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + row.count, 0);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Sentences that only restate counts already in HQ. Names are omitted when `names` is false. */
export function buildHqNotes(input: {
  tasks: Task[];
  people: Person[];
  pipelines: PipelineBoard[];
  today: string;
  names: boolean;
}): HqNotes {
  const observations: string[] = [];
  const recommendations: string[] = [];
  const open = input.tasks.filter((task) => task.status === "open");

  const stuck = new Map<string, number>();
  let unnamedStuck = 0;
  for (const task of open) {
    if (diffDays(task.givenDate, input.today) <= 7) continue;
    const label = input.names ? personLabel(task.ownerId, input.people) : null;
    if (!label) {
      unnamedStuck += 1;
      continue;
    }
    stuck.set(label, (stuck.get(label) ?? 0) + 1);
  }
  for (const [label, count] of stuck) {
    observations.push(`${label} has ${plural(count, "task", "tasks")} open more than 7 days.`);
  }
  if (!input.names) unnamedStuck = open.filter((task) => diffDays(task.givenDate, input.today) > 7).length;
  if (unnamedStuck > 0 && !input.names) {
    observations.push(`${plural(unnamedStuck, "task has", "tasks have")} been open more than 7 days.`);
  } else if (unnamedStuck > 0 && input.names) {
    observations.push(`${plural(unnamedStuck, "task has", "tasks have")} been open more than 7 days.`);
  }
  if ([...stuck.values()].reduce((sum, count) => sum + count, 0) + unnamedStuck > 0) {
    recommendations.push("Review tasks that have been open more than 7 days.");
  }

  const overdue = open.filter((task) =>
    isOverdue(task.status, task.givenDate, input.today, task.flagAfterDays, task.longTerm),
  );
  if (input.names) {
    const byPerson = new Map<string, number>();
    let unnamed = 0;
    for (const task of overdue) {
      const label = personLabel(task.ownerId, input.people);
      if (!label) unnamed += 1;
      else byPerson.set(label, (byPerson.get(label) ?? 0) + 1);
    }
    for (const [label, count] of byPerson) {
      observations.push(`${label} has ${plural(count, "overdue task", "overdue tasks")}.`);
    }
    if (unnamed > 0) observations.push(`${plural(unnamed, "task is", "tasks are")} overdue.`);
  } else if (overdue.length > 0) {
    observations.push(`${plural(overdue.length, "task is", "tasks are")} overdue.`);
  }

  for (const board of input.pipelines) {
    const brand = board.id in KRAYA_LABEL ? KRAYA_LABEL[board.id as KrayaBrand] : board.brand;
    const quotes = stageCount(board, /quote/i);
    const deposits = stageCount(board, /deposit/i);
    if (quotes !== null && quotes > 0 && deposits === 0) {
      observations.push(`${brand}: ${quotes} quotes sent, 0 deposits.`);
      recommendations.push(`${brand}: follow up the quotes already sent.`);
    }
    const leads = stageCount(board, /qualified|good lead/i);
    const visits = stageCount(board, /site visit|visit/i);
    if (leads !== null && leads > 0 && visits === 0) {
      const leadName = board.stages.find((stage) => /qualified|good lead/i.test(stage.name))?.name ?? "leads";
      observations.push(`${brand}: ${leads} ${leadName}, 0 site visits scheduled.`);
      recommendations.push(`${brand}: schedule site visits for leads already in the funnel.`);
    }
  }

  const unowned = open.filter((task) => task.ownerId === "unassigned").length;
  if (unowned > 0) {
    observations.push(`${plural(unowned, "open task has", "open tasks have")} no owner.`);
    recommendations.push(`Assign the ${plural(unowned, "task", "tasks")} with no owner.`);
  }

  return { observations, recommendations };
}
