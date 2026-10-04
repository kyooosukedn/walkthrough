export interface ActivityEventInput {
  version: 1;
  sessionId: string;
  at: string;
  host: "claude" | "codex";
  kind: "session" | "tool" | "file" | "message" | "error";
  phase: "started" | "completed" | "failed";
  title: string;
  path?: string;
  detail?: string;
}

export interface ActivityEvent extends ActivityEventInput {
  /** Collector-owned monotonic number. Adapters never assign it. */
  sequence: number;
}
