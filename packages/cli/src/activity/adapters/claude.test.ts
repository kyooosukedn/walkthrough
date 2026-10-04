import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { normalizeClaudeHook } from "./claude.js";

const root = join(process.cwd(), "fixture-repo");
const base = { session_id: "abc-123", cwd: root };
const normalize = (value: Record<string, unknown>) => normalizeClaudeHook({ ...base, ...value }, root, "2026-10-04T12:00:00.000Z");

test("session lifecycle reports only observed state", () => {
  assert.deepEqual(normalize({ hook_event_name: "SessionStart", source: "startup", prompt: "private" }), {
    version: 1, sessionId: "abc-123", at: "2026-10-04T12:00:00.000Z", host: "claude", kind: "session", phase: "started", title: "Claude session started",
  });
  assert.equal(normalize({ hook_event_name: "Stop", last_assistant_message: "private" })?.title, "Claude response completed");
  assert.equal(normalize({ hook_event_name: "SessionStart", source: "resume" })?.title, "Claude session resumed");
  assert.equal(normalize({ hook_event_name: "SessionStart", source: "compact" })?.title, "Claude session continued after compaction");
});

test("file edit emits repo-relative path but never source content", () => {
  const result = normalize({ hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: join(root, "src", "main.ts"), old_string: "secret", new_string: "private" }, tool_response: { type: "update" } });
  assert.deepEqual(result, { version: 1, sessionId: "abc-123", at: "2026-10-04T12:00:00.000Z", host: "claude", kind: "file", phase: "completed", title: "Edited file", path: "src/main.ts" });
  assert.equal(normalize({ hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: join(root, ".env"), content: "secret" } })?.path, undefined);
  assert.equal(normalize({ hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: join(root, "..", "outside.ts") } })?.path, undefined);
  assert.equal(normalize({ hook_event_name: "PostToolUseFailure", tool_name: "Write", tool_input: { file_path: join(root, "src", "missing.ts") } })?.path, undefined);
});

test("commands show outcome without forwarding command or output", () => {
  const good = normalize({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "echo API_KEY=private" }, tool_response: { stdout: "private", stderr: "" } });
  assert.equal(good?.phase, "completed");
  assert.equal(good?.title, "Shell command completed");
  assert.ok(!JSON.stringify(good).includes("private"));
  const bad = normalize({ hook_event_name: "PostToolUseFailure", tool_name: "PowerShell", tool_input: { command: "npm test" }, error: "Exit code 7\nAPI_KEY=private" });
  assert.equal(bad?.phase, "failed");
  assert.equal(bad?.detail, "Exit code 7");
  assert.ok(!JSON.stringify(bad).includes("private"));
});

test("unknown tools have generic names and malformed sessions are dropped", () => {
  assert.equal(normalize({ hook_event_name: "PostToolUse", tool_name: "mcp__private", tool_input: { prompt: "secret" } })?.title, "Tool completed");
  assert.equal(normalize({ hook_event_name: "PostToolUseFailure", tool_name: "mcp__private", error: "secret" })?.title, "Tool failed");
  assert.equal(normalize({ hook_event_name: "PostToolUse", tool_name: "Bash", session_id: "unsafe/session" }), null);
  assert.equal(normalize({ hook_event_name: "PreToolUse", tool_name: "Bash" }), null);
});
