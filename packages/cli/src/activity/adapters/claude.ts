import { isAbsolute, relative, sep } from "node:path";
import { isSensitivePath } from "../../explain/context.js";
import type { ActivityEventInput } from "../types.js";

type HookInput = Record<string, unknown>;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safePath(value: unknown, repoRoot: string): string | undefined {
  if (typeof value !== "string" || !isAbsolute(value)) return undefined;
  const path = relative(repoRoot, value);
  if (!path || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) return undefined;
  const normalized = path.split(sep).join("/");
  if (normalized.length > 512 || isSensitivePath(normalized)) return undefined;
  return normalized;
}

/** Map Claude's hook JSON to the bounded, factual collector input. Never copy tool input/output text. */
export function normalizeClaudeHook(input: unknown, repoRoot: string, at = new Date().toISOString()): ActivityEventInput | null {
  const data = object(input);
  const sessionId = data.session_id;
  if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return null;
  const hook = data.hook_event_name;
  let kind: ActivityEventInput["kind"];
  let phase: ActivityEventInput["phase"];
  let title: string;
  let path: string | undefined;
  let detail: string | undefined;

  if (hook === "SessionStart") {
    if (data.source !== "startup" && data.source !== "resume" && data.source !== "compact") return null;
    kind = "session"; phase = "started";
    title = data.source === "resume" ? "Claude session resumed" : data.source === "compact" ? "Claude session continued after compaction" : "Claude session started";
  } else if (hook === "Stop") {
    kind = "session"; phase = "completed"; title = "Claude response completed";
  } else if (hook === "PostToolUse" || hook === "PostToolUseFailure") {
    const failed = hook === "PostToolUseFailure";
    phase = failed ? "failed" : "completed";
    const tool = data.tool_name;
    if (tool === "Write" || tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit") {
      kind = "file";
      title = failed ? "File edit failed" : "Edited file";
      if (!failed) path = safePath(object(data.tool_input).file_path, repoRoot);
    } else if (tool === "Bash" || tool === "PowerShell") {
      kind = "tool";
      title = failed ? "Shell command failed" : "Shell command completed";
      if (failed && typeof data.error === "string") {
        const code = /^Exit code (\d+)(?:\r?\n|$)/.exec(data.error)?.[1];
        if (code) detail = `Exit code ${code}`;
      }
    } else {
      kind = "tool";
      title = failed ? "Tool failed" : "Tool completed";
    }
  } else return null;

  return { version: 1, sessionId, at, host: "claude", kind, phase, title, ...(path && { path }), ...(detail && { detail }) };
}
