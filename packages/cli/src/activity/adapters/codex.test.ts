import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("teach mode emits latest safe completed agent message before turn completion", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "walkthrough-codex-note-"));
  try {
    writeFileSync(join(repoRoot, "entry.ts"), "export const ready = true;\n");
    const events: ActivityEventInput[] = [];
    const adapter = createCodexEventAdapter({ sessionId: "session-1", repoRoot, teach: true, emit: (event) => { events.push(event); } });
    adapter.write(JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: "WALKTHROUGH_NOTE: entry.ts | private thought" } }) + "\n");
    adapter.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "WALKTHROUGH_NOTE: entry.ts | First visible answer." } }) + "\n");
    adapter.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Summary\nWALKTHROUGH_NOTE: entry.ts | Entry point sets ready." } }) + "\n");
    assert.equal(events.length, 0);
    adapter.write('{"type":"turn.completed"}\n');
    adapter.write('{"type":"turn.completed"}\n');
    assert.deepEqual(events.map(({ kind, title, path, detail }) => ({ kind, title, path, detail })), [
      { kind: "message", title: "Teaching note", path: "entry.ts", detail: "Entry point sets ready." },
      { kind: "session", title: "Codex turn completed", path: undefined, detail: undefined },
      { kind: "session", title: "Codex turn completed", path: undefined, detail: undefined },
    ]);
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});

test("teach mode never emits marked reasoning or messages from failed turns", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "walkthrough-codex-note-"));
  try {
    writeFileSync(join(repoRoot, "entry.ts"), "export const ready = true;\n");
    const events: ActivityEventInput[] = [];
    const adapter = createCodexEventAdapter({ sessionId: "session-1", repoRoot, teach: true, emit: (event) => { events.push(event); } });
    adapter.write(JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: "WALKTHROUGH_NOTE: entry.ts | private" } }) + "\n");
    adapter.write('{"type":"turn.completed"}\n');
    adapter.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "WALKTHROUGH_NOTE: entry.ts | Should be discarded." } }) + "\n");
    adapter.write('{"type":"turn.failed"}\n{"type":"turn.completed"}\n');
    assert.deepEqual(events.map(({ kind, title }) => ({ kind, title })), [
      { kind: "session", title: "Codex turn completed" },
      { kind: "error", title: "Codex turn failed" },
      { kind: "session", title: "Codex turn completed" },
    ]);
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});

test("teach mode discards an earlier note when the final agent message has none", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "walkthrough-codex-note-"));
  try {
    writeFileSync(join(repoRoot, "entry.ts"), "export const ready = true;\n");
    const events: ActivityEventInput[] = [];
    const adapter = createCodexEventAdapter({ sessionId: "session-1", repoRoot, teach: true, emit: (event) => { events.push(event); } });
    adapter.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "WALKTHROUGH_NOTE: entry.ts | Early claim." } }) + "\n");
    adapter.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Final answer without a note." } }) + "\n");
    adapter.write('{"type":"turn.completed"}\n');
    assert.deepEqual(events.map(({ kind, title }) => ({ kind, title })), [{ kind: "session", title: "Codex turn completed" }]);
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});
