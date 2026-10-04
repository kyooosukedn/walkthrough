# Live agent activity: proposed design

## User outcome

While Claude Code or Codex works on a repository, Walkthrough shows what the agent has done, which files it touched, whether commands passed, and how each action relates to the code. A beginner can open the affected file and follow along. The feed must distinguish observed facts from the agent's own explanation. It cannot expose private model reasoning.

## First release

The user explicitly starts an observed session from a local checkout. Walkthrough opens a browser activity view and connects it to one agent session. The first visible slice is Claude Code tool events; the Codex CLI adapter follows through the same event contract. Attaching to an arbitrary existing Codex Desktop chat is outside this release until a supported event source is verified.

An activity card shows time, host, action, status, short factual summary, and a source-file link when available. File changes open the existing read-only source preview. A diff is shown only when the host supplies a reliable per-action diff; otherwise the UI labels the file as its current contents. Agent-authored text is labeled "Agent said". Walkthrough's own summaries are labeled "Observed" and may say only what the event proves.

No DeepSeek key or other separate model API is required. This release gives live, evidence-backed narration of actions; a later release can ask the host agent for richer teaching notes at milestones. Walkthrough neither runs commands in the target repository nor sends events to a hosted service. The observed agent performs its normal work.

## Event boundary

Adapters normalize host-specific data into versioned events:

```ts
type ActivityEvent = {
  version: 1;
  sessionId: string;
  sequence: number;
  at: string;
  host: "claude" | "codex";
  kind: "session" | "tool" | "file" | "message" | "error";
  phase: "started" | "completed" | "failed";
  title: string;
  path?: string;       // repo-relative, verified inside checkout
  detail?: string;     // bounded, sanitized, source-backed
};
```

The local CLI receives events on loopback, retains a bounded in-memory timeline, and streams it to the browser. Collection is opt-in for each session. Hook posts use a bearer token; the same-origin browser stream uses a short-lived, HttpOnly, SameSite cookie so a token need not appear in a URL. The collector rejects events without a valid session token, from the wrong checkout, or over its size limit. It never stores raw prompts, full environment variables, or unbounded tool output. Common secret paths use the existing source filter; sensitive content in ordinary files still needs conservative display rules.

## Host adapters

- Claude Code: use plugin hooks for session and tool lifecycle. Official [hook documentation](https://code.claude.com/docs/en/hooks.md) describes `SessionStart`, `PostToolUse`, `PostToolUseFailure`, and `Stop`, with JSON input on stdin or HTTP. Hook forwarding must finish quickly and must never block normal agent work if Walkthrough is closed. Check the installed Claude version before relying on newer fields such as per-action Bash diffs or streaming message hooks.
- Codex CLI: observe a session started with `codex exec --json`. Official [CLI reference](https://developers.openai.com/codex/cli/reference.md) says the flag emits newline-delimited JSON events. Treat event shapes as a versioned adapter boundary and fixture-test against the installed CLI. This does not imply access to arbitrary Codex Desktop sessions.

## Success check

In a small fixture repo, the user starts an observed Claude session, sees a file edit and a passing or failing command in order, opens the touched file, and can tell which text came from observed events versus the agent. The same fixture can later run through the Codex CLI adapter. Closing the browser does not break the agent; reconnecting shows retained in-memory events while the collector runs.
