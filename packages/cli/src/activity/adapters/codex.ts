import { isAbsolute, posix, win32 } from "node:path";
import { isSensitivePath } from "../../explain/context.js";
import { parseTeachingNote } from "../teaching-note.js";
import type { ActivityEventInput } from "../types.js";

const MAX_LINE_BYTES = 64 * 1024;
type JsonObject = Record<string, unknown>;

export interface CodexEventAdapter {
  write(chunk: Buffer | string): void;
  end(): void;
}

export interface CodexAdapterOptions {
  sessionId: string;
  repoRoot: string;
  teach?: boolean;
  emit(event: ActivityEventInput): void;
  now?: () => Date;
}

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function repoPath(value: unknown, repoRoot: string): string | undefined {
  if (typeof value !== "string" || !value || value.length > 1024) return undefined;
  const windows = /^[A-Za-z]:[\\/]/.test(value) || /^[A-Za-z]:[\\/]/.test(repoRoot);
  const path = windows ? win32 : posix;
  const root = path.resolve(repoRoot);
  const candidate = path.isAbsolute(value) ? value : path.resolve(root, value);
  const relative = path.relative(root, candidate).replace(/\\/g, "/");
  if (!relative || relative === ".." || relative.startsWith("../") || isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) return undefined;
  if (relative.split("/").some((part) => !part || part === "." || part === "..") || isSensitivePath(relative)) return undefined;
  return relative;
}

/** Normalize documented `codex exec --json` events. Raw commands, output, prompts, and model text never leave this boundary. */
export function createCodexEventAdapter({ sessionId, repoRoot, teach = false, emit, now = () => new Date() }: CodexAdapterOptions): CodexEventAdapter {
  const decoder = new TextDecoder();
  let pending = "";
  let pendingBytes = 0;
  let discarding = false;
  let pendingNote: { path: string; detail: string } | null = null;
  const send = (kind: ActivityEventInput["kind"], phase: ActivityEventInput["phase"], title: string, path?: string, detail?: string) => {
    emit({ version: 1, sessionId, at: now().toISOString(), host: "codex", kind, phase, title, ...(path && { path }), ...(detail && { detail }) });
  };
  const line = (raw: string) => {
    if (!raw.trim() || Buffer.byteLength(raw) > MAX_LINE_BYTES) return;
    let parsed: JsonObject | undefined;
    try { parsed = object(JSON.parse(raw)); } catch { return; }
    if (!parsed) return;
    const item = object(parsed.item);
    switch (parsed.type) {
      case "thread.started":
        pendingNote = null;
        send("session", "started", "Codex session started");
        return;
      case "turn.completed":
        if (pendingNote) send("message", "completed", "Teaching note", pendingNote.path, pendingNote.detail);
        pendingNote = null;
        send("session", "completed", "Codex turn completed");
        return;
      case "turn.failed":
        pendingNote = null;
        send("error", "failed", "Codex turn failed");
        return;
      case "item.completed":
        if (!item) return;
        if (item.type === "command_execution") {
          const failed = item.status === "failed" || (typeof item.exit_code === "number" && item.exit_code !== 0);
          send("tool", failed ? "failed" : "completed", failed ? "Command failed" : "Command completed", undefined,
            Number.isSafeInteger(item.exit_code) ? `Exit code ${item.exit_code}` : undefined);
        } else if (item.type === "file_change" && Array.isArray(item.changes)) {
          for (const change of item.changes) {
            const path = repoPath(object(change)?.path, repoRoot);
            if (path) send("file", item.status === "failed" ? "failed" : "completed", item.status === "failed" ? "File change failed" : "File changed", path);
          }
        } else if (item.type === "mcp_tool_call" || item.type === "web_search") {
          const failed = item.status === "failed";
          send("tool", failed ? "failed" : "completed", failed ? "Tool failed" : "Tool completed");
        } else if (teach && item.type === "agent_message" && typeof item.text === "string") {
          pendingNote = parseTeachingNote(item.text, repoRoot);
        }
        return;
      default:
        return;
    }
  };
  const consume = (chunk: string) => {
    for (const char of chunk) {
      if (char === "\n") {
        if (!discarding) line(pending.endsWith("\r") ? pending.slice(0, -1) : pending);
        pending = "";
        pendingBytes = 0;
        discarding = false;
      } else if (!discarding) {
        pending += char;
        pendingBytes += Buffer.byteLength(char);
        if (pendingBytes > MAX_LINE_BYTES) { pending = ""; pendingBytes = 0; discarding = true; }
      }
    }
  };
  return {
    write(chunk) { consume(decoder.decode(typeof chunk === "string" ? Buffer.from(chunk) : chunk, { stream: true })); },
    end() { consume(decoder.decode()); if (!discarding) line(pending); pending = ""; pendingBytes = 0; discarding = false; },
  };
}
