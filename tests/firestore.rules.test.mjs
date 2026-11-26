import { readFileSync } from "node:fs";
import test, { before, beforeEach, after } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const FOUNDER = "luxsugerostudios@gmail.com";
const HARI = "hari.om@example.com";
const DEBO = "debo@example.com";
const SHRISHTI = "shrishti@example.com";
const EMPTY = "empty@example.com";
const GUEST = "guest@example.com";
const STAMP = "2026-11-16T04:30:00.000Z";

let env;

function task(id, ownerId, extra = {}) {
  return {
    id,
    title: "Layout",
    ownerId,
    givenDate: "2026-11-10",
    dueDate: null,
    status: "open",
    closedAt: null,
    longTerm: false,
    flagAfterDays: null,
    note: "",
    brand: null,
    inboxId: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

function inbox(extra = {}) {
  return {
    title: "Need a layout",
    details: "Pending layouts",
    raisedBy: "debo",
    assignees: ["debo"],
    dueDate: null,
    brand: null,
    status: "new",
    response: null,
    note: null,
    taskId: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

function authed(email, verified = true) {
  return env.authenticatedContext(email.replace(/[^a-z]/g, ""), {
    email,
    email_verified: verified,
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-luxsugero",
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "config/roles"), {
      admins: [FOUNDER, HARI, SHRISHTI],
      members: {
        [HARI]: "hari-om",
        [DEBO]: "debo",
        [SHRISHTI]: "shrishti",
        [EMPTY]: "",
      },
    });
    await setDoc(doc(db, "tasks/t-debo"), task("t-debo", "debo"));
    await setDoc(doc(db, "tasks/t-shrishti"), task("t-shrishti", "shrishti"));
    await setDoc(doc(db, "inbox/in-debo"), inbox());
    await setDoc(doc(db, "inbox/in-hq"), inbox({ assignees: ["HQ"] }));
    await setDoc(doc(db, "inbox/in-shri"), inbox({ raisedBy: "shrishti", assignees: ["shrishti"] }));
    await setDoc(doc(db, "directives/d1"), {
      id: "d1",
      agentId: "hq-main",
      text: "Private instruction",
      status: "queued",
      response: null,
      createdAt: STAMP,
      updatedAt: STAMP,
    });
    await setDoc(doc(db, "private/vault/leads/SKY-PT-01"), {
      code: "SKY-PT-01",
      name: "Hidden Person",
      source: "Sample",
      note: "",
    });
    await setDoc(doc(db, "leads/SKY-PT-01"), {
      code: "SKY-PT-01",
      brand: "skybox",
      stage: "contacted",
      temperature: "warm",
      country: "PT",
      lastContactAt: "2026-11-12",
      createdAt: STAMP,
      updatedAt: STAMP,
    });
    await setDoc(doc(db, "tasks/t-debo/history/h1"), {
      personId: "debo",
      action: "created",
      summary: "Opened",
      at: STAMP,
    });
    await setDoc(doc(db, "pipeline/skybox"), {
      brand: "skybox",
      source: "kraya",
      account: "Skyboxbylux",
      stages: [{ name: "New Lead", count: 2 }],
      total: 2,
      syncedAt: STAMP,
    });
  });
});

test("public can read tasks, leads, inbox, and history, not directives or private names", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, "tasks/t-debo")));
  await assertSucceeds(getDoc(doc(db, "leads/SKY-PT-01")));
  await assertSucceeds(getDoc(doc(db, "inbox/in-debo")));
  await assertSucceeds(getDocs(collectionGroup(db, "history")));
  await assertFails(getDoc(doc(db, "directives/d1")));
  await assertFails(getDoc(doc(db, "private/vault/leads/SKY-PT-01")));
  await assertFails(getDoc(doc(db, "config/roles")));
  await assertFails(setDoc(doc(db, "inbox/nope"), inbox({ raisedBy: "debo" })));
});

test("founder administers tasks and is the only writer for leads, directives, and private data", async () => {
  const db = authed(FOUNDER).firestore();
  await assertSucceeds(setDoc(doc(db, "tasks/t-founder"), task("t-founder", "mayank")));
  await assertSucceeds(setDoc(doc(db, "directives/d2"), {
    id: "d2",
    agentId: "hq-main",
    text: "Queue this",
    status: "queued",
    response: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  }));
  await assertSucceeds(getDoc(doc(db, "private/vault/leads/SKY-PT-01")));
  await assertFails(setDoc(doc(db, "leads/SKY-XX-02"), {
    code: "SKY-XX-02",
    brand: "skybox",
    stage: "new",
    temperature: "cold",
    country: "XX",
    lastContactAt: "2026-11-16",
    name: "Hidden",
    createdAt: STAMP,
    updatedAt: STAMP,
  }));
  await assertSucceeds(setDoc(doc(db, "tasks/t-founder/history/h2"), {
    personId: "founder",
    action: "created",
    summary: "Assigned",
    at: STAMP,
  }));
});

