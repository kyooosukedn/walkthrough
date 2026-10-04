import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTeachingNote } from "./teaching-note.js";

test("accepts only a marked, bounded note linked to an existing repo file", () => {
  const root = mkdtempSync(join(tmpdir(), "walkthrough-teaching-note-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "app.ts"), "export const ready = true;\n");
    const reply = "I finished the task.\nWALKTHROUGH_NOTE: src/app.ts | This file supplies the ready flag used at startup.";
    assert.deepEqual(parseTeachingNote(reply, root), { path: "src/app.ts", detail: "This file supplies the ready flag used at startup." });
    assert.equal(parseTeachingNote("I finished the task.", root), null);
    assert.equal(parseTeachingNote("WALKTHROUGH_NOTE: src/app.ts | " + "x".repeat(601), root), null);
    assert.equal(parseTeachingNote("WALKTHROUGH_NOTE: src/app.ts | API_KEY=private", root), null);
    assert.equal(parseTeachingNote("WALKTHROUGH_NOTE: src/app.ts | Quoted example.\nMy actual answer has no note.", root), null);
    assert.equal(parseTeachingNote("```\nWALKTHROUGH_NOTE: src/app.ts | Quoted example.\n```", root), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects foreign, missing, secret, and symlink-aliased files", () => {
  const root = mkdtempSync(join(tmpdir(), "walkthrough-teaching-note-"));
  const outside = mkdtempSync(join(tmpdir(), "walkthrough-teaching-outside-"));
  try {
    writeFileSync(join(root, "safe.ts"), "export {};");
    writeFileSync(join(root, ".env"), "SECRET=private");
    writeFileSync(join(root, "image.png"), Buffer.from([0, 1, 2]));
    writeFileSync(join(root, "huge.ts"), "x".repeat(512 * 1024 + 1));
    writeFileSync(join(root, "invalid.ts"), Buffer.from([0xff]));
    writeFileSync(join(outside, "foreign.ts"), "export {};");
    symlinkSync(outside, join(root, "alias"), "junction");
    for (const path of ["../foreign.ts", ".env", "missing.ts", "alias/foreign.ts", "C:/outside.ts", "src\\safe.ts", "image.png", "huge.ts", "invalid.ts"]) {
      assert.equal(parseTeachingNote(`WALKTHROUGH_NOTE: ${path} | A claim.`, root), null, path);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
