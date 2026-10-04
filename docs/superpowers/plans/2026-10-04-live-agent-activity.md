# Live agent activity implementation plan

**Status:** In progress in [draft PR #6](https://github.com/kyooosukedn/walkthrough/pull/6). The first release shows completed tool actions and changed files instead of a full transcript.

> **For agentic workers:** Use isolated worktrees and implement only the assigned task. Use `superpowers:executing-plans` or an equivalent test-first workflow. Do not revert another worker's edits.

**Goal:** Show a truthful, near-live account of Claude Code work in Walkthrough, then add Codex CLI through the same event boundary.

**Architecture:** A loopback collector accepts bounded normalized events, keeps them in memory, and streams them to a React activity panel. Claude plugin hooks and Codex CLI JSONL are separate adapters. The integration owner wires the panel into the existing app after the adapters and UI have stable interfaces.

**Tech stack:** Existing Node CLI, React/Vite visualizer, Claude Code hooks, Codex CLI `exec --json`, HTTP Server-Sent Events.

**Spec:** [`../specs/2026-10-04-live-agent-activity-design.md`](../specs/2026-10-04-live-agent-activity-design.md)

## Global constraints

- Observe only sessions the user starts for this feature; no background surveillance.
- No separate AI API key, cloud relay, raw prompt archive, or repository command execution by Walkthrough.
- Loopback-only collector; per-session token; bounded events and in-memory history.
- Every explanation distinguishes "Observed" from "Agent said". No claim to reveal private reasoning.
- Keep the existing browser scan, source preview, and DeepSeek flow working.
- Preserve the current uncommitted file-led journey and `.vibe-wise/` files. The orchestrator prepares a clean shared base before workers branch.

## Review focus

- Wrong checkout or absolute path: reject the event or omit its source link.
- Secret-looking path or output: do not surface it in the browser.
- Burst of hundreds of events: bounded memory and ordered sequence numbers.
- Browser disconnect/reconnect: agent keeps working; viewer recovers retained events.
- Hook or collector failure: Claude's normal operation continues.

## Work order

```text
Orchestrator: checkpoint current intended changes on a local branch
            ↓
Agent A: event contract + collector
            ↓
Agents B, C, D in separate worktrees, in parallel
  B Claude hooks    C activity panel    D Codex CLI adapter
            ↓
Orchestrator: integrate, test both hosts, document limits
```

Do not have agents edit the same checkout. Agent A's contract is the only input the parallel tasks share. Merge or cherry-pick one result at a time, run its tests, then continue. The existing working tree is dirty, so first checkpoint only intended project changes; leave `.vibe-wise/` untouched unless the user explicitly wants it included.

### Task A: event contract and local collector

**Owner:** `packages/cli/src/activity/types.ts`, `store.ts`, `collector.ts`, and their tests. May add `docs/product/activity-event-v1.md`. Do not edit `index.ts`, visualizer files, or plugin files.

**Produces:** `ActivityEvent` matching the spec; `createActivityStore({maxEvents})` with ordered replay; `createActivityCollector({repoRoot, token, store})` with authenticated `POST /activity/events` and `GET /activity/stream` endpoints. Hook posts use a bearer token. The same-origin browser stream uses an HttpOnly, SameSite session cookie; no token in the URL. SSE can replay retained events on connection. Define exact exports and wire format in `docs/product/activity-event-v1.md` before handing work to other agents.

**Checks:** Write failing Node tests for invalid token, oversized body, traversal/foreign path, ordering, memory cap, and reconnect. Make each pass. Run `npm run build:cli` and targeted Node tests. Commit only owned files.

**Acceptance:** A fixture client posts two safe events; a second client receives them in order after connecting later. No event outside the repo can produce a clickable source path.

### Task B: Claude Code adapter

**Owner:** `.claude-plugin/hooks/`, `packages/cli/src/activity/adapters/claude.ts`, a small hook-forwarding script under `packages/cli/scripts/`, and adapter tests. Do not edit collector, `index.ts`, or visualizer files.

**Consumes:** Task A's `ActivityEvent` and collector event endpoint. Read the current [Claude hooks reference](https://code.claude.com/docs/en/hooks.md) and verify the installed `claude --version`. Start with `SessionStart`, `PostToolUse`, `PostToolUseFailure`, and `Stop`; include `PreToolUse` only if it improves the visible state without duplicate cards. Map common file edits and command outcomes into factual summaries. Forward only when the observer session URL and token are present in the environment. If the collector is unavailable, exit successfully and quickly.

**Checks:** Fixture-test hook JSON for file edit, passing command, failed command, and unknown tool. Validate the plugin with `claude plugin validate .`. Test a local interactive Claude session against a fixture repo; capture proof that a hook failure does not stop Claude. Commit only owned files.

**Acceptance:** One observed Claude session produces a start event, ordered completed actions, and a stop event. No prompts or full environment variables appear in the event payload.

### Task C: activity panel

**Owner:** `packages/visualizer/src/activity/` and its tests/styles. Do not edit `App.tsx`, `TopBar.tsx`, CLI, or plugin files; the integrator owns those joins.

**Consumes:** Task A's documented event wire format and SSE replay behavior. Build a panel with a connection state, ordered timeline, status, host label, "Observed" versus "Agent said" label, and a callback for opening a repo-relative source path. If an event has no reliable per-action diff, say "Open current file" rather than showing a misleading diff. Keep keyboard and screen-reader access usable.

**Checks:** Use fixture events to test ordering, reconnect, unsafe path rendering, and source-link callback. Run visualizer tests, typecheck, and production build. Commit only owned files.

**Acceptance:** A beginner can answer what action completed, whether it succeeded, and which file to inspect without reading raw JSON.

### Task D: Codex CLI adapter

**Owner:** `packages/cli/src/activity/adapters/codex.ts`, `codex-runner.ts`, and tests. Do not edit collector, `index.ts`, visualizer, or plugin files.

**Consumes:** Task A's `ActivityEvent`. Parse newline-delimited events from a `codex exec --json` child process. [Official Codex CLI documentation](https://developers.openai.com/codex/cli/reference.md) establishes the JSONL output; use fixtures captured from the installed CLI for exact event shapes. Handle a split JSONL line, malformed line, nonzero exit, and cancellation. Do not parse colored terminal text or private session storage. No Codex Desktop claim.

**Checks:** Write parser tests first, then test the runner against a fake child process. Run targeted Node tests and CLI build. Commit only owned files.

**Acceptance:** A CLI-run Codex task yields the same timeline event types as Claude, with clear gaps when the host emits less detail.

### Task E: integration and release check

**Owner:** Orchestrator only. Wire the collector and host launch commands in `packages/cli/src/index.ts`; connect the activity panel in `packages/visualizer/src/App.tsx` and `ui/TopBar.tsx`; update README and `docs/AGENT_COMPANION.md`. Resolve interface mismatches without overwriting agent work.

**User flow:** `walkthrough observe <repo> --host claude` starts a loopback viewer and an interactive Claude Code session with the local plugin; `walkthrough observe <repo> --host codex --prompt "<task>"` observes a Codex CLI run. The second command is explicitly non-interactive because `codex exec --json` is. The activity view appears only for observed sessions; ordinary `walkthrough <repo>` keeps its current behavior.

**Checks:** Run `npm run build`, `npm run typecheck`, and `npm test`; validate the Claude plugin. Do one end-to-end fixture run per host. Confirm source preview and browser Explain still work. Document that existing Codex Desktop chats cannot be attached in this release and that observation is limited to host-emitted events.

**Release gate:** Demo a Claude file edit and test result in the browser before merging Codex support. If the Claude path is unreliable, fix it before expanding the feature. No npm publish or push is part of this plan.

## Paste-ready Claude assignments

Send A first. After A's contract is reviewed and merged into the shared base, start B, C, and D from that same commit in separate worktrees. The prompts below point each agent to this plan and the spec; they do not authorize work outside the named files.

**Agent A**

> In `walkthrough`, implement Task A in `docs/superpowers/plans/2026-10-04-live-agent-activity.md`. Read its linked spec first. You own only `packages/cli/src/activity/types.ts`, `store.ts`, `collector.ts`, their tests, and `docs/product/activity-event-v1.md`. Define the wire contract and collector, using failing tests first. You are not alone in this codebase: do not revert others' edits; accommodate the current file-led journey. Leave `.vibe-wise/` alone. Work in your own worktree. Do not edit `index.ts` or UI files. Commit your owned changes, then report commit hash, exact exports, tests run, and any unresolved issue.

**Agent B**

> From the reviewed Task A commit, implement Task B in `docs/superpowers/plans/2026-10-04-live-agent-activity.md`. Read the linked spec and `docs/product/activity-event-v1.md`. You own only Claude hook/plugin files under `.claude-plugin/hooks/`, `packages/cli/src/activity/adapters/claude.ts`, a hook-forwarding script in `packages/cli/scripts/`, and their tests. You are not alone in this codebase: do not revert others' edits. Use your own worktree; do not edit the collector, `index.ts`, or UI. Verify against current Claude hook docs and the installed version, validate the plugin, and commit. Report commit hash, event mapping, tests, and actual live-hook evidence.

**Agent C**

> From the reviewed Task A commit, implement Task C in `docs/superpowers/plans/2026-10-04-live-agent-activity.md`. Read the linked spec and `docs/product/activity-event-v1.md`. You own only `packages/visualizer/src/activity/` and its tests/styles. You are not alone in this codebase: do not revert others' edits. Work in your own worktree. Make the live activity panel understandable to a beginner and accessible; use fixture events and expose a source-open callback. Do not edit `App.tsx`, `TopBar.tsx`, CLI, or plugin files. Commit and report hash, tests, build result, and a screenshot or concise visual description.

**Agent D**

> From the reviewed Task A commit, implement Task D in `docs/superpowers/plans/2026-10-04-live-agent-activity.md`. Read the linked spec and `docs/product/activity-event-v1.md`. You own only `packages/cli/src/activity/adapters/codex.ts`, `codex-runner.ts`, and their tests. You are not alone in this codebase: do not revert others' edits. Work in your own worktree. Use `codex exec --json` JSONL, not terminal scraping or private session files. Do not edit the collector, `index.ts`, UI, or plugin. Commit and report hash, fixture provenance, tests, and exact Codex CLI limitations.
