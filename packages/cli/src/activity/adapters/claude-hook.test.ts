import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createActivityCollector } from "../collector.js";
import { createActivityStore } from "../store.js";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "../../../scripts/claude-hook.mjs");
const hook = (event: string, extra: Record<string, unknown> = {}) => ({ session_id: "abc-123", hook_event_name: event, ...extra });

async function run(payload: unknown, env: Record<string, string | undefined>) {
  const child = spawn(process.execPath, [script], { env: { ...process.env, WALKTHROUGH_ACTIVITY_URL: "", WALKTHROUGH_ACTIVITY_TOKEN: "", ...env }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  child.stdin.end(JSON.stringify(payload));
  const exit = await new Promise<number | null>((done) => child.on("exit", (code) => done(code)));
  return { exit, stdout, stderr };
}

test("hook is inert without observer and succeeds when collector is unavailable", async () => {
  assert.deepEqual(await run(hook("SessionStart"), {}), { exit: 0, stdout: "", stderr: "" });
  assert.deepEqual(await run(hook("SessionStart"), { WALKTHROUGH_ACTIVITY_URL: "http://127.0.0.1:1", WALKTHROUGH_ACTIVITY_TOKEN: "test-token" }), { exit: 0, stdout: "", stderr: "" });
});

test("hook forwards ordered safe events to the authenticated collector", async () => {
  const root = await mkdtemp(join(tmpdir(), "walkthrough-claude-hook-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "main.ts"), "export const x = 1;\n");
  const store = createActivityStore({ maxEvents: 8 });
  const collector = createActivityCollector({ repoRoot: root, token: "test-token", store });
  const server = createServer(collector.handler);
  try {
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const env = { CLAUDE_PROJECT_DIR: root, WALKTHROUGH_ACTIVITY_URL: `http://127.0.0.1:${address.port}`, WALKTHROUGH_ACTIVITY_TOKEN: "test-token" };
    for (const input of [hook("SessionStart", { source: "startup" }), hook("PostToolUse", { tool_name: "Edit", tool_input: { file_path: join(root, "src", "main.ts"), new_string: "private" } }), hook("PostToolUseFailure", { tool_name: "Bash", tool_input: { command: "echo private" }, error: "Exit code 1\nprivate" }), hook("Stop", { last_assistant_message: "private" })]) {
      assert.deepEqual(await run(input, env), { exit: 0, stdout: "", stderr: "" });
    }
    assert.deepEqual(store.replay().map((event) => [event.sequence, event.kind, event.phase]), [[1, "session", "started"], [2, "file", "completed"], [3, "tool", "failed"], [4, "session", "completed"]]);
    assert.ok(!JSON.stringify(store.replay()).includes("private"));
  } finally {
    collector.close();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});