test("unverified founder cannot write", async () => {
  const db = authed(FOUNDER, false).firestore();
  await assertFails(updateDoc(doc(db, "tasks/t-debo"), { title: "Nope" }));
});

test("Hari Om can manage any task but not leads, directives, or private data", async () => {
  const db = authed(HARI).firestore();
  await assertSucceeds(setDoc(doc(db, "tasks/t-hari"), task("t-hari", "mayank")));
  await assertSucceeds(updateDoc(doc(db, "tasks/t-debo"), {
    ownerId: "intikhab",
    updatedAt: STAMP,
  }));
  await assertSucceeds(deleteDoc(doc(db, "tasks/t-shrishti")));
  await assertFails(getDoc(doc(db, "directives/d1")));
  await assertFails(getDoc(doc(db, "private/vault/leads/SKY-PT-01")));
  await assertFails(setDoc(doc(db, "leads/SKY-XX-03"), {
    code: "SKY-XX-03",
    brand: "skybox",
    stage: "new",
    temperature: "cold",
    country: "XX",
    lastContactAt: "2026-11-16",
    createdAt: STAMP,
    updatedAt: STAMP,
  }));
  await assertFails(updateDoc(doc(db, "config/roles"), { admins: [FOUNDER] }));
  await assertSucceeds(setDoc(doc(db, "tasks/t-debo/history/h3"), {
    personId: "hari-om",
    action: "reassigned",
    summary: "Reassigned to intikhab",
    at: STAMP,
  }));
});

test("a member can tick and comment on their own task only", async () => {
  const db = authed(DEBO).firestore();
  await assertSucceeds(updateDoc(doc(db, "tasks/t-debo"), {
    status: "done",
    closedAt: STAMP,
    updatedAt: STAMP,
  }));
  await assertSucceeds(updateDoc(doc(db, "tasks/t-debo"), {
    note: "Layouts are in",
    updatedAt: STAMP,
  }));
  await assertFails(updateDoc(doc(db, "tasks/t-debo"), { title: "Renamed" }));
  await assertFails(updateDoc(doc(db, "tasks/t-debo"), { ownerId: "mayank", updatedAt: STAMP }));
  await assertFails(updateDoc(doc(db, "tasks/t-shrishti"), { status: "done", updatedAt: STAMP }));
  await assertFails(deleteDoc(doc(db, "tasks/t-debo")));
  await assertFails(setDoc(doc(db, "tasks/t-free"), task("t-free", "debo")));
  await assertFails(updateDoc(doc(db, "tasks/t-debo"), {
    note: "write me at someone@example.com",
    updatedAt: STAMP,
  }));
});

test("an empty member mapping and an unknown account cannot write", async () => {
  const emptyDb = authed(EMPTY).firestore();
  await assertFails(updateDoc(doc(emptyDb, "tasks/t-debo"), { status: "done", updatedAt: STAMP }));
  await assertFails(getDoc(doc(emptyDb, "config/roles")));
  const guest = authed(GUEST).firestore();
  await assertFails(setDoc(doc(guest, "inbox/guest"), inbox({ raisedBy: "guest" })));
  await assertFails(getDoc(doc(guest, "config/roles")));
  const member = authed(DEBO).firestore();
  await assertSucceeds(getDoc(doc(member, "config/roles")));
});

test("members create main-bucket requests and update only status, response, and note", async () => {
  const db = authed(DEBO).firestore();
  await assertSucceeds(setDoc(doc(db, "inbox/made"), inbox({
    assignees: ["HQ", "pm-skybox"],
  })));
  await assertFails(setDoc(doc(db, "inbox/spoof"), inbox({ raisedBy: "shrishti" })));
  await assertSucceeds(updateDoc(doc(db, "inbox/in-hq"), {
    status: "picked_up",
    response: "HQ will route this",
    updatedAt: STAMP,
  }));
  await assertSucceeds(updateDoc(doc(db, "inbox/in-debo"), {
    status: "done",
    note: "Finished",
    updatedAt: STAMP,
  }));
  await assertFails(updateDoc(doc(db, "inbox/in-shri"), { status: "done", updatedAt: STAMP }));
  await assertFails(updateDoc(doc(db, "inbox/in-debo"), { title: "Changed title" }));
  await assertFails(updateDoc(doc(db, "inbox/in-debo"), { assignees: ["mayank"] }));
  await assertFails(deleteDoc(doc(db, "inbox/in-debo")));
  await assertFails(setDoc(doc(db, "inbox/mail"), inbox({ details: "ping a@b.co" })));
});

test("a tagged member can accept a request into their own task", async () => {
  const db = authed(DEBO).firestore();
  await assertSucceeds(setDoc(doc(db, "tasks/from-inbox"), task("from-inbox", "debo", {
    inboxId: "in-debo",
    title: "Need a layout",
  })));
  await assertFails(setDoc(doc(db, "tasks/not-mine"), task("not-mine", "mayank", {
    inboxId: "in-debo",
  })));
  await assertSucceeds(setDoc(doc(db, "tasks/from-inbox/history/h-accept"), {
    personId: "debo",
    action: "accepted",
    summary: "Accepted from the main bucket",
    at: STAMP,
  }));
  await assertFails(setDoc(doc(db, "tasks/t-shrishti/history/nope"), {
    personId: "debo",
    action: "updated",
    summary: "Touched someone else",
    at: STAMP,
  }));
  await assertFails(setDoc(doc(db, "tasks/t-debo/history/mail"), {
    personId: "debo",
    action: "noted",
    summary: "email me",
    at: STAMP,
    email: DEBO,
  }));
});

