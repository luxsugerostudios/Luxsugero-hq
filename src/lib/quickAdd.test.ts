import assert from "node:assert/strict";
import test from "node:test";
import { parseQuickAdd, parseStandup } from "./quickAdd.ts";

const people = [
  { id: "debo", name: "Debo" },
  { id: "hari-om", name: "Hari Om Mishra" },
  { id: "megha", name: "Megha" },
];

test("quick add reads owner, brand, due date and long-term", () => {
  const draft = parseQuickAdd("@debo layout the deck #skybox tomorrow long", "2026-11-18", people);
  assert.equal(draft.ownerId, "debo");
  assert.equal(draft.brand, "skybox");
  assert.equal(draft.dueDate, "2026-11-19");
  assert.equal(draft.longTerm, true);
  assert.equal(draft.title, "layout the deck");
});

test("quick add accepts a name prefix, a weekday and a day-month", () => {
  const named = parseQuickAdd("Megha: call the site", "2026-11-18", people);
  assert.equal(named.ownerId, "megha");
  assert.equal(named.title, "call the site");
  const friday = parseQuickAdd("send the file friday", "2026-11-18", people);
  assert.equal(friday.dueDate, "2026-11-20");
  const dated = parseQuickAdd("visit 21 nov", "2026-11-18", people);
  assert.equal(dated.dueDate, "2026-11-21");
  assert.equal(dated.title, "visit");
});

test("standup splits lines and bullets", () => {
  const rows = parseStandup("- Hari - book the call #fh\nDebo: class notes today", "2026-11-18", people);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ownerId, "hari-om");
  assert.equal(rows[0].brand, "fh");
  assert.equal(rows[1].ownerId, "debo");
  assert.equal(rows[1].dueDate, "2026-11-18");
});
