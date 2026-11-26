import type { BrandId, Task } from "./types.ts";

export type Department = "leadership" | "operations" | "marketing" | "content" | "skybox-ops" | "sales" | "logistics";
export type Level = "director" | "head" | "lead" | "member" | "trainee";

export type Profile = {
  id: string;
  role: string;
  departments: Department[];
  level: Level;
  /** Brands this person covers. Empty means any brand. */
  brands: BrandId[];
  /** Words in a task title that point to this person's work. */
  skills: string[];
  /** Names people use for this person. A title like "... (Madhav)" goes to them. */
  names: string[];
  /** Only receives tasks that match a skill (no general overflow). */
  matchOnly?: boolean;
};

export const DEPARTMENT_LABEL: Record<Department, string> = {
  leadership: "Leadership",
  operations: "Operations & automation",
  marketing: "Marketing",
  content: "Content",
  "skybox-ops": "Skybox layouts & sourcing",
  sales: "Sales",
  logistics: "International logistics",
};

/**
 * Who does what, from the founder's brief (26 Nov 2026). Auto-balance reads
 * this to route unowned tasks. Update it as people join or roles change.
 */
export const TEAM: Profile[] = [
  {
    id: "abhay",
    names: ["abhay"],
    role: "Director & founder: approvals, finance, major decisions",
    departments: ["leadership"],
    level: "director",
    brands: [],
    skills: ["approve", "approval", "sign off", "signoff", "finance", "financial", "budget", "investment", "funding", "payment", "pricing decision", "contract", "major decision"],
    matchOnly: true,
  },
  {
    id: "hari-om",
    names: ["hari om", "hariom", "hari"],
    role: "Operations & automation head, project head for all PMs, system designer",
    departments: ["operations"],
    level: "head",
    brands: [],
    skills: ["automation", "automate", "system", "dashboard", "hq", "structure", "process", "workflow", "operations", "ops", "sop", "tool", "setup", "set up", "tracker", "sheet", "excel", "crm", "quotation", "quote", "google business", "hire", "hiring", "recruit", "onboard", "pm", "project", "coordinate", "handoff", "subscription", "integration", "agent"],
  },
  {
    id: "shrishti",
    names: ["shrishti", "shristi", "shrishtiii"],
    role: "Marketing head: strategy, creative ideas, scheduling, coordination",
    departments: ["marketing"],
    level: "head",
    brands: [],
    skills: ["marketing", "strategy", "campaign", "ads", "ad ", "meta", "instagram", "facebook", "whatsapp", "linkedin", "social", "post", "schedule", "calendar", "creative", "brief", "brand", "promotion", "engagement", "influencer", "seo", "faq", "catalogue", "template", "copy"],
  },
  {
    id: "mayank",
    names: ["mayank"],
    role: "Marketing intern under Shrishti",
    departments: ["marketing"],
    level: "trainee",
    brands: [],
    skills: ["post", "schedule", "research", "collect", "follow up", "follow-up", "upload", "caption", "hashtag", "competitor", "data entry"],
  },
  {
    id: "debo",
    names: ["debo", "devo", "madhav"],
    role: "Content head: content creation and editing",
    departments: ["content"],
    level: "head",
    brands: [],
    skills: ["content", "video", "edit", "editing", "reel", "shoot", "photo", "photograph", "image", "render", "blender", "3d", "4k", "fps", "thumbnail", "youtube", "script", "voiceover", "ai video", "image-to-video", "grok"],
  },
  {
    id: "intikhab",
    names: ["intikhab", "inteqab"],
    role: "Skybox layouts, sourcing and invoicing",
    departments: ["skybox-ops"],
    level: "lead",
    brands: ["skybox"],
    skills: ["layout", "sourcing", "source", "vendor", "supplier", "invoice", "invoicing", "billing", "architect", "drawing", "cad", "floor plan", "factory", "material", "sample", "inventory", "measurement"],
  },
  {
    id: "siddhant",
    names: ["siddhant", "sidhant"],
    role: "Sales trainee handling Skybox enquiries",
    departments: ["sales"],
    level: "trainee",
    brands: ["skybox"],
    skills: ["enquiry", "enquiries", "inquiry", "lead", "leads", "call", "follow up", "follow-up", "client", "customer", "site visit", "sales", "whatsapp reply", "reply"],
  },
  {
    id: "gaurav",
    names: ["gaurav"],
    role: "International logistics head, F&H sales",
    departments: ["logistics", "sales"],
    level: "head",
    brands: ["fh", "skybox"],
    skills: ["logistics", "shipping", "shipment", "import", "export", "international", "foreign", "overseas", "freight", "customs", "container", "costing", "woodman", "transport", "packaging", "sales", "client", "deal"],
  },
  {
    id: "megha",
    names: ["megha"],
    role: "F&H sales",
    departments: ["sales"],
    level: "member",
    brands: ["fh"],
    skills: ["sales", "lead", "leads", "client", "customer", "call", "follow up", "follow-up", "site visit", "enquiry", "inquiry", "crm", "deal", "booking"],
  },
];

