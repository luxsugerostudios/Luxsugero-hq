#!/usr/bin/env node
/**
 * Publish public/snapshot from the live HQ collections.
 *
 * The browser never calls Kraya. This script uses the Admin SDK, which
 * bypasses security rules, and writes only stage counts plus the public
 * board fields. It does not read inbox, directives, private leads, or emails.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/outside/the/repo.json
 *   node scripts/publish-public-snapshot.mjs
 *
 * FIREBASE_PROJECT_ID defaults to luxsugero-hq.
 * Run this from the HQ machine when an admin is not signed in to the dashboard.
 * A signed-in admin also republishes the same document from the dashboard.
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mapPipeline } from "../src/lib/pipeline.ts";
import { buildPublicSnapshot } from "../src/lib/publicSnapshot.ts";

const projectId = process.env.FIREBASE_PROJECT_ID || "luxsugero-hq";
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

function docs(snap) {
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

const [peopleSnap, taskSnap, agentSnap, brandSnap, skyboxSnap, fnhSnap] = await Promise.all([
  db.collection("people").get(),
  db.collection("tasks").get(),
  db.collection("agents").get(),
  db.collection("brands").get(),
  db.doc("pipeline/skybox").get(),
  db.doc("pipeline/fnh").get(),
]);

const people = docs(peopleSnap).map((row) => ({
  id: row.id,
  name: String(row.name ?? ""),
  role: String(row.role ?? ""),
  order: Number(row.order ?? 0),
}));
const tasks = docs(taskSnap).map((row) => ({
  id: row.id,
  title: String(row.title ?? ""),
  ownerId: String(row.ownerId ?? ""),
  givenDate: String(row.givenDate ?? ""),
  dueDate: row.dueDate ? String(row.dueDate) : null,
  status: row.status === "done" ? "done" : "open",
  lane: row.lane ?? null,
  closedAt: row.closedAt ? String(row.closedAt?.toDate?.() ?? row.closedAt) : null,
  longTerm: row.longTerm === true,
  flagAfterDays: Number.isInteger(row.flagAfterDays) ? row.flagAfterDays : null,
  note: "",
  brand: row.brand ?? null,
  inboxId: null,
  createdAt: String(row.createdAt?.toDate?.() ?? row.createdAt ?? ""),
  updatedAt: String(row.updatedAt?.toDate?.() ?? row.updatedAt ?? ""),
}));
const agents = docs(agentSnap).map((row) => ({
  id: row.id,
  name: String(row.name ?? ""),
  group: row.group,
  focus: String(row.focus ?? ""),
  waitingOnFounder: Array.isArray(row.waitingOnFounder) ? row.waitingOnFounder.map(String) : [],
  updatedAt: String(row.updatedAt?.toDate?.() ?? row.updatedAt ?? ""),
  order: Number(row.order ?? 0),
}));
const brands = docs(brandSnap).map((row) => ({
  id: row.id,
  name: String(row.name ?? ""),
  short: String(row.short ?? ""),
  status: row.status,
  summary: "",
  url: null,
  headlines: [],
  waitingOnFounder: [],
  order: Number(row.order ?? 0),
}));
const pipelines = [skyboxSnap, fnhSnap].flatMap((snap) => {
  if (!snap.exists) return [];
  const board = mapPipeline(snap.id, snap.data());
  return board ? [board] : [];
});

const snapshot = buildPublicSnapshot({ people, tasks, agents, brands, pipelines });
await db.doc("public/snapshot").set(snapshot);
console.log(`Published public/snapshot for ${projectId}. Open ${pipelines.length} Kraya board(s). No lead names were written.`);
