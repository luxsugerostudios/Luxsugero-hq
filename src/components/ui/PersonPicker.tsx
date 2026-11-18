import { useEffect } from "react";
import { kolkataDay } from "../../lib/dates";
import { buildInsights } from "../../lib/insights";
import { useHqContext } from "../../lib/hq";
import { BUCKET_IDS, loadLevel, orgSeat } from "../../lib/orbit";
import { visibleTasks } from "../../lib/tasks";

const TONE: Record<string, string> = {
  room: "var(--cyan)",
  steady: "var(--lime)",
  busy: "var(--orange)",
  overloaded: "var(--pink)",
};

export function PersonPicker({
  value,
  onChange,
  includeEveryone = false,
  listenKeys = false,
}: {
  value: string;
  onChange: (id: string) => void;
  includeEveryone?: boolean;
  listenKeys?: boolean;
}) {
  const { data } = useHqContext();
  const today = kolkataDay();
  const insights = buildInsights(visibleTasks(data.tasks), data.people, data.leads, data.agents, data.brands, today);
  const options = data.people
    .filter((person) => !BUCKET_IDS.has(person.id) || (includeEveryone && person.id === "everyone"))
    .map((person) => ({
      person,
      count: insights.workload.find((row) => row.personId === person.id)?.count ?? 0,
    }))
    .sort((a, b) => a.count - b.count || a.person.order - b.person.order);

  useEffect(() => {
    if (!listenKeys) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const index = Number(event.key) - 1;
      if (index < 0 || index > 8 || !options[index]) return;
      event.preventDefault();
      onChange(options[index].person.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listenKeys, onChange, options]);

  return (
    <div className="tag-grid" role="listbox" aria-label="People">
      {options.map((option, index) => {
        const level = loadLevel(option.count);
        const name = orgSeat(option.person.id)?.name ?? option.person.name;
        return (
          <button
            key={option.person.id}
            type="button"
            className="chip"
            aria-pressed={value === option.person.id}
            style={{ boxShadow: `inset 3px 0 0 ${TONE[level]}` }}
            onClick={() => onChange(option.person.id)}
          >
            {index < 9 ? `${index + 1} ` : ""}{name} {option.count}
          </button>
        );
      })}
    </div>
  );
}