/** Words that make a task "senior" work a trainee should not get on their own. */
const SENIOR_WORDS = ["strategy", "plan ", "approve", "approval", "hire", "hiring", "budget", "decide", "decision", "negotiate", "contract", "lead the", "head"];

/** Rough capacity before someone counts as full, by level. */
const CAPACITY: Record<Level, number> = { director: 2, head: 6, lead: 6, member: 6, trainee: 4 };

export type SmartAssignment = { taskId: string; personId: string; reason: string };

function hits(text: string, words: string[]): string[] {
  return words.filter((word) => text.includes(word));
}

/**
 * Route each unowned task to the right person, using department skills
 * first, then brand coverage and level, then the lightest load. Tasks that
 * match nobody go to the operations head (who runs the PMs) unless that
 * person is full, then to whoever has the most room.
 */
export function planSmartBalance(
  unowned: Pick<Task, "id" | "title" | "brand" | "note">[],
  openCounts: Record<string, number>,
  team: Profile[] = TEAM,
  rosterIds?: Set<string>,
): SmartAssignment[] {
  const people = team.filter((profile) => !rosterIds || rosterIds.has(profile.id));
  if (people.length === 0) return [];
  const load: Record<string, number> = {};
  for (const profile of people) load[profile.id] = openCounts[profile.id] ?? 0;

  return unowned.map((task) => {
    const text = ` ${task.title} ${task.note ?? ""} `.toLowerCase().replace(/\s+/g, " ");
    const senior = hits(text, SENIOR_WORDS).length > 0;

    // "Install Blender (Madhav)" or "Debo: edit reel" names the owner outright.
    const title = task.title.toLowerCase();
    const tagged = [...title.matchAll(/\(([^)]{2,40})\)/g)].map((match) => match[1].trim());
    const prefix = /^([a-z][a-z ]{1,20}):/.exec(title)?.[1].trim();
    const named = people.find((profile) =>
      profile.names.some((alias) => tagged.includes(alias) || prefix === alias),
    );
    if (named) {
      load[named.id] = (load[named.id] ?? 0) + 1;
      return { taskId: task.id, personId: named.id, reason: `Named in the task` };
    }
    const scored = people
      .map((profile) => {
        const matched = hits(text, profile.skills);
        let score = matched.length * 3;
        if (task.brand && profile.brands.includes(task.brand)) score += 2;
        if (task.brand && profile.brands.length > 0 && !profile.brands.includes(task.brand)) score -= 2;
        if (profile.level === "trainee" && senior) score -= 4;
        if (profile.level === "director" && !matched.length) score = -99;
        if (profile.matchOnly && !matched.length) score = -99;
        const full = load[profile.id] >= CAPACITY[profile.level];
        return { profile, matched, score, full };
      })
      .filter((row) => row.score > 0)
      .sort(
        (a, b) =>
          Number(a.full) - Number(b.full) ||
          b.score - a.score ||
          load[a.profile.id] - load[b.profile.id],
      );

    let pick = scored[0];
    // Within one department, hand routine work to whoever has more room:
    // an intern under the head takes execution tasks when lighter.
    if (pick && !senior) {
      const sameDept = scored.filter(
        (row) => row !== pick && !row.full && row.profile.departments.some((dept) => pick.profile.departments.includes(dept)) && row.score >= pick.score - 3,
      );
      const lighter = sameDept.find((row) => load[row.profile.id] + 1 < load[pick.profile.id]);
      if (lighter) pick = lighter;
    }

    let personId: string;
    let reason: string;
    if (pick) {
      personId = pick.profile.id;
      const why = pick.matched.slice(0, 2).map((word) => word.trim()).join(", ");
      reason = `${DEPARTMENT_LABEL[pick.profile.departments[0]]}${why ? `: ${why}` : ""}${task.brand && pick.profile.brands.includes(task.brand) ? ` · ${task.brand}` : ""}`;
    } else {
      const ops = people.find((profile) => profile.id === "hari-om");
      const fallback =
        ops && load[ops.id] < CAPACITY[ops.level]
          ? ops
          : [...people]
              .filter((profile) => !profile.matchOnly && profile.level !== "trainee")
              .sort((a, b) => load[a.id] / CAPACITY[a.level] - load[b.id] / CAPACITY[b.level])[0];
      personId = fallback?.id ?? people[0].id;
      reason = fallback?.id === "hari-om" ? "No clear department: project head to route" : "No clear department: most room";
    }
    load[personId] = (load[personId] ?? 0) + 1;
    return { taskId: task.id, personId, reason };
  });
}
