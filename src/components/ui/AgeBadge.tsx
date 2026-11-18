import { daysOpen, isOverdue } from "../../lib/dates";
import type { Task } from "../../lib/types";

export function AgeBadge({ task, today }: { task: Pick<Task, "status" | "givenDate" | "flagAfterDays" | "longTerm">; today: string }) {
  const late = isOverdue(task.status, task.givenDate, today, task.flagAfterDays, task.longTerm);
  const days = daysOpen(task.givenDate, today);
  const tone = late ? "age-late" : days < 3 ? "age-fresh" : "age-mid";
  const label = late ? "Overdue" : days < 3 ? "Under 3 days" : "3 to 5 days";
  return <span className={`age-badge ${tone}`} title={label}>{days}d</span>;
}
