import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCodexObserved } from "./codex-runner.js";
import type { ActivityEventInput } from "../types.js";

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  kill() { this.killed = true; return true; }
}

test("runner launches JSONL Codex without a shell and returns observed actions", async () => {
  const child = new FakeChild();
  const events: ActivityEventInput[] = [];
  let invocation: { command: string; args: string[]; options: unknown } | undefined;
  const done = runCodexObserved({ repoRoot: "C:/work/repo", prompt: "Inspect project", sessionId: "session-1", emit: (event) => { events.push(event); }, spawnProcess: (command, args, options) => { invocation = { command, args, options }; return child; } });
  child.stdout.write('{"type":"thread.started","thread_id":"remote"}\n');
  child.stdout.write('{"type":"item.completed","item":{"type":"command_execution","exit_code":0,"status":"completed"}}\n');
  child.emit("close", 0);
  assert.deepEqual(await done, { exitCode: 0, cancelled: false });
  assert.deepEqual(invocation, { command: "codex", args: ["exec", "--json", "-C", "C:/work/repo", "--", "Inspect project"], options: { cwd: "C:/work/repo", shell: false, stdio: ["ignore", "pipe", "pipe"] } });
  assert.deepEqual(events.map(({ kind, phase }) => [kind, phase]), [["session", "started"], ["tool", "completed"]]);
});

test("runner reports nonzero exit without stderr contents", async () => {
  const child = new FakeChild();
  const events: ActivityEventInput[] = [];
  const done = runCodexObserved({ repoRoot: "C:/work/repo", prompt: "Inspect", sessionId: "session-1", emit: (event) => { events.push(event); }, spawnProcess: () => child });
  child.stderr.write("API_KEY=secret\n");
  child.emit("close", 2);
  assert.deepEqual(await done, { exitCode: 2, cancelled: false });
  assert.deepEqual(events.map(({ kind, phase, title }) => [kind, phase, title]), [["error", "failed", "Codex process exited with code 2"]]);
  assert.equal(JSON.stringify(events).includes("secret"), false);
});

test("runner handles process error and abort", async () => {
  const errorChild = new FakeChild();
  const errors: ActivityEventInput[] = [];
  const failed = runCodexObserved({ repoRoot: "C:/work/repo", prompt: "Inspect", sessionId: "session-1", emit: (event) => { errors.push(event); }, spawnProcess: () => errorChild });
  errorChild.emit("error", new Error("secret spawn failure"));
  assert.deepEqual(await failed, { exitCode: null, cancelled: false });
  assert.equal(errors[0]?.title, "Codex process could not start");
  assert.equal(JSON.stringify(errors).includes("secret"), false);

  const controller = new AbortController();
  const abortChild = new FakeChild();
  const cancelledEvents: ActivityEventInput[] = [];
  const cancelled = runCodexObserved({ repoRoot: "C:/work/repo", prompt: "Inspect", sessionId: "session-2", signal: controller.signal, emit: (event) => { cancelledEvents.push(event); }, spawnProcess: () => abortChild });
  controller.abort();
  assert.equal(abortChild.killed, true);
  abortChild.emit("close", null);
  assert.deepEqual(await cancelled, { exitCode: null, cancelled: true });
  assert.equal(cancelledEvents.at(-1)?.title, "Codex session cancelled");
});

test("runner waits for asynchronous collector delivery in event order", async () => {
  const child = new FakeChild();
  const delivered: string[] = [];
  const done = runCodexObserved({ repoRoot: "C:/work/repo", prompt: "Inspect", sessionId: "session-1", emit: async (event) => {
    if (event.title === "Codex session started") await new Promise((resolve) => setTimeout(resolve, 15));
    delivered.push(event.title);
  }, spawnProcess: () => child });
  child.stdout.write('{"type":"thread.started"}\n{"type":"turn.completed"}\n');
  child.emit("close", 0);
  await done;
  assert.deepEqual(delivered, ["Codex session started", "Codex turn completed"]);
});

test("teach mode appends note instruction to explicit task and emits validated note", async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "walkthrough-codex-runner-note-"));
  writeFileSync(join(repoRoot, "entry.ts"), "export const ready = true;\n");
  try {
  const child = new FakeChild();
  const events: ActivityEventInput[] = [];
  let task = "";
  const done = runCodexObserved({ repoRoot, prompt: "Inspect project", sessionId: "session-1", teach: true,
    emit: (event) => { events.push(event); }, spawnProcess: (_command, args) => { task = args.at(-1) ?? ""; return child; } });
  assert.ok(task.startsWith("Inspect project\n"));
  assert.match(task, /WALKTHROUGH_NOTE:/);
  child.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Done.\nWALKTHROUGH_NOTE: entry.ts | Entry point sets ready." } }) + "\n");
  child.stdout.write('{"type":"turn.completed"}\n');
  child.emit("close", 0);
  await done;
  assert.deepEqual(events.map(({ kind, title, path, detail }) => [kind, title, path, detail]), [
    ["message", "Teaching note", "entry.ts", "Entry point sets ready."],
    ["session", "Codex turn completed", undefined, undefined],
  ]);
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});
