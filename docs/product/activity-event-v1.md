# Local activity event contract, version 1

Walkthrough records actions from one explicitly started Claude Code or Codex CLI session. This contract describes observed host events. It does not expose private model reasoning or ask an AI provider to explain code. Host adapters must omit prompts, environment variables, full tool output, secrets, and raw source text.

## Adapter to collector

Send `POST /activity/events` to the loopback server with `Content-Type: application/json` and `Authorization: Bearer <session-token>`. The JSON body has these fields:

```ts
interface ActivityEventInput {
  version: 1;
  sessionId: string; // 1–128 letters, digits, underscores, hyphens
  at: string;        // UTC ISO timestamp, e.g. 2026-10-04T12:00:00.000Z
  host: "claude" | "codex";
  kind: "session" | "tool" | "file" | "message" | "error";
  phase: "started" | "completed" | "failed";
  title: string;     // 1–200 characters, single line
  path?: string;     // existing repo-relative file, forward slashes
  detail?: string;   // 1–2,000 characters, single line
}
```

`message` is agent-authored text and must appear as **Agent said**. Other kinds describe host-observed actions and appear as **Observed**. Do not turn a tool event into a claim about why the agent acted. For a file event, `path` is optional; when omitted, show no source link. Existing source preview may impose further restrictions on which validated paths it can open.

The body limit is 8,192 bytes. Unknown fields are rejected, except `sequence`: if an adapter sends it, the collector ignores it. The collector validates the exact enum values and text limits, blocks common secret patterns in `title` and `detail`, and rejects missing, absolute, traversal, secret-looking, or symlink-escaped paths. Files must exist inside the checkout at ingestion. Validation is intentionally conservative, but adapters must still avoid sensitive content in ordinary strings; this filter cannot classify every secret.

The successful response is HTTP 201 with `ActivityEvent`, which is the input plus a collector-assigned, monotonically increasing `sequence`. One collector instance accepts only the first authenticated `sessionId` it sees; subsequent different session IDs receive HTTP 400. HTTP 401 means bad bearer token. HTTP 413 means oversized body.

## Browser stream

Before loading the same-origin activity view, the integrator calls `collector.viewerCookie()` and adds its value as `Set-Cookie` on the viewer HTML response. The cookie is HttpOnly, SameSite=Strict, scoped to `/activity/stream`, and expires after one hour. It is separate from the hook bearer token. Neither token belongs in a URL, browser JavaScript, or the page source.

The browser opens `new EventSource("/activity/stream")`. `GET /activity/stream` requires the viewer cookie and responds with `text/event-stream`. Each frame is:

```text
id: 2
event: activity
data: {"version":1,"sessionId":"...","sequence":2,...}

```

On initial connection the collector replays retained events. On reconnect, EventSource sends `Last-Event-ID`; the collector replays retained events with greater sequence numbers. An invalid or absent ID replays all retained events. The store retains only the newest `maxEvents` events in memory; old events cannot be recovered after eviction or process exit. The panel should deduplicate by `sequence` and show a gap if its last seen sequence is older than the first retained event.

The collector exports:

```ts
createActivityStore({ maxEvents: number }): ActivityStore
// ActivityStore: append(input), replay(afterSequence?), subscribe(listener)

createActivityCollector({ repoRoot, token, store }): ActivityCollector
// ActivityCollector: handler (Node RequestListener), viewerCookie(), close()
```

The integrator mounts `handler` on a server bound to `127.0.0.1` and routes `/activity/events` and `/activity/stream` to it. The handler also checks the local Host, peer address, and browser Origin. `close()` ends active streams when the observed session shuts down. Hook failures must never block Claude or Codex work.
