import { useHqContext } from "../../lib/hq";
import { orgSeat } from "../../lib/orbit";

export type OwnerGroup = { label: string; options: { id: string; label: string }[] };

/** People first (with Everyone), then Brand PMs, then other agents. */
export function useOwnerGroups(): OwnerGroup[] {
  const { data } = useHqContext();
  return [
    {
      label: "People",
      options: [...data.people]
        .filter((person) => person.id !== "unassigned")
        .sort((a, b) => (a.id === "everyone" ? 1 : 0) - (b.id === "everyone" ? 1 : 0) || a.order - b.order)
        .map((person) => ({ id: person.id, label: orgSeat(person.id)?.name ?? person.name })),
    },
    {
      label: "Brand PMs",
      options: data.agents.filter((agent) => agent.group === "Brand PM").map((agent) => ({ id: agent.id, label: agent.name })),
    },
    {
      label: "Agents",
      options: data.agents.filter((agent) => agent.group !== "Brand PM").map((agent) => ({ id: agent.id, label: agent.name })),
    },
  ].filter((group) => group.options.length > 0);
}

export function ownerLabel(id: string, groups: OwnerGroup[]): string {
  if (id === "unassigned") return "No owner";
  for (const group of groups) {
    const hit = group.options.find((option) => option.id === id);
    if (hit) return hit.label;
  }
  return id;
}

/** One dropdown for picking a task owner. `allowNone` adds a "No owner" choice. */
export function OwnerSelect({
  value,
  onChange,
  label = "Owner",
  allowNone = false,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  allowNone?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const groups = useOwnerGroups();
  const known = value === "unassigned" || groups.some((group) => group.options.some((option) => option.id === value));
  return (
    <select
      aria-label={label}
      className={className}
      value={known ? value : ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {allowNone || value === "unassigned" ? <option value="unassigned">No owner</option> : null}
      {!known ? <option value="" disabled>Pick an owner</option> : null}
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
