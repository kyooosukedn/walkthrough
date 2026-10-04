# Source-linked agent teaching notes implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. Write failing tests first and verify each completed task.

**Goal:** Add explicit `--teach` mode to observed Claude/Codex sessions and show one validated, agent-authored source-linked note per completed response.

**Architecture:** A shared parser accepts only a marked line with a safe existing repo file. The Claude Stop hook and Codex JSONL adapter emit `kind: message` through the existing collector. The UI distinguishes the agent's claim from observed action events.

**Tech Stack:** Node.js CLI, Claude Code hooks, Codex JSONL, React/Vitest.

**Spec:** [Source-linked agent teaching notes](../specs/2026-10-04-agent-teaching-notes-design.md)

## Global constraints

- Explicit opt-in; no extra model process or provider key.
- No raw final answers, prompts, reasoning, source, or command output in events.
- File paths checked inside the checkout, including symlink targets.
- Existing activity and source preview flow must keep working without `--teach`.

## Review focus

- A malicious or malformed note cannot put secret text or a foreign path in the feed.
- A missing note cannot suppress observed completion events.
- Codex reasoning and non-final agent messages never become notes.
- Claude hook stdout remains valid JSON only when teach mode asks for context.
- An invalid cited path cannot become a clickable source link.

## Task 1: shared note boundary

**Files:** `packages/cli/src/activity/teaching-note.ts`, `teaching-note.test.ts`.

- [x] Test valid marked note, missing marker, overlong text, secret text, path traversal, symlink escape, missing file, and secret filename. Run the test and see it fail.
- [x] Implement one strict parser and one static teaching instruction. Run targeted test and CLI typecheck.
- [x] Commit.

## Task 2: host adapters

**Files:** Claude adapter, hook script, Codex adapter/runner, CLI `index.ts`, and tests.

- [x] Test Claude opt-in marked Stop message and static SessionStart context. Verify ordinary hooks remain silent and safe.
- [x] Test Codex's documented `agent_message` item, reasoning exclusion, and one note per completed turn. Verify ordinary mode still drops messages.
- [x] Wire `--teach` through CLI; append instruction to Codex task and set Claude hook env only when requested.
- [x] Run targeted host/collector tests and build. Commit.

## Task 3: learner-facing result and release check

**Files:** Activity panel/styles/tests, README, `docs/AGENT_COMPANION.md`, event contract.

- [x] Render teaching note with **Agent said**, an explicit check-the-source cue, and existing source link. Test it.
- [x] Document exact command, privacy boundary, source-link meaning, and host limitations.
- [x] Run build, typecheck, tests, plugin validation, and one real or fixture host run per adapter. Review and push a draft PR stacked on the packaged observer PR.

Verification: 26 scanner, 12 visualizer, and 45 CLI tests passed on 4 October 2026; full build, typecheck, and Claude plugin validation passed. A fresh review found three note-integrity and source-preview issues. Each was reproduced with a failing test, fixed, and covered by the passing suite. Host fixtures were used; a live `--teach` agent run remains a product trial after this draft PR.
