import assert from "node:assert/strict";
import test from "node:test";
import { planSmartBalance } from "./team.ts";

const t = (id: string, title: string, brand: "skybox" | "stays" | "fh" | "braj" | null = null) => ({ id, title, brand, note: "" });
const owner = (plan: ReturnType<typeof planSmartBalance>, id: string) => plan.find((row) => row.taskId === id)?.personId;

test("routes tasks to the department that does that work", () => {
  const plan = planSmartBalance(
    [
      t("blender", "Install Blender software and prepare for 3D rendering work"),
      t("import", "Coordinate foreign client requirements and import logistics"),
      t("layout", "Finish Skybox sorting and pending layouts", "skybox"),
      t("enq", "Reply to new enquiries from the website", "skybox"),
      t("fhlead", "Follow up F&H leads from the expo", "fh"),
      t("auto", "Set up WhatsApp automation for the CRM"),
    ],
    { shrishti: 3, debo: 3, mayank: 1, "hari-om": 4, intikhab: 1, siddhant: 2, gaurav: 3, megha: 1 },
  );
  assert.equal(owner(plan, "blender"), "debo");
  assert.equal(owner(plan, "import"), "gaurav");
  assert.equal(owner(plan, "layout"), "intikhab");
  assert.equal(owner(plan, "enq"), "siddhant");
  assert.equal(owner(plan, "fhlead"), "megha");
  assert.equal(owner(plan, "auto"), "hari-om");
});

test("the director only gets approvals and money decisions", () => {
  const plan = planSmartBalance(
    [t("ok", "Approve the Q1 marketing budget"), t("misc", "Tidy the shared drive folders")],
    { abhay: 0, "hari-om": 2 },
  );
  assert.equal(owner(plan, "ok"), "abhay");
  assert.notEqual(owner(plan, "misc"), "abhay");
});

test("routine marketing work goes to the intern when the head is busier", () => {
  const plan = planSmartBalance([t("post", "Schedule and post the Instagram carousel", "skybox")], { shrishti: 5, mayank: 1 });
  assert.equal(owner(plan, "post"), "mayank");
});

test("strategy stays with the head, not the intern", () => {
  const plan = planSmartBalance([t("plan", "Marketing strategy for the North Delhi campaign")], { shrishti: 5, mayank: 0 });
  assert.equal(owner(plan, "plan"), "shrishti");
});

test("unclear tasks go to the project head to route", () => {
  const plan = planSmartBalance([t("x", "Misc pending item from Monday")], { "hari-om": 2 });
  assert.equal(owner(plan, "x"), "hari-om");
  assert.match(plan[0].reason, /project head/);
});

test("people missing from the roster are skipped", () => {
  const plan = planSmartBalance([t("v", "Edit the walkthrough video")], {}, undefined, new Set(["hari-om", "shrishti"]));
  assert.notEqual(owner(plan, "v"), "debo");
});

test("a name in brackets or before a colon decides the owner", () => {
  const plan = planSmartBalance(
    [t("m", "Complete dashboard update and region view by next Monday (Madhav)"), t("g", "Gaurav: share Woodman costing")],
    { debo: 9, gaurav: 9, "hari-om": 0 },
  );
  assert.equal(owner(plan, "m"), "debo");
  assert.equal(owner(plan, "g"), "gaurav");
});
