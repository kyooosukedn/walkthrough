import { test } from "node:test";
import assert from "node:assert/strict";
import { createCodexEventAdapter } from "./codex.js";
import type { ActivityEventInput } from "../types.js";

const root = "C:/work/repo";

test("Codex JSONL adapter handles split lines and maps completed actions without content", () => {
  const events: ActivityEventInput[] = [];
  const adapter = createCodexEventAdapter({ sessionId: "session-1", repoRoot: root, emit: (event) => { events.push(event); }, now: () => new Date("2026-10-04T12:00:00.000Z") });
  adapter.write('{"type":"thread.started","thread_id":"remote"}\n{"type":"item.completed","item":{"id":"item_1","type":"command_exec');
  adapter.write('ution","command":"cat .env","aggregated_output":"SECRET=value","exit_code":0,"status":"completed"}}\n');
  adapter.write('{"type":"item.completed","item":{"id":"item_2","type":"file_change","changes":[{"path":"C:/work/repo/src/main.ts","kind":"update"}],"status":"completed"}}\n');
  adapter.write('{"type":"turn.completed","usage":{"input_tokens":5}}\n');
  adapter.end();
  assert.deepEqual(events.map(({ kind, phase, title, path }) => ({ kind, phase, title, path })), [
    { kind: "session", phase: "started", title: "Codex session started", path: undefined },
    { kind: "tool", phase: "completed", title: "Command completed", path: undefined },
    { kind: "file", phase: "completed", title: "File changed", path: "src/main.ts" },
    { kind: "session", phase: "completed", title: "Codex turn completed", path: undefined },
  ]);
  assert.equal(JSON.stringify(events).includes("SECRET=value"), false);
  assert.equal(JSON.stringify(events).includes("cat .env"), false);
  assert.equal(JSON.stringify(events).includes("remote"), false);
});

test("Codex adapter skips malformed, oversized, and unsafe content then continues", () => {
  const events: unknown[] = [];
  const adapter = createCodexEventAdapter({ sessionId: "session-1", repoRoot: root, emit: (event) => { events.push(event); } });
  adapter.write('{bad}\n' + "x".repeat(70_000) + '\n');
  adapter.write('{"type":"item.completed","item":{"type":"file_change","changes":[{"path":"../escape.ts","kind":"update"},{"path":"C:/work/repo/.env","kind":"update"}],"status":"completed"}}\n');
  adapter.write('{"type":"item.completed","item":{"type":"command_execution","exit_code":1,"status":"failed"}}');
  adapter.end();
  assert.deepEqual((events as { kind: string; phase: string }[]).map(({ kind, phase }) => [kind, phase]), [["tool", "failed"]]);
});

test("Codex adapter marks failed turns and omits agent messages and reasoning", () => {
  const events: { kind: string; phase: string; title: string }[] = [];
  const adapter = createCodexEventAdapter({ sessionId: "session-1", repoRoot: root, emit: (event) => { events.push(event); } });
  adapter.write('{"type":"item.completed","item":{"type":"agent_message","text":"API_KEY=secret"}}\n');
  adapter.write('{"type":"item.completed","item":{"type":"reasoning","text":"private"}}\n');
  adapter.write('{"type":"turn.failed","error":{"message":"sensitive error"}}\n');
  assert.deepEqual(events.map(({ kind, phase, title }) => ({ kind, phase, title })), [{ kind: "error", phase: "failed", title: "Codex turn failed" }]);
});
