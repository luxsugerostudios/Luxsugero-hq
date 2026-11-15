#!/usr/bin/env node
/**
 * Upsert a HQ JSON file into Cloud Firestore.
 *
 *   node scripts/push-data.mjs seed/seed.json
 *   node scripts/push-data.mjs seed/private.seed.json
 *   node scripts/push-data.mjs --dry-run seed/seed.json
 *
 * Auth: GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json
 * Project defaults to luxsugero-hq. Override with FIREBASE_PROJECT_ID.
 *
 * Omitted collections are left untouched. Omitted fields on a record are
 * left untouched (merge). "_delete": true removes that document.
 * The script never prints lead names or directive text.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const LEAD_CODE = /^(SKY|STY|FNH|BRJ)-[A-Z]{2}-\d{2,}$/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const MONEY = /[₹$€£]|\b(?:INR|USD|EUR|GBP)\b|\bRs\.?\s?\d/i;

const PREFIX = { stays: "STY", skybox: "SKY", fh: "FNH", braj: "BRJ" };
const TOP_KEYS = new Set([
  "people",
  "tasks",
  "agents",
  "brands",
  "leads",
  "directives",
  "private",
  "roles",
  "inbox",
]);
const LEAD_SECRETS = new Set([
  "name",
  "fullName",
  "firstName",
  "lastName",
  "email",
  "phone",
  "telephone",
  "mobile",
  "source",
  "price",
  "cost",
  "amount",
  "budget",
]);

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField({ max, empty = false, scan = true }) {
  return (value, where, errors) => {
    if (typeof value !== "string") {
      errors.push(`${where} must be a string`);
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed && !empty) {
      errors.push(`${where} is empty`);
      return undefined;
    }
    if (trimmed.length > max) errors.push(`${where} is longer than ${max} characters`);
    if (scan && trimmed && (EMAIL.test(trimmed) || MONEY.test(trimmed))) {
      errors.push(`${where} looks like an email or a price. Keep that out of public data.`);
    }
    return trimmed;
  };
}

function privateText(max) {
  return (value, where, errors) => {
    if (typeof value !== "string") {
      errors.push(`${where} must be a string`);
      return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length > max) errors.push(`${where} is longer than ${max} characters`);
    if (MONEY.test(trimmed)) {
      errors.push(`${where} looks like a price. This dashboard does not store prices.`);
    }
    return trimmed;
  };
}

function enumField(values) {
  return (value, where, errors) => {
    if (typeof value !== "string" || !values.includes(value)) {
      errors.push(`${where} must be one of ${values.join(", ")}`);
      return undefined;
    }
    return value;
  };
}

function dateField(value, where, errors) {
  if (typeof value !== "string" || !DATE.test(value)) {
    errors.push(`${where} must be YYYY-MM-DD`);
    return undefined;
  }
  return value;
}

function stampField(value, where, errors) {
  if (typeof value !== "string" || !STAMP.test(value)) {
    errors.push(`${where} must be an ISO timestamp ending in Z`);
    return undefined;
  }
  return value;
}

function nullOr(reader) {
  return (value, where, errors) => (value === null ? null : reader(value, where, errors));
}

function idField(pattern, label) {
  return (value, where, errors) => {
    if (typeof value !== "string" || !pattern.test(value.trim())) {
      errors.push(`${where} must be ${label}`);
      return undefined;
    }
    return value.trim();
  };
}

function boolField(value, where, errors) {
  if (typeof value !== "boolean") {
    errors.push(`${where} must be a boolean`);
    return undefined;
  }
  return value;
}

function flagAfterDaysField(value, where, errors) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 3650) {
    errors.push(`${where} must be a non-negative whole number`);
    return undefined;
  }
  return value;
}

function orderField(value, where, errors) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 999) {
    errors.push(`${where} must be an integer from 0 to 999`);
    return undefined;
  }
  return value;
}

function stringList(maxItems, maxLen) {
  return (value, where, errors) => {
    if (!Array.isArray(value)) {
      errors.push(`${where} must be an array of strings`);
      return undefined;
    }
    if (value.length > maxItems) errors.push(`${where} has too many items`);
    return value.map((item, index) => {
      if (typeof item !== "string" || !item.trim()) {
        errors.push(`${where}[${index}] must be a non-empty string`);
        return "";
      }
      const trimmed = item.trim();
      if (trimmed.length > maxLen) errors.push(`${where}[${index}] is too long`);
      if (EMAIL.test(trimmed) || MONEY.test(trimmed)) {
        errors.push(`${where}[${index}] looks like an email or a price`);
      }
      return trimmed;
    });
  };
}

function headlinesField(value, where, errors) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3) {
    errors.push(`${where} must be 2 or 3 { label, value } items`);
    return undefined;
  }
  return value.map((item, index) => {
    if (!isObject(item)) {
      errors.push(`${where}[${index}] must be an object`);
      return { label: "", value: "" };
    }
    const label = stringField({ max: 40 })(item.label, `${where}[${index}].label`, errors);
    const headline = stringField({ max: 40 })(item.value, `${where}[${index}].value`, errors);
    return { label: label ?? "", value: headline ?? "" };
  });
}

function urlField(value, where, errors) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^https:\/\/\S+$/.test(value) || value.length > 160) {
    errors.push(`${where} must be an https URL`);
    return undefined;
  }
  return value;
}

function emailField(value, where, errors) {
  if (typeof value !== "string") {
    errors.push(`${where} must be a string`);
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    errors.push(`${where} must be an email address`);
    return undefined;
  }
  return trimmed;
}

function phoneField(value, where, errors) {
  if (typeof value !== "string") {
    errors.push(`${where} must be a string`);
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^[0-9+().\-\s]{6,40}$/.test(trimmed)) {
    errors.push(`${where} must be a phone number`);
    return undefined;
  }
  return trimmed;
}

const PEOPLE = {
  id: idField(ID, "a slug id"),
  name: stringField({ max: 80 }),
  role: stringField({ max: 80, empty: true }),
  order: orderField,
};

const TASKS = {
  id: idField(ID, "a slug id"),
  title: stringField({ max: 180 }),
  ownerId: idField(ID, "a person id"),
  givenDate: dateField,
  dueDate: nullOr(dateField),
  status: enumField(["open", "done"]),
  closedAt: nullOr(stampField),
  longTerm: boolField,
  flagAfterDays: nullOr(flagAfterDaysField),
  note: stringField({ max: 2000, empty: true }),
  brand: nullOr(enumField(["stays", "skybox", "fh", "braj"])),
  inboxId: nullOr(idField(ID, "an inbox id")),
  createdAt: stampField,
  updatedAt: stampField,
};

function assigneesField(value, where, errors) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    errors.push(`${where} must list 1 to 8 tags`);
    return undefined;
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim() || item.includes("@") || item.trim().length > 80) {
      errors.push(`${where}[${index}] must be a personId, HQ, or an agent id`);
      return "";
    }
    return item.trim();
  });
}

const INBOX = {
  id: idField(ID, "a slug id"),
  title: stringField({ max: 180 }),
  details: stringField({ max: 4000, empty: true }),
  raisedBy: idField(ID, "a person id, founder, or admin"),
  assignees: assigneesField,
  dueDate: nullOr(dateField),
  brand: nullOr(enumField(["stays", "skybox", "fh", "braj"])),
  status: enumField(["new", "picked_up", "done"]),
  response: nullOr(stringField({ max: 4000, empty: true })),
  note: nullOr(stringField({ max: 2000, empty: true })),
  taskId: nullOr(idField(ID, "a task id")),
  createdAt: stampField,
  updatedAt: stampField,
};

const AGENTS = {
  id: idField(ID, "a slug id"),
  name: stringField({ max: 80 }),
  group: enumField(["HQ", "Brand PM", "Department"]),
  focus: stringField({ max: 180 }),
  waitingOnFounder: stringList(12, 180),
  updatedAt: stampField,
  order: orderField,
};

const BRANDS = {
  id: enumField(["stays", "skybox", "fh", "braj"]),
  name: stringField({ max: 80 }),
  short: stringField({ max: 24 }),
  status: enumField(["active", "paused", "founder-led"]),
  summary: stringField({ max: 180, empty: true }),
  url: urlField,
  headlines: headlinesField,
  waitingOnFounder: stringList(12, 180),
  order: orderField,
};

const LEADS = {
  code: idField(LEAD_CODE, "a code like SKY-PT-01"),
  brand: enumField(["stays", "skybox", "fh", "braj"]),
  stage: enumField(["new", "contacted", "meet_booked", "proposal", "deposit", "won", "lost"]),
  temperature: enumField(["hot", "warm", "cold"]),
  country: idField(/^[A-Z]{2}$/, "a two-letter country code"),
  lastContactAt: dateField,
  createdAt: stampField,
  updatedAt: stampField,
};

const DIRECTIVES = {
  id: idField(ID, "a slug id"),
  agentId: (value, where, errors) => {
    if (value === "all") return "all";
    return idField(ID, '"all" or an agent id')(value, where, errors);
  },
  text: (value, where, errors) => privateText(2000)(value, where, errors),
  status: enumField(["queued", "picked_up", "done"]),
  response: nullOr((value, where, errors) => privateText(2000)(value, where, errors)),
  createdAt: stampField,
  updatedAt: stampField,
};

const PRIVATE_LEADS = {
  code: idField(LEAD_CODE, "a code like SKY-PT-01"),
  name: privateText(120),
  source: privateText(80),
  note: privateText(2000),
  country: privateText(80),
  email: emailField,
  phone: phoneField,
  createdAt: stampField,
  updatedAt: stampField,
};

function parseRecords(listName, list, fields, idKey, pathFor, finish) {
  const errors = [];
  const ops = [];
  if (list == null) return { errors, ops };
  if (!Array.isArray(list)) {
    return { errors: [`${listName} must be an array`], ops };
  }
  list.forEach((row, index) => {
    const where = `${listName}[${index}]`;
    if (!isObject(row)) {
      errors.push(`${where} must be an object`);
      return;
    }
    if (row._delete === true) {
      const id = fields[idKey](row[idKey], `${where}.${idKey}`, errors);
      if (typeof id === "string") ops.push({ kind: "delete", path: pathFor(id) });
      return;
    }
    const before = errors.length;
    const data = {};
    for (const key of Object.keys(row)) {
      if (key === "_delete") continue;
      if (listName === "leads" && LEAD_SECRETS.has(key)) {
        errors.push(
          `${where}.${key} is not allowed on public leads. Put identity under private.leads.`,
        );
        continue;
      }
      if (!fields[key]) {
        errors.push(`${where}.${key} is not allowed`);
        continue;
      }
      const parsed = fields[key](row[key], `${where}.${key}`, errors);
      if (parsed !== undefined) data[key] = parsed;
    }
    if (typeof data[idKey] !== "string" && !(idKey in row)) {
      fields[idKey](row[idKey], `${where}.${idKey}`, errors);
    }
    if (finish && typeof data[idKey] === "string") finish(data, where, errors);
    const content = Object.keys(data).filter((key) => key !== idKey);
    if (content.length === 0) errors.push(`${where} has no fields to write`);
    if (errors.length > before || typeof data[idKey] !== "string") return;
    ops.push({ kind: "set", path: pathFor(data[idKey]), data });
  });
  return { errors, ops };
}

function finishLead(data, where, errors) {
  if (typeof data.code === "string" && typeof data.brand === "string") {
    const prefix = PREFIX[data.brand];
    if (prefix && !data.code.startsWith(`${prefix}-`)) {
      errors.push(`${where}.code must start with ${prefix}- for brand ${data.brand}`);
    }
  }
}

function finishPrivate(data, where, errors) {
  const filled = ["name", "source", "note", "email", "phone"].some((key) => data[key]);
  if (!filled) {
    errors.push(`${where} needs a name, source, note, email, or phone`);
  }
}

function splitTaskHistory(tasks) {
  if (tasks == null) return { tasks, errors: [], ops: [] };
  if (!Array.isArray(tasks)) return { tasks, errors: [], ops: [] };
  const errors = [];
  const ops = [];
  const clean = tasks.map((row, index) => {
    if (!isObject(row) || !Array.isArray(row.history)) return row;
    const { history, ...rest } = row;
    const taskId = typeof row.id === "string" ? row.id : "";
    history.forEach((event, eventIndex) => {
      const where = `tasks[${index}].history[${eventIndex}]`;
      if (!isObject(event)) {
        errors.push(`${where} must be an object`);
        return;
      }
      const id = typeof event.id === "string" ? event.id.trim() : "";
      const personId = typeof event.personId === "string" ? event.personId.trim() : "";
      const action = typeof event.action === "string" ? event.action.trim() : "";
      const summary = typeof event.summary === "string" ? event.summary.trim() : "";
      const at = typeof event.at === "string" ? event.at.trim() : "";
      if (!ID.test(id) || !taskId || !ID.test(personId) || !action || !summary || !STAMP.test(at)) {
        errors.push(`${where} needs id, personId, action, summary, and at`);
        return;
      }
      if ([personId, action, summary].some((value) => value.includes("@"))) {
        errors.push(`${where} cannot contain an email`);
        return;
      }
      ops.push({
        kind: "set",
        path: `tasks/${taskId}/history/${id}`,
        data: { personId, action, summary, at },
      });
    });
    return rest;
  });
  return { tasks: clean, errors, ops };
}

function planRoles(roles) {
  const errors = [];
  if (roles == null) return { errors, ops: [] };
  if (!isObject(roles)) return { errors: ["roles must be an object"], ops: [] };
  for (const key of Object.keys(roles)) {
    if (key !== "admins" && key !== "members") errors.push(`roles.${key} is not allowed`);
  }
  const data = {};
  if ("admins" in roles) {
    if (!Array.isArray(roles.admins)) errors.push("roles.admins must be an array");
    else {
      data.admins = roles.admins.map((item, index) => {
        if (typeof item !== "string" || item.length > 120 || /\s/.test(item)) {
          errors.push(`roles.admins[${index}] must be an email or an empty placeholder`);
          return "";
        }
        return item.trim();
      });
    }
  }
  if ("members" in roles) {
    if (!isObject(roles.members)) errors.push("roles.members must be an object");
    else {
      const members = {};
      for (const [key, value] of Object.entries(roles.members)) {
        if (!key || key.length > 120 || /\s/.test(key) || key.includes("/")) {
          errors.push("roles.members has an invalid email key");
        }
        if (typeof value !== "string" || (value !== "" && !ID.test(value))) {
          errors.push(`roles.members value for ${key} must be a person id or empty`);
        } else {
          members[key] = value.trim();
        }
      }
      data.members = members;
    }
  }
  if (errors.length > 0 || Object.keys(data).length === 0) {
    if (Object.keys(data).length === 0 && errors.length === 0) errors.push("roles has no fields to write");
    return { errors, ops: [] };
  }
  return { errors, ops: [{ kind: "set", path: "config/roles", data }] };
}

export function buildPlan(payload) {
  if (!isObject(payload)) return { errors: ["Root JSON value must be an object"], ops: [] };
  const errors = [];
  for (const key of Object.keys(payload)) {
    if (!TOP_KEYS.has(key)) errors.push(`Unknown top-level key ${key}`);
  }
  const split = splitTaskHistory(payload.tasks);
  errors.push(...split.errors);
  const roles = planRoles(payload.roles);
  errors.push(...roles.errors);
  const chunks = [
    parseRecords("people", payload.people, PEOPLE, "id", (id) => `people/${id}`),
    parseRecords("tasks", split.tasks, TASKS, "id", (id) => `tasks/${id}`),
    { errors: [], ops: split.ops },
    { errors: [], ops: roles.ops },
    parseRecords("inbox", payload.inbox, INBOX, "id", (id) => `inbox/${id}`),
    parseRecords("agents", payload.agents, AGENTS, "id", (id) => `agents/${id}`),
    parseRecords("brands", payload.brands, BRANDS, "id", (id) => `brands/${id}`),
    parseRecords("leads", payload.leads, LEADS, "code", (id) => `leads/${id}`, finishLead),
    parseRecords(
      "directives",
      payload.directives,
      DIRECTIVES,
      "id",
      (id) => `directives/${id}`,
    ),
  ];
  if (payload.private != null) {
    if (!isObject(payload.private)) errors.push("private must be an object");
    else {
      for (const key of Object.keys(payload.private)) {
        if (key !== "leads") errors.push(`private.${key} is not supported`);
      }
      chunks.push(
        parseRecords(
          "private.leads",
          payload.private.leads,
          PRIVATE_LEADS,
          "code",
          (id) => `private/vault/leads/${id}`,
          finishPrivate,
        ),
      );
    }
  }
  const ops = [];
  const seen = new Set();
  for (const chunk of chunks) {
    errors.push(...chunk.errors);
    for (const op of chunk.ops) {
      if (seen.has(op.path)) errors.push(`Duplicate path ${op.path}`);
      seen.add(op.path);
      ops.push(op);
    }
  }
  return { errors, ops: errors.length ? [] : ops };
}

export function summarize(ops) {
  const counts = new Map();
  for (const op of ops) {
    const bucket = op.path.startsWith("private/vault/leads/")
      ? "private/vault/leads"
      : op.path.includes("/history/")
        ? "tasks/history"
        : op.path.startsWith("config/")
          ? op.path
          : op.path.split("/")[0];
    const label = `${op.kind} ${bucket}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

async function commit(ops) {
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const projectId = process.env.FIREBASE_PROJECT_ID || "luxsugero-hq";
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const chunkSize = 400;
  for (let index = 0; index < ops.length; index += chunkSize) {
    const batch = db.batch();
    for (const op of ops.slice(index, index + chunkSize)) {
      const ref = db.doc(op.path);
      if (op.kind === "delete") batch.delete(ref);
      else batch.set(ref, op.data, { merge: true });
    }
    await batch.commit();
  }
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((arg) => !arg.startsWith("--"));
  if (!file) {
    console.error("Usage: node scripts/push-data.mjs [--dry-run] <file.json>");
    process.exit(1);
  }
  let payload;
  try {
    payload = JSON.parse(await readFile(resolve(file), "utf8"));
  } catch (error) {
    console.error(`Could not read ${file}: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  const { errors, ops } = buildPlan(payload);
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }
  if (ops.length === 0) {
    console.error("Nothing to write.");
    process.exit(1);
  }
  for (const [label, count] of summarize(ops)) console.log(`${label}: ${count}`);
  if (dryRun) {
    console.log("dry-run ok");
    return;
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON key.");
    process.exit(1);
  }
  await commit(ops);
  console.log("committed");
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
