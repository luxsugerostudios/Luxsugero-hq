export const BRAND_IDS = ["stays", "skybox", "fh", "braj"] as const;
export type BrandId = (typeof BRAND_IDS)[number];

export const STAGES = [
  "new",
  "contacted",
  "meet_booked",
  "proposal",
  "deposit",
  "won",
  "lost",
] as const;
export type Stage = (typeof STAGES)[number];

export const TEMPERATURES = ["hot", "warm", "cold"] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const TASK_STATUSES = ["open", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const LANES = ["todo", "doing", "waiting", "done"] as const;
export type Lane = (typeof LANES)[number];

export const DIRECTIVE_STATUSES = ["queued", "picked_up", "done"] as const;
export type DirectiveStatus = (typeof DIRECTIVE_STATUSES)[number];

export const AGENT_GROUPS = ["HQ", "Brand PM", "Department"] as const;
export type AgentGroup = (typeof AGENT_GROUPS)[number];

export const BRAND_STATUSES = ["active", "paused", "founder-led"] as const;
export type BrandStatus = (typeof BRAND_STATUSES)[number];

export const BRAND_PREFIX: Record<BrandId, string> = {
  stays: "STY",
  skybox: "SKY",
  fh: "FNH",
  braj: "BRJ",
};

export type Person = {
  id: string;
  name: string;
  role: string;
  order: number;
};

export type Task = {
  id: string;
  title: string;
  ownerId: string;
  givenDate: string;
  dueDate: string | null;
  status: TaskStatus;
  lane: Lane | null;
  closedAt: string | null;
  longTerm: boolean;
  flagAfterDays: number | null;
  note: string;
  brand: BrandId | null;
  inboxId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskHistory = {
  id: string;
  taskId: string;
  personId: string;
  action: string;
  summary: string;
  at: string;
};

export type InboxStatus = "new" | "picked_up" | "done";

export type InboxItem = {
  id: string;
  title: string;
  details: string;
  raisedBy: string;
  assignees: string[];
  dueDate: string | null;
  brand: BrandId | null;
  status: InboxStatus;
  response: string | null;
  note: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RolesDoc = {
  admins: string[];
  members: Record<string, string>;
};

export type Agent = {
  id: string;
  name: string;
  group: AgentGroup;
  focus: string;
  waitingOnFounder: string[];
  updatedAt: string;
  order: number;
};

export type Headline = {
  label: string;
  value: string;
};

export type Brand = {
  id: BrandId;
  name: string;
  short: string;
  status: BrandStatus;
  summary: string;
  url: string | null;
  headlines: Headline[];
  waitingOnFounder: string[];
  order: number;
};

/** Public lead. Never include a name, source, email, phone, or price. */
export type Lead = {
  code: string;
  brand: BrandId;
  stage: Stage;
  temperature: Temperature;
  country: string;
  lastContactAt: string;
  createdAt: string;
  updatedAt: string;
};

/** Founder-only record at private/vault/leads/{code}. */
export type PrivateLead = {
  code: string;
  name: string;
  source: string;
  note: string;
  country: string;
  email: string;
  phone: string;
};

/** A link (usually a Google Drive file) attached to a task or a standup. */
export type Attachment = {
  id: string;
  parentType: "task" | "standup";
  parentId: string;
  name: string;
  url: string;
  addedBy: string;
  addedAt: string;
};

/** A daily standup summary logged by an admin (founder, Hari Om, Shrishti). */
export type Standup = {
  id: string;
  date: string;
  authorId: string;
  summary: string;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Directive = {
  id: string;
  agentId: string;
  text: string;
  status: DirectiveStatus;
  response: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Stage counts written by the server-side Kraya sync. No lead names. */
export type PipelineStage = { name: string; count: number };

export type PipelineBoard = {
  id: "skybox" | "fnh";
  brand: "skybox" | "fnh";
  source: "kraya";
  account: string;
  stages: PipelineStage[];
  total: number;
  syncedAt: string;
};

export type DashboardData = {
  people: Person[];
  tasks: Task[];
  agents: Agent[];
  brands: Brand[];
  leads: Lead[];
  directives: Directive[];
  privateLeads: Record<string, PrivateLead>;
  inbox: InboxItem[];
  history: Record<string, TaskHistory[]>;
  pipelines: PipelineBoard[];
  standups: Standup[];
  attachments: Attachment[];
};

export const EMPTY_DASHBOARD: DashboardData = {
  people: [],
  tasks: [],
  agents: [],
  brands: [],
  leads: [],
  directives: [],
  privateLeads: {},
  inbox: [],
  history: {},
  pipelines: [],
  standups: [],
  attachments: [],
};
