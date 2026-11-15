import assert from "node:assert/strict";
import test from "node:test";
import {
  closedThisWeek,
  daysOpen,
  diffDays,
  isCarriedForward,
  isOverdue,
  weekBounds,
} from "./dates.ts";

test("10 Nov to 15 Nov is 5 days and overdue", () => {
  assert.equal(diffDays("2026-11-10", "2026-11-15"), 5);
  assert.equal(daysOpen("2026-11-10", "2026-11-15"), 5);
  assert.equal(isOverdue("open", "2026-11-10", "2026-11-15"), true);
  assert.equal(isCarriedForward("open", "2026-11-10", "2026-11-15"), true);
});

test("day 3 is carried but not overdue", () => {
  assert.equal(diffDays("2026-11-10", "2026-11-13"), 3);
  assert.equal(isOverdue("open", "2026-11-10", "2026-11-13"), false);
  assert.equal(isCarriedForward("open", "2026-11-10", "2026-11-13"), true);
});

test("day 4 is overdue", () => {
  assert.equal(isOverdue("open", "2026-11-10", "2026-11-14"), true);
});

test("a task given today is not carried or overdue", () => {
  assert.equal(daysOpen("2026-11-10", "2026-11-10"), 0);
  assert.equal(isOverdue("open", "2026-11-10", "2026-11-10"), false);
  assert.equal(isCarriedForward("open", "2026-11-10", "2026-11-10"), false);
});

test("done tasks are never overdue", () => {
  assert.equal(isOverdue("done", "2026-11-10", "2026-11-20"), false);
  assert.equal(isCarriedForward("done", "2026-11-10", "2026-11-20"), false);
});

test("week bounds are Monday through Sunday", () => {
  assert.deepEqual(weekBounds("2026-11-15"), {
    start: "2026-11-09",
    end: "2026-11-15",
  });
  assert.deepEqual(weekBounds("2026-11-16"), {
    start: "2026-11-16",
    end: "2026-11-22",
  });
});

test("closed this week uses the Kolkata calendar day", () => {
  assert.equal(
    closedThisWeek("done", "2026-11-12T10:00:00.000Z", "2026-11-15"),
    true,
  );
  assert.equal(
    closedThisWeek("done", "2026-11-08T10:00:00.000Z", "2026-11-15"),
    false,
  );
  assert.equal(closedThisWeek("done", null, "2026-11-15"), false);
  assert.equal(
    closedThisWeek("open", "2026-11-12T10:00:00.000Z", "2026-11-15"),
    false,
  );
});
