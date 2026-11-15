import seedJson from "../../seed/seed.json";
import {
  AGENT_GROUPS,
  BRAND_IDS,
  BRAND_STATUSES,
  DIRECTIVE_STATUSES,
  STAGES,
  TASK_STATUSES,
  TEMPERATURES,
  type Agent,
  type AgentGroup,
  type Brand,
  type BrandId,
  type BrandStatus,
  type DashboardData,
  type Directive,
  type DirectiveStatus,
  type Headline,
  type InboxItem,
  type InboxStatus,
  type Lead,
  type Person,
  type PrivateLead,
  type Stage,
  type Task,
  type TaskHistory,
  type TaskStatus,
  type Temperature,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function dateOnly(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function stamp(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function mapPerson(id: string, raw: unknown): Person | null {
  if (!isRecord(raw)) return null;
  const name = text(raw.name);
  if (!id || !name) return null;
  return { id, name, role: text(raw.role), order: asNumber(raw.order) };
}

export function mapTask(id: string, raw: unknown): Task | null {
  if (!isRecord(raw)) return null;
  const title = text(raw.title);
  const ownerId = text(raw.ownerId);
  const givenDate = dateOnly(raw.givenDate);
  const status = oneOf<TaskStatus>(raw.status, TASK_STATUSES);
  if (!id || !title || !ownerId || !givenDate || !status) return null;
  return {
    id,
    title,
    ownerId,
    givenDate,
    dueDate: raw.dueDate == null ? null : dateOnly(raw.dueDate),
    status,
    closedAt: raw.closedAt == null ? null : stamp(raw.closedAt),
    longTerm: raw.longTerm === true,
    flagAfterDays: flagAfterDays(raw.flagAfterDays),
    note: text(raw.note),
    brand: oneOf(raw.brand, BRAND_IDS),
    inboxId: text(raw.inboxId) || null,
    createdAt: stamp(raw.createdAt) ?? "",
    updatedAt: stamp(raw.updatedAt) ?? "",
  };
}

function flagAfterDays(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

export function mapAgent(id: string, raw: unknown): Agent | null {
  if (!isRecord(raw)) return null;
  const name = text(raw.name);
  const group = oneOf<AgentGroup>(raw.group, AGENT_GROUPS);
  if (!id || !name || !group) return null;
  return {
    id,
    name,
    group,
    focus: text(raw.focus) || "Awaiting first sync",
    waitingOnFounder: stringList(raw.waitingOnFounder),
    updatedAt: stamp(raw.updatedAt) ?? "",
    order: asNumber(raw.order),
  };
}

function mapHeadlines(value: unknown): Headline[] {
  if (!Array.isArray(value)) return [];
  const headlines: Headline[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const label = text(item.label);
    const headlineValue = text(item.value);
    if (!label || !headlineValue) continue;
    headlines.push({ label, value: headlineValue });
  }
  return headlines;
}

export function mapBrand(id: string, raw: unknown): Brand | null {
  if (!isRecord(raw)) return null;
  const brandId = oneOf<BrandId>(id, BRAND_IDS);
  const status = oneOf<BrandStatus>(raw.status, BRAND_STATUSES);
  const name = text(raw.name);
  if (!brandId || !status || !name) return null;
  const url = text(raw.url);
  return {
    id: brandId,
    name,
    short: text(raw.short) || name,
    status,
    summary: text(raw.summary),
    url: url.startsWith("https://") ? url : null,
    headlines: mapHeadlines(raw.headlines),
    waitingOnFounder: stringList(raw.waitingOnFounder),
    order: asNumber(raw.order),
  };
}

/** Public lead mapper. Identity fields are dropped even if a document has them. */
export function mapLead(id: string, raw: unknown): Lead | null {
  if (!isRecord(raw)) return null;
  const code = text(raw.code) || id;
  const brand = oneOf<BrandId>(raw.brand, BRAND_IDS);
  const stage = oneOf<Stage>(raw.stage, STAGES);
  const temperature = oneOf<Temperature>(raw.temperature, TEMPERATURES);
  const country = text(raw.country).toUpperCase();
  const lastContactAt = dateOnly(raw.lastContactAt);
  if (!/^([A-Z]{3})-([A-Z]{2})-(\d{2,})$/.test(code)) return null;
  if (!brand || !stage || !temperature || !/^[A-Z]{2}$/.test(country) || !lastContactAt) {
    return null;
  }
  return {
    code,
    brand,
    stage,
    temperature,
    country,
    lastContactAt,
    createdAt: stamp(raw.createdAt) ?? "",
    updatedAt: stamp(raw.updatedAt) ?? "",
  };
}

export function mapPrivateLead(id: string, raw: unknown): PrivateLead | null {
  if (!isRecord(raw)) return null;
  const code = text(raw.code) || id;
  if (!code) return null;
  return {
    code,
    name: text(raw.name),
    source: text(raw.source),
    note: text(raw.note),
    country: text(raw.country),
    email: text(raw.email),
    phone: text(raw.phone),
  };
}

export function mapDirective(id: string, raw: unknown): Directive | null {
  if (!isRecord(raw)) return null;
  const textBody = text(raw.text);
  const status = oneOf<DirectiveStatus>(raw.status, DIRECTIVE_STATUSES);
  const agentId = text(raw.agentId);
  const createdAt = stamp(raw.createdAt);
  if (!id || !textBody || !status || !agentId || !createdAt) return null;
  return {
    id,
    agentId,
    text: textBody,
    status,
    response: text(raw.response) || null,
    createdAt,
    updatedAt: stamp(raw.updatedAt) ?? createdAt,
  };
}

function rows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readDashboard(raw: unknown): DashboardData {
  const root = isRecord(raw) ? raw : {};
  const people = rows(root.people)
    .map((row) => (isRecord(row) ? mapPerson(text(row.id), row) : null))
    .filter((row): row is Person => row !== null);
  const tasks = rows(root.tasks)
    .map((row) => (isRecord(row) ? mapTask(text(row.id), row) : null))
    .filter((row): row is Task => row !== null);
  const agents = rows(root.agents)
    .map((row) => (isRecord(row) ? mapAgent(text(row.id), row) : null))
    .filter((row): row is Agent => row !== null);
  const brands = rows(root.brands)
    .map((row) => (isRecord(row) ? mapBrand(text(row.id), row) : null))
    .filter((row): row is Brand => row !== null);
  const leads = rows(root.leads)
    .map((row) => (isRecord(row) ? mapLead(text(row.code), row) : null))
    .filter((row): row is Lead => row !== null);
  return {
    people,
    tasks,
    agents,
    brands,
    leads,
    directives: [],
    privateLeads: {},
    inbox: [],
    history: {},
  };
}

const INBOX_STATUSES = ["new", "picked_up", "done"] as const;

function cleanPublic(value: string): string {
  return value.includes("@") ? "" : value;
}

export function mapInbox(id: string, raw: unknown): InboxItem | null {
  if (!isRecord(raw)) return null;
  const title = cleanPublic(text(raw.title));
  const raisedBy = cleanPublic(text(raw.raisedBy));
  const status = oneOf<InboxStatus>(raw.status, INBOX_STATUSES);
  const assignees = stringList(raw.assignees).map(cleanPublic).filter(Boolean);
  if (!id || !title || !raisedBy || !status || assignees.length === 0) return null;
  return {
    id,
    title,
    details: cleanPublic(text(raw.details)),
    raisedBy,
    assignees,
    dueDate: raw.dueDate == null ? null : dateOnly(raw.dueDate),
    brand: oneOf(raw.brand, BRAND_IDS),
    status,
    response: cleanPublic(text(raw.response)) || null,
    note: cleanPublic(text(raw.note)) || null,
    taskId: text(raw.taskId) || null,
    createdAt: stamp(raw.createdAt) ?? "",
    updatedAt: stamp(raw.updatedAt) ?? "",
  };
}

export function mapHistory(id: string, taskId: string, raw: unknown): TaskHistory | null {
  if (!isRecord(raw)) return null;
  const personId = cleanPublic(text(raw.personId));
  const action = cleanPublic(text(raw.action));
  const summary = cleanPublic(text(raw.summary));
  const at = stamp(raw.at);
  if (!id || !taskId || !personId || !action || !summary || !at) return null;
  return { id, taskId, personId, action, summary, at };
}

export function loadSeed(): DashboardData {
  const data = readDashboard(seedJson);
  if (
    data.people.length !== 9 ||
    data.tasks.length !== 10 ||
    data.agents.length !== 18 ||
    data.brands.length !== 4 ||
    data.leads.length !== 6
  ) {
    throw new Error("Seed data did not load completely.");
  }
  return data;
}

export function byOrder<T extends { order: number }>(a: T, b: T): number {
  return a.order - b.order || 0;
}
