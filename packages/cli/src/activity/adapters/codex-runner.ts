import { spawn, type SpawnOptions } from "node:child_process";
import type { Readable } from "node:stream";
import { createCodexEventAdapter } from "./codex.js";
import type { ActivityEventInput } from "../types.js";

export interface CodexProcess {
  stdout: Readable | null;
  stderr: Readable | null;
  on(event: "close", listener: (code: number | null) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface CodexRunnerOptions {
  repoRoot: string;
  prompt: string;
  sessionId: string;
  emit(event: ActivityEventInput): void | Promise<void>;
  signal?: AbortSignal;
  codexBin?: string;
  execArgs?: string[];
  spawnProcess?: (command: string, args: string[], options: SpawnOptions) => CodexProcess;
}

export interface CodexRunResult {
  exitCode: number | null;
  cancelled: boolean;
}

/** Start only the explicitly requested CLI session; collector delivery is supplied by the caller. */
export function runCodexObserved({ repoRoot, prompt, sessionId, emit, signal, codexBin = "codex", execArgs = [], spawnProcess = spawn }: CodexRunnerOptions): Promise<CodexRunResult> {
  let delivery = Promise.resolve();
  const safeEmit = (event: ActivityEventInput) => {
    delivery = delivery.then(() => emit(event)).then(() => {}, () => {});
  };
  const failure = (title: string): ActivityEventInput => ({ version: 1, sessionId, at: new Date().toISOString(), host: "codex", kind: "error", phase: "failed", title });
  if (signal?.aborted) {
    safeEmit(failure("Codex session cancelled"));
    return delivery.then(() => ({ exitCode: null, cancelled: true }));
  }
  return new Promise((resolve) => {
    let child: CodexProcess;
    try {
      child = spawnProcess(codexBin, ["exec", "--json", "-C", repoRoot, ...execArgs, "--", prompt], { cwd: repoRoot, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      safeEmit(failure("Codex process could not start"));
      void delivery.then(() => resolve({ exitCode: null, cancelled: false }));
      return;
    }
    let cancelled = false;
    let settled = false;
    let sawError = false;
    const adapter = createCodexEventAdapter({ repoRoot, sessionId, emit: (event) => {
      if (event.kind === "error") sawError = true;
      safeEmit(event);
    } });
    const onAbort = () => { cancelled = true; child.kill(); };
    const finish = (exitCode: number | null, processError = false) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      adapter.end();
      if (cancelled) safeEmit(failure("Codex session cancelled"));
      else if (processError) safeEmit(failure("Codex process could not start"));
      else if (exitCode !== 0 && !sawError) safeEmit(failure(exitCode === null ? "Codex process exited unexpectedly" : `Codex process exited with code ${exitCode}`));
      void delivery.then(() => resolve({ exitCode, cancelled }));
    };
    child.stdout?.on("data", (chunk: Buffer | string) => adapter.write(chunk));
    child.stderr?.resume(); // Drain stderr, but never expose raw progress or errors.
    child.on("error", () => finish(null, true));
    child.on("close", (code) => finish(code));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