test("admins can reassign, close, and delete main-bucket requests", async () => {
  const db = authed(HARI).firestore();
  await assertSucceeds(updateDoc(doc(db, "inbox/in-debo"), {
    assignees: ["mayank", "HQ"],
    status: "picked_up",
    updatedAt: STAMP,
  }));
  await assertSucceeds(deleteDoc(doc(db, "inbox/in-shri")));
  await assertSucceeds(setDoc(doc(db, "inbox/from-hari"), inbox({
    raisedBy: "hari-om",
    assignees: ["debo"],
  })));
});

test("team can read Kraya counts and only an admin can publish the public snapshot", async () => {
  const snapshot = {
    publishedAt: STAMP,
    open: 1,
    overdue: 0,
    shippedThisWeek: 0,
    brands: [],
    crew: [],
    tasks: [],
    orbit: { agents: [], crew: [], unowned: 0 },
    pipeline: [{ brand: "Skybox", total: 2, syncedAt: "", stages: [{ name: "New Lead", count: 2 }] }],
  };
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "pipeline/skybox")));
  await assertFails(getDoc(doc(authed(GUEST).firestore(), "pipeline/skybox")));
  await assertSucceeds(getDoc(doc(authed(DEBO).firestore(), "pipeline/skybox")));
  await assertSucceeds(getDoc(doc(authed(HARI).firestore(), "pipeline/skybox")));
  await assertFails(setDoc(doc(authed(DEBO).firestore(), "pipeline/fnh"), { source: "kraya" }));
  await assertFails(setDoc(doc(authed(FOUNDER).firestore(), "pipeline/skybox"), { source: "kraya", total: 1 }));
  await assertSucceeds(setDoc(doc(authed(FOUNDER).firestore(), "public/snapshot"), snapshot));
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), "public/snapshot")));
  await assertFails(setDoc(doc(authed(DEBO).firestore(), "public/snapshot"), snapshot));
  await assertFails(setDoc(doc(authed(FOUNDER).firestore(), "public/snapshot"), { ...snapshot, email: FOUNDER }));
  const member = authed(DEBO).firestore();
  await assertSucceeds(updateDoc(doc(member, "tasks/t-debo"), {
    status: "open",
    lane: "doing",
    closedAt: null,
    updatedAt: STAMP,
  }));
  await assertFails(updateDoc(doc(member, "tasks/t-shrishti"), {
    status: "open",
    lane: "doing",
    closedAt: null,
    updatedAt: STAMP,
  }));
});

test("history stays public and immutable", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, "tasks/t-debo/history/h1")));
  await assertFails(updateDoc(doc(db, "tasks/t-debo/history/h1"), { summary: "Changed" }));
});

function standup(id, extra = {}) {
  return {
    id,
    date: "2026-11-26",
    authorId: "shrishti",
    summary: "Ads went live. Woodman costing pending.",
    taskCount: 2,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

test("admins log standups; members read them; the public cannot", async () => {
  await assertSucceeds(setDoc(doc(authed(SHRISHTI).firestore(), "standups/s1"), standup("s1")));
  await assertSucceeds(setDoc(doc(authed(HARI).firestore(), "standups/s2"), standup("s2", { authorId: "hari-om" })));
  await assertSucceeds(setDoc(doc(authed(FOUNDER).firestore(), "standups/s3"), standup("s3", { authorId: "founder" })));
  await assertSucceeds(setDoc(doc(authed(SHRISHTI).firestore(), "tasks/t-from-standup"), task("t-from-standup", "gaurav")));
  await assertSucceeds(getDoc(doc(authed(DEBO).firestore(), "standups/s1")));
  await assertFails(setDoc(doc(authed(DEBO).firestore(), "standups/s4"), standup("s4", { authorId: "debo" })));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "standups/s1")));
  await assertFails(getDoc(doc(authed(GUEST).firestore(), "standups/s1")));
});

test("standup documents are shape-checked", async () => {
  const db = authed(SHRISHTI).firestore();
  await assertFails(setDoc(doc(db, "standups/s5"), standup("other-id")));
  await assertFails(setDoc(doc(db, "standups/s6"), standup("s6", { date: "26 Nov" })));
  await assertFails(setDoc(doc(db, "standups/s7"), standup("s7", { summary: "" })));
  await assertFails(setDoc(doc(db, "standups/s8"), standup("s8", { email: "x@y.z" })));
  await assertFails(setDoc(doc(db, "standups/s9"), standup("s9", { taskCount: 500 })));
});
