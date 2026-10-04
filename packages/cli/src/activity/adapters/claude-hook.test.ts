import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Claude hook emits teaching context and forwards only a validated Stop note", async () => {
  const repo = mkdtempSync(join(tmpdir(), "walkthrough-hook-"));
  const received: unknown[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    received.push(JSON.parse(body));
    res.writeHead(201); res.end();
  });
  try {
    writeFileSync(join(repo, "main.ts"), "export const ready = true;");
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const script = resolve(import.meta.dirname, "../../../scripts/claude-hook.mjs");
    const run = (input: unknown, teach: boolean) => new Promise<string>((done, fail) => {
      const child = spawn(process.execPath, [script], { env: { ...process.env, CLAUDE_PROJECT_DIR: repo, WALKTHROUGH_ACTIVITY_URL: `http://127.0.0.1:${address.port}`, WALKTHROUGH_ACTIVITY_TOKEN: "test-token", WALKTHROUGH_TEACH: teach ? "1" : "0" }, stdio: ["pipe", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.on("error", fail);
      child.on("close", (code) => code === 0 ? done(output) : fail(new Error(`Hook exited ${code}`)));
      child.stdin.end(JSON.stringify(input));
    });
    const start = { session_id: "test-session", hook_event_name: "SessionStart", source: "startup" };
    assert.equal(await run(start, false), "");
    const context = JSON.parse(await run(start, true));
    assert.equal(context.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(context.hookSpecificOutput.additionalContext, /WALKTHROUGH_NOTE:/);
    const stop = { session_id: "test-session", hook_event_name: "Stop", last_assistant_message: "Done.\nWALKTHROUGH_NOTE: main.ts | This file defines the startup flag." };
    assert.equal(await run(stop, false), "");
    assert.equal(await run(stop, true), "");
    assert.equal(received.length, 5);
    assert.deepEqual(received.map((event) => (event as { kind: string }).kind), ["session", "session", "session", "session", "message"]);
    assert.equal((received[4] as { detail: string }).detail, "This file defines the startup flag.");
    assert.ok(!JSON.stringify(received).includes("Done."));
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(repo, { recursive: true, force: true });
  }
});
