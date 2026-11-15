import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildPlan } from "./push-data.mjs";

const root = join(import.meta.dirname, "..");

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

test("public seed plans the roster and anonymous skybox leads", () => {
  const { errors, ops } = buildPlan(readJson("seed/seed.json"));
  assert.deepEqual(errors, []);
  const count = (prefix) => ops.filter((op) => op.path.startsWith(prefix)).length;
  assert.equal(count("people/"), 9);
  assert.equal(count("tasks/"), 10);
  assert.equal(count("agents/"), 18);
  assert.equal(count("brands/"), 4);
  assert.equal(count("leads/"), 6);
  const owners = {};
  for (const op of ops.filter((op) => op.path.startsWith("tasks/"))) {
    owners[op.data.ownerId] = (owners[op.data.ownerId] ?? 0) + 1;
  }
  assert.deepEqual(owners, {
    everyone: 1,
    "hari-om": 1,
    siddhant: 2,
    intikhab: 1,
    shrishti: 1,
    unassigned: 4,
  });
  const pedro = ops.find((op) => op.path === "leads/SKY-PT-01");
  assert.equal(pedro.data.stage, "meet_booked");
  assert.equal(pedro.data.temperature, "hot");
  assert.equal(pedro.data.country, "PT");
  assert.equal("name" in pedro.data, false);
  assert.equal("source" in pedro.data, false);
});

test("public leads reject identity fields", () => {
  const { errors, ops } = buildPlan({
    leads: [
      {
        code: "SKY-PT-99",
        brand: "skybox",
        stage: "new",
        temperature: "cold",
        country: "PT",
        lastContactAt: "2026-11-15",
        name: "Hidden Person",
      },
    ],
  });
  assert.equal(ops.length, 0);
  assert.ok(errors.some((error) => error.includes("private.leads")));
});

test("public text rejects emails and prices", () => {
  const emailed = buildPlan({
    tasks: [{ id: "task-mail", title: "Write ada@example.com today" }],
  });
  assert.ok(emailed.errors.length > 0);
  const priced = buildPlan({
    brands: [
      {
        id: "stays",
        headlines: [
          { label: "Rate", value: "₹5000" },
          { label: "Deposits", value: "0" },
        ],
      },
    ],
  });
  assert.ok(priced.errors.length > 0);
});

test("tasks accept longTerm and flagAfterDays", () => {
  const ok = buildPlan({
    tasks: [
      {
        id: "task-long",
        title: "Keep the land file warm",
        longTerm: true,
        flagAfterDays: 7,
      },
    ],
  });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.ops[0].data.longTerm, true);
  assert.equal(ok.ops[0].data.flagAfterDays, 7);

  const cleared = buildPlan({
    tasks: [{ id: "task-long", longTerm: false, flagAfterDays: null }],
  });
  assert.deepEqual(cleared.errors, []);
  assert.equal(cleared.ops[0].data.longTerm, false);
  assert.equal(cleared.ops[0].data.flagAfterDays, null);

  const bad = buildPlan({
    tasks: [{ id: "task-long", flagAfterDays: "7", longTerm: "yes" }],
  });
  assert.ok(bad.errors.some((error) => error.includes("flagAfterDays")));
  assert.ok(bad.errors.some((error) => error.includes("longTerm")));
});

test("roles and inbox stay free of stray fields", () => {
  const { errors, ops } = buildPlan({
    roles: {
      admins: ["luxsugerostudios@gmail.com", ""],
      members: { PASTE_DEBO_GMAIL: "" },
    },
    inbox: [
      {
        id: "request-1",
        title: "Review the layout",
        details: "Pending set",
        raisedBy: "debo",
        assignees: ["hari-om", "HQ"],
        status: "new",
        brand: "skybox",
      },
    ],
    tasks: [
      {
        id: "task-noted",
        note: "Layouts are in",
        brand: "skybox",
        history: [
          {
            id: "hist-1",
            personId: "debo",
            action: "noted",
            summary: "Updated the note",
            at: "2026-11-16T04:30:00.000Z",
          },
        ],
      },
    ],
  });
  assert.deepEqual(errors, []);
  assert.equal(ops.find((op) => op.path === "config/roles").data.admins[0], "luxsugerostudios@gmail.com");
  assert.equal(ops.find((op) => op.path === "inbox/request-1").data.assignees[1], "HQ");
  assert.equal(ops.find((op) => op.path === "tasks/task-noted/history/hist-1").data.personId, "debo");
  const leaked = buildPlan({
    inbox: [
      {
        id: "request-2",
        title: "Ping",
        details: "write ada@example.com",
        raisedBy: "debo",
        assignees: ["HQ"],
        status: "new",
      },
    ],
  });
  assert.ok(leaked.errors.length > 0);
});

test("delete is explicit and partial updates stay small", () => {
  const { errors, ops } = buildPlan({
    tasks: [{ id: "task-gmail-slack", _delete: true }],
    agents: [{ id: "pm-skybox", focus: "Follow the warm pipeline", updatedAt: "2026-11-16T04:30:00.000Z" }],
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(ops[0], { kind: "delete", path: "tasks/task-gmail-slack" });
  assert.equal(ops[1].path, "agents/pm-skybox");
  assert.equal(ops[1].data.focus, "Follow the warm pipeline");
  assert.equal("name" in ops[1].data, false);
});

test("example private seed writes only the private path", () => {
  const { errors, ops } = buildPlan(readJson("seed/private.seed.example.json"));
  assert.deepEqual(errors, []);
  assert.equal(ops.length, 6);
  assert.ok(ops.every((op) => op.path.startsWith("private/vault/leads/")));
  assert.equal(ops[0].data.name, "Sample Contact A");
});

test("committed files do not reference the real private seed", () => {
  const text = readFileSync(join(root, "src/firebaseConfig.ts"), "utf8");
  assert.match(text, /projectId: "luxsugero-hq"/);
  assert.doesNotMatch(text, /YOUR_API_KEY/);
  const seed = readFileSync(join(root, "seed/seed.json"), "utf8");
  assert.doesNotMatch(seed, /@/);
  assert.doesNotMatch(seed, /[₹$€£]/);
  const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
  assert.match(gitignore, /seed\/private\.seed\.json/);
  for (const file of walk(join(root, "src"))) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("private.seed"), false, file);
  }
});

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}
