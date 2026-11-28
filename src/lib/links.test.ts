import assert from "node:assert/strict";
import test from "node:test";
import { cleanUrl, guessName } from "./links.ts";

test("only real https web addresses are accepted", () => {
  assert.equal(cleanUrl("not a link"), null);
  assert.equal(cleanUrl("hello"), null);
  assert.equal(cleanUrl("http://example.com/x"), null);
  assert.equal(cleanUrl("javascript:alert(1)"), null);
  assert.equal(cleanUrl(""), null);
  assert.equal(cleanUrl("drive.google.com/file/d/abc/view"), "https://drive.google.com/file/d/abc/view");
  assert.equal(cleanUrl("  https://docs.google.com/spreadsheets/d/x/edit  "), "https://docs.google.com/spreadsheets/d/x/edit");
});

test("links get a readable name", () => {
  assert.equal(guessName("https://docs.google.com/spreadsheets/d/x/edit"), "Google Sheet");
  assert.equal(guessName("https://docs.google.com/document/d/x/edit"), "Google Doc");
  assert.equal(guessName("https://drive.google.com/file/d/abc/view"), "Drive file");
  assert.equal(guessName("https://example.com/files/Brochure%20v2.pdf"), "Brochure v2.pdf");
});
